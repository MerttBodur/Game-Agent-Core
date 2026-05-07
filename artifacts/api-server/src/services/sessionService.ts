import { db, sessionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import type { AnalysisResult } from "../types/recommendation.js";

export interface PersistedSessionInput {
  id: string;
  inputs: Record<string, unknown>;
  result: AnalysisResult;
}

export async function persistSession(s: PersistedSessionInput): Promise<void> {
  await db.insert(sessionsTable).values({
    id: s.id,
    inputs: s.inputs,
    result: s.result as unknown as Record<string, unknown>,
    trustScore: s.result.trustScore,
    trustTier: s.result.trustTier,
  });
}

export async function listRecentSessions(limit = 50) {
  return db
    .select({
      id: sessionsTable.id,
      inputs: sessionsTable.inputs,
      trustScore: sessionsTable.trustScore,
      trustTier: sessionsTable.trustTier,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(limit);
}

export async function findSessionById(id: string) {
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
  return row;
}

export async function listAllSessionResults() {
  return db.select({ result: sessionsTable.result }).from(sessionsTable);
}
