import type { Request, Response } from "express";
import { runAdvisorPipeline, type AdvisorInput } from "../orchestrators/advisorOrchestrator.js";
import {
  findSessionById,
  listAllSessionResults,
  listRecentSessions,
} from "../services/sessionService.js";
import type { AnalysisResult } from "../types/recommendation.js";

export async function analyze(req: Request, res: Response): Promise<void> {
  const input = req.body as AdvisorInput;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runAdvisorPipeline(input, (event) => {
      if (event.type === "analyze_complete") {
        send("analyze_complete", event.analyze);
      } else if (event.type === "engine_picked") {
        send("engine_picked", event.engineDecision);
      } else if (event.type === "retrieval_retry") {
        send("retrieval_retry", event.retry);
      } else if (event.type === "retrieval_complete") {
        send("retrieval_complete", event.retrieval);
      } else if (event.type === "done") {
        send("done", event.result);
      }
    });

    res.end();
  } catch (error) {
    console.error("Advisor pipeline failed", error);
    send("error", { message: "Analysis failed." });
    res.end();
  }
}

export async function listSessions(_req: Request, res: Response): Promise<void> {
  const rows = await listRecentSessions(50);

  res.json(
    rows.map((s) => ({
      id: s.id,
      projectIdea: (s.inputs as { projectIdea?: string }).projectIdea ?? "",
      trustScore: s.trustScore,
      trustTier: s.trustTier,
      createdAt: s.createdAt,
    })),
  );
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({ error: "id is required" });
    return;
  }

  const session = await findSessionById(id);
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
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  const sessions = await listAllSessionResults();

  const toolCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  let totalConfidence = 0;
  let totalAnalyses = 0;

  for (const s of sessions) {
    const result = s.result as unknown as AnalysisResult;
    totalAnalyses += 1;
    totalConfidence += result.trustScore ?? 0;

    for (const rec of result.recommendations ?? []) {
      const toolName = rec.primary.toolId;
      toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
      catCounts[rec.category] = (catCounts[rec.category] ?? 0) + 1;
    }
  }

  res.json({
    totalAnalyses,
    topRecommendedTools: Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([toolName, count]) => ({ toolName, count })),
    popularCategories: Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => ({ category, count })),
    avgConfidenceScore: totalAnalyses > 0 ? Math.round(totalConfidence / totalAnalyses) : 0,
  });
}
