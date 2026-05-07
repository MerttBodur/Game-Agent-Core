import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { db, sessionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { AnalyzeProjectBody } from "@workspace/api-zod";
import { retrieveAdvisorKnowledge, type ProjectInput } from "../lib/advisorEngine.js";
import { reason } from "../services/reasoningService.js";
import type { AnalysisResult } from "../types/recommendation.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router: IRouter = Router();

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
    const { retrieval } = await retrieveAdvisorKnowledge(input);
    send("retrieval_complete", { retrieval });

    const reasoning = await reason(
      {
        projectIdea: input.projectIdea,
        budget: input.budget,
        timeLimit: input.timeLimit,
        skillLevel: input.skillLevel,
        teamSize: input.teamSize,
        platformTarget: input.platformTarget,
        artCapability: input.artCapability,
        otherConstraints: input.otherConstraints,
        pinnedToolIds: input.pinnedToolIds ?? [],
      },
      retrieval,
    );

    const terminated = reasoning.trustTier === "block";
    const sessionId = terminated ? "" : randomUUID();

    const result: AnalysisResult = {
      ...reasoning,
      sessionId,
      terminated,
    };

    if (!terminated) {
      await db.insert(sessionsTable).values({
        id: sessionId,
        inputs: input as unknown as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
        trustScore: result.trustScore,
        trustTier: result.trustTier,
      });
    }

    send("done", result);
    res.end();
  } catch (error) {
    console.error("Advisor pipeline failed", error);
    send("error", { message: "Analysis failed." });
    res.end();
  }
});

router.get("/advisor/sessions", async (_req, res): Promise<void> => {
  const rows = await db
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
    rows.map((s) => ({
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

  const toolCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  let totalConfidence = 0;

  for (const s of sessions) {
    const result = s.result as unknown as AnalysisResult;
    const recs = result.recommendations ?? [];
    for (const rec of recs) {
      const tn = rec.primary.toolId;
      toolCounts[tn] = (toolCounts[tn] ?? 0) + 1;
      catCounts[rec.category] = (catCounts[rec.category] ?? 0) + 1;
    }
    totalConfidence += result.trustScore ?? 0;
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
