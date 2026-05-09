import { pool } from "@workspace/db";
import type { RowDataPacket } from "mysql2";

export type ConstraintType = "engine_locked" | "feature_required" | "context_dependent";

export interface ConstraintRow {
  id: number;
  engine: string;
  category: string;
  constraintType: ConstraintType;
  conditionJson: Record<string, unknown> | null;
  resultJson: Record<string, unknown>;
  priority: number;
}

interface ConstraintSqlRow extends RowDataPacket {
  id: number;
  engine: string;
  category: string;
  constraint_type: ConstraintType;
  condition_json: string | Record<string, unknown> | null;
  result_json: string | Record<string, unknown>;
  priority: number;
}

export async function resolveConstraint(
  category: string,
  engine: string,
): Promise<ConstraintRow | null> {
  const [rows] = await pool.query<ConstraintSqlRow[]>(
    `SELECT id, engine, category, constraint_type, condition_json, result_json, priority
     FROM engine_constraints
     WHERE category = ?
       AND engine IN (?, '*')
     ORDER BY (engine = ?) DESC, priority DESC
     LIMIT 1`,
    [category, engine, engine],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    engine: row.engine,
    category: row.category,
    constraintType: row.constraint_type,
    conditionJson: parseJsonObject(row.condition_json),
    resultJson: parseJsonObject(row.result_json) ?? {},
    priority: row.priority,
  };
}

function parseJsonObject(
  value: string | Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (value === null) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
