import type { NextFunction, Request, Response } from "express";
import { validateProjectIdea } from "../lib/security/promptGuard.js";

// Layer 1 adapter: runs the pure projectIdea guard after schema validation and
// before the SSE pipeline opens. Blocks return 400 with no LLM call.
export function inputGuard(req: Request, res: Response, next: NextFunction): void {
  const idea = (req.body as { projectIdea?: unknown }).projectIdea;
  if (typeof idea !== "string") {
    res.status(400).json({ error: "projectIdea is required" });
    return;
  }
  const result = validateProjectIdea(idea);
  if (!result.allowed) {
    res.status(400).json({ error: "projectIdea rejected by input validation." });
    return;
  }
  next();
}
