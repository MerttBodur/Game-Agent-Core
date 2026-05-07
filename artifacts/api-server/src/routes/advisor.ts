import { Router, type IRouter } from "express";
import { db, sessionsTable, toolsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { AnalyzeProjectBody, GetSessionParams } from "@workspace/api-zod";
import {
  buildCategoryResults,
  generateMetadataWithAI,
  retrieveAdvisorKnowledge,
  streamFinalSummaryWithAI,
  type CategoryResults,
  type ProjectInput,
} from "../lib/advisorEngine.js";
import { TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router: IRouter = Router();

function toRecommendationDTO(
  entry: import("../lib/advisorEngine.js").CategoryEntry,
  ragChunks: Array<{ text: string; source: string; score?: number | null }>,
  toolIdMap: Record<string, number>,
) {
  const label = TOOL_CATEGORIES.find((c) => c.id === entry.category)?.label ?? entry.category;
  return {
    category: entry.category,
    categoryLabel: label,
    topPick: {
      toolId: toolIdMap[entry.topTool.name] ?? 0,
      toolName: entry.topTool.name,
      score: entry.topTool.score,
      reasoning: entry.topTool.reasoning,
      evidence: { scoreBreakdown: entry.topTool.scoreBreakdown, ragChunks },
      strengths: entry.topTool.strengths,
      weaknesses: entry.topTool.weaknesses,
      tradeoffs: entry.topTool.weaknesses[0] ?? "",
      isTopPick: true,
    },
    alternatives: entry.alternatives.map((alt) => ({
      toolId: toolIdMap[alt.name] ?? 0,
      toolName: alt.name,
      score: alt.score,
      reasoning: alt.reasoning,
      evidence: { scoreBreakdown: alt.scoreBreakdown, ragChunks },
      strengths: alt.strengths,
      weaknesses: alt.weaknesses,
      tradeoffs: alt.weaknesses[0] ?? "",
      isTopPick: false,
    })),
    categoryReasoning: entry.topTool.reasoning,
  };
}

type CategoryRecommendationDTO = ReturnType<typeof toRecommendationDTO>;

function buildCategoryResultsResponse(
  categoryResults: CategoryResults,
  ragChunks: Array<{ text: string; source: string; score?: number | null }>,
  toolIdMap: Record<string, number>,
): { locked: CategoryRecommendationDTO[]; flexible: CategoryRecommendationDTO[]; hidden: string[] } {
  return {
    locked: categoryResults.locked.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    flexible: categoryResults.flexible.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    hidden: categoryResults.hidden,
  };
}

router.post("/advisor/analyze", rateLimit, async (req, res): Promise<void> => {
  const parsed = AnalyzeProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data as ProjectInput;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const categoryResults = buildCategoryResults(input); // projectMode default = single_player
    const dbTools = await db.select().from(toolsTable);
    const toolIdMap: Record<string, number> = {};
    for (const t of dbTools) toolIdMap[t.name] = t.id;

    const earlyResults = buildCategoryResultsResponse(categoryResults, [], toolIdMap);
    send("scoring_complete", { categoryResults: earlyResults });

    const { ragChunks, retrievedKnowledgeContext } = await retrieveAdvisorKnowledge(input);
    const metadata = await generateMetadataWithAI(input, categoryResults, retrievedKnowledgeContext);
    send("metadata_complete", metadata);

    const finalSummary = await streamFinalSummaryWithAI(
      input,
      metadata,
      categoryResults,
      retrievedKnowledgeContext,
      (token) => send("narrative_chunk", { token }),
    );

    const finalResults = buildCategoryResultsResponse(categoryResults, ragChunks, toolIdMap);

    const resultObj = {
      sessionId: 0,
      projectSummary: metadata.projectSummary,
      detectedProjectType: metadata.detectedProjectType,
      categoryResults: finalResults,
      overallConfidence: metadata.overallConfidence,
      finalSummary:
        finalSummary ||
        "This stack has been selected based on your budget, skill level, and platform targets.",
      stackOverview: metadata.stackOverview,
      // Step 4 will populate the feasibility fields with real heuristic output. Stubbed
      // pass-through values keep the OpenAPI-required fields satisfied without changing
      // tier behavior - score 100 / tier "pass" means nothing gets blocked yet.
      ideaScore: 100,
      ideaScoreTier: "pass",
      mismatchReasons: [] as string[],
      archetype: {
        implied: { scope: "indie" },
        achievable: { scope: "indie" },
      },
      projectMode: "single_player",
      feasibilityOverridden: false,
    };

    const [session] = await db
      .insert(sessionsTable)
      .values({
        projectIdea: input.projectIdea,
        projectInput: input as object,
        detectedProjectType: metadata.detectedProjectType,
        stackOverview: metadata.stackOverview,
        overallConfidence: metadata.overallConfidence,
        result: resultObj as object,
      })
      .returning();

    resultObj.sessionId = session.id;

    send("done", resultObj);
    res.end();
  } catch (error) {
    console.error("Advisor streaming failed", error);
    send("error", { message: "Analysis failed." });
    res.end();
  }
});

router.get("/advisor/sessions", async (_req, res): Promise<void> => {
  const sessions = await db
    .select({
      id: sessionsTable.id,
      projectIdea: sessionsTable.projectIdea,
      detectedProjectType: sessionsTable.detectedProjectType,
      stackOverview: sessionsTable.stackOverview,
      overallConfidence: sessionsTable.overallConfidence,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(50);

  res.json(sessions);
});

router.get("/advisor/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    id: session.id,
    projectInput: session.projectInput,
    result: session.result,
    createdAt: session.createdAt,
  });
});

router.get("/advisor/stats", async (_req, res): Promise<void> => {
  const [totalRow] = await db.select({ count: sql<number>`count(*)` }).from(sessionsTable);
  const totalAnalyses = Number(totalRow?.count ?? 0);

  const sessions = await db.select({ result: sessionsTable.result }).from(sessionsTable);

  // Count tool recommendations
  const toolCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  let totalConfidence = 0;

  for (const s of sessions) {
    const result = s.result as {
      categories?: { category: string; topPick: { toolName: string } }[];
      categoryResults?: {
        locked?: { category: string; topPick: { toolName: string } }[];
        flexible?: { category: string; topPick: { toolName: string } }[];
      };
      overallConfidence?: number;
    };
    if (result?.overallConfidence) totalConfidence += result.overallConfidence;

    const cats = [
      ...(result?.categories ?? []),
      ...(result?.categoryResults?.locked ?? []),
      ...(result?.categoryResults?.flexible ?? []),
    ];
    for (const cat of cats) {
      const toolName = cat.topPick?.toolName;
      if (toolName) toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
      catCounts[cat.category] = (catCounts[cat.category] ?? 0) + 1;
    }
  }

  const topRecommendedTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([toolName, count]) => ({ toolName, count }));

  const popularCategories = Object.entries(catCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }));

  res.json({
    totalAnalyses,
    topRecommendedTools,
    popularCategories,
    avgConfidenceScore: totalAnalyses > 0 ? Math.round(totalConfidence / totalAnalyses) : 0,
  });
});

export default router;
