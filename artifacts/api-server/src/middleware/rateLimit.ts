import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;
const RETRY_AFTER_SECONDS = 60;

const store = new Map<string, number[]>();

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? "unknown";
  const now = Date.now();
  const recentTimestamps = (store.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);

  if (recentTimestamps.length >= MAX_REQUESTS) {
    res.setHeader("Retry-After", String(RETRY_AFTER_SECONDS));
    res.status(429).json({
      error: "Too many requests. Please wait 60 seconds before trying again.",
    });
    return;
  }

  recentTimestamps.push(now);
  store.set(ip, recentTimestamps);
  next();
}
