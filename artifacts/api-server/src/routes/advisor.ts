import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, sessionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { AnalyzeProjectBody } from "@workspace/api-zod";
import {
  buildCategoryResults,
  generateMetadataWithAI,
  hiddenCategoriesForMode,
  heuristicIdeaScore,
  retrieveAdvisorKnowledge,
  streamFinalSummaryWithAI,
  tierFromScore,
  type CategoryResults,
  type ProjectMode,
  type ProjectInput,
} from "../lib/advisorEngine.js";
import { GAME_DEV_TOOLS, TOOL_CATEGORIES, type GameDevTool } from "../lib/gameDevTools.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router: IRouter = Router();
const dedup = <T>(items: T[]): T[] => Array.from(new Set(items));

function toRecommendationDTO(
  entry: import("../lib/advisorEngine.js").CategoryEntry,
  ragChunks: Array<{ text: string; source: string; score?: number | null }>,
  toolIdMap: Record<string, string>,
) {
  const label = TOOL_CATEGORIES.find((c) => c.id === entry.category)?.label ?? entry.category;
  return {
    category: entry.category,
    categoryLabel: label,
    topPick: {
      toolId: toolIdMap[entry.topTool.name] ?? "",
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
      toolId: toolIdMap[alt.name] ?? "",
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
  toolIdMap: Record<string, string>,
  projectMode: ProjectMode,
): {
  locked: CategoryRecommendationDTO[];
  flexible: CategoryRecommendationDTO[];
  hidden: string[];
  candidatePool: Record<string, GameDevTool[]>;
} {
  const hidden = new Set(hiddenCategoriesForMode(projectMode));
  const candidatePool: Record<string, GameDevTool[]> = {};
  for (const cat of TOOL_CATEGORIES) {
    if (hidden.has(cat.id)) continue;
    candidatePool[cat.id] = GAME_DEV_TOOLS.filter((t) => t.category === cat.id);
  }

  return {
    locked: categoryResults.locked.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    flexible: categoryResults.flexible.map((e) => toRecommendationDTO(e, ragChunks, toolIdMap)),
    hidden: categoryResults.hidden,
    candidatePool,
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
    const { ragChunks, retrievedKnowledgeContext } = await retrieveAdvisorKnowledge(input);
    const provisionalCategoryResults = buildCategoryResults(
      input,
      "single_player",
      "indie",
      input.projectIdea.slice(0, 64),
    );
    const metadata = await generateMetadataWithAI(
      input,
      provisionalCategoryResults,
      retrievedKnowledgeContext,
    );

    const heuristic = heuristicIdeaScore({
      input,
      impliedScope: metadata.impliedScope,
      achievableScope: metadata.achievableScope,
    });
    const ideaScore = heuristic.score;
    const ideaScoreTier = tierFromScore(ideaScore);
    const mismatchReasons = dedup([...heuristic.reasons, ...metadata.mismatchReasons]);

    send("metadata_complete", {
      projectSummary: metadata.projectSummary,
      detectedProjectType: metadata.detectedProjectType,
      stackOverview: metadata.stackOverview,
      overallConfidence: metadata.overallConfidence,
      ideaScore,
      ideaScoreTier,
      mismatchReasons,
      archetype: {
        implied: { scope: metadata.impliedScope },
        achievable: { scope: metadata.achievableScope },
      },
      projectMode: metadata.projectMode,
    });

    if (ideaScoreTier === "block" && !input.adviseAnyway) {
      const blockedResult = {
        sessionId: "",
        projectSummary: metadata.projectSummary,
        detectedProjectType: metadata.detectedProjectType,
        categoryResults: null,
        overallConfidence: metadata.overallConfidence,
        finalSummary: null,
        stackOverview: null,
        ideaScore,
        ideaScoreTier,
        mismatchReasons,
        archetype: {
          implied: { scope: metadata.impliedScope },
          achievable: { scope: metadata.achievableScope },
        },
        projectMode: metadata.projectMode,
        feasibilityOverridden: false,
      };

      const sessionId = randomUUID();
      blockedResult.sessionId = sessionId;
      await db.insert(sessionsTable).values({
        id: sessionId,
        inputs: input as unknown as Record<string, unknown>,
        result: blockedResult as Record<string, unknown>,
      });
      send("done", blockedResult);
      res.end();
      return;
    }

    const categoryResults = buildCategoryResults(
      input,
      metadata.projectMode,
      metadata.achievableScope,
      input.projectIdea.slice(0, 64),
    );

    const toolIdMap: Record<string, string> = Object.fromEntries(
      GAME_DEV_TOOLS.map((t) => [t.name, t.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")]),
    );

    send("scoring_complete", {
      categoryResults: buildCategoryResultsResponse(
        categoryResults,
        [],
        toolIdMap,
        metadata.projectMode,
      ),
    });

    const finalSummary = await streamFinalSummaryWithAI(
      input,
      metadata,
      categoryResults,
      retrievedKnowledgeContext,
      (token) => send("narrative_chunk", { token }),
    );

    const finalResults = buildCategoryResultsResponse(
      categoryResults,
      ragChunks,
      toolIdMap,
      metadata.projectMode,
    );

    const resultObj = {
      sessionId: "",
      projectSummary: metadata.projectSummary,
      detectedProjectType: metadata.detectedProjectType,
      categoryResults: finalResults,
      overallConfidence: metadata.overallConfidence,
      finalSummary:
        finalSummary ||
        "This stack has been selected based on your budget, skill level, and platform targets.",
      stackOverview: metadata.stackOverview,
      ideaScore,
      ideaScoreTier,
      mismatchReasons,
      archetype: {
        implied: { scope: metadata.impliedScope },
        achievable: { scope: metadata.achievableScope },
      },
      projectMode: metadata.projectMode,
      feasibilityOverridden: input.adviseAnyway === true && ideaScoreTier === "block",
    };

    const sessionId = randomUUID();
    resultObj.sessionId = sessionId;
    await db.insert(sessionsTable).values({
      id: sessionId,
      inputs: input as unknown as Record<string, unknown>,
      result: resultObj as Record<string, unknown>,
    });

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
      inputs: sessionsTable.inputs,
      trustScore: sessionsTable.trustScore,
      trustTier: sessionsTable.trustTier,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(50);

  res.json(
    sessions.map((s) => ({
      id: s.id,
      projectIdea: (s.inputs as { projectIdea?: string }).projectIdea ?? "",
      trustScore: s.trustScore,
      trustTier: s.trustTier,
      createdAt: s.createdAt,
    })),
  );
});

router.get("/advisor/sessions/:id", async (req, res): Promise<void> => {
  const id = req.params.id;
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    id: session.id,
    projectInput: session.inputs,
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
