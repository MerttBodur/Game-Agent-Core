import { index, int, json, mysqlEnum, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const engineConstraintsTable = mysqlTable(
  "engine_constraints",
  {
    id: int("id").autoincrement().primaryKey(),
    engine: varchar("engine", { length: 32 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    constraintType: mysqlEnum("constraint_type", [
      "engine_locked",
      "feature_required",
      "context_dependent",
    ]).notNull(),
    conditionJson: json("condition_json").$type<Record<string, unknown> | null>(),
    resultJson: json("result_json").$type<Record<string, unknown>>().notNull(),
    priority: int("priority").notNull().default(0),
  },
  (table) => ({
    lookupIdx: index("idx_lookup").on(table.category, table.engine),
  }),
);

export type EngineConstraint = typeof engineConstraintsTable.$inferSelect;
export type InsertEngineConstraint = typeof engineConstraintsTable.$inferInsert;
