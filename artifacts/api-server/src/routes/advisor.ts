import { Router, type IRouter } from "express";
import { db, sessionsTable, toolsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { AnalyzeProjectBody, GetSessionParams } from "@workspace/api-zod";
import { analyzeProjectWithAI, type ProjectInput } from "../lib/advisorEngine.js";
import { TOOL_CATEGORIES } from "../lib/gameDevTools.js";

const router: IRouter = Router();

router.post("/advisor/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data as ProjectInput;

  const analysis = await analyzeProjectWithAI(input);
  const { categoryResults, projectSummary, detectedProjectType, finalSummary, stackOverview, overallConfidence } = analysis;

  // Build categories array for storage
  const categories = TOOL_CATEGORIES.filter((cat) => categoryResults[cat.id]).map((cat) => {
    const cr = categoryResults[cat.id];
    return {
      category: cat.id,
      categoryLabel: cat.label,
      topPick: {
        toolId: 0,
        toolName: cr.topTool.name,
        score: cr.topTool.score,
        reasoning: cr.topTool.reasoning,
        strengths: cr.topTool.strengths,
        weaknesses: cr.topTool.weaknesses,
        tradeoffs: cr.topTool.weaknesses[0] ?? "",
        isTopPick: true,
      },
      alternatives: cr.alternatives.map((alt) => ({
        toolId: 0,
        toolName: alt.name,
        score: alt.score,
        reasoning: alt.reasoning,
        strengths: alt.strengths,
        weaknesses: alt.weaknesses,
        tradeoffs: alt.weaknesses[0] ?? "",
        isTopPick: false,
      })),
      categoryReasoning: cr.topTool.reasoning,
    };
  });

  // Resolve tool IDs from DB
  const dbTools = await db.select().from(toolsTable);
  const toolIdMap: Record<string, number> = {};
  for (const t of dbTools) {
    toolIdMap[t.name] = t.id;
  }

  for (const cat of categories) {
    cat.topPick.toolId = toolIdMap[cat.topPick.toolName] ?? 0;
    for (const alt of cat.alternatives) {
      alt.toolId = toolIdMap[alt.toolName] ?? 0;
    }
  }

  const resultObj = {
    projectSummary,
    detectedProjectType,
    categories,
    overallConfidence,
    finalSummary,
    stackOverview,
    sessionId: 0,
  };

  const [session] = await db
    .insert(sessionsTable)
    .values({
      projectIdea: input.projectIdea,
      projectInput: input as object,
      detectedProjectType,
      stackOverview,
      overallConfidence,
      result: resultObj as object,
    })
    .returning();

  resultObj.sessionId = session.id;

  res.json(resultObj);
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
    const result = s.result as { categories?: { category: string; topPick: { toolName: string } }[]; overallConfidence?: number };
    if (result?.overallConfidence) totalConfidence += result.overallConfidence;
    if (result?.categories) {
      for (const cat of result.categories) {
        const toolName = cat.topPick?.toolName;
        if (toolName) {
          toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
        }
        catCounts[cat.category] = (catCounts[cat.category] ?? 0) + 1;
      }
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
