import { mysqlTable, char, json, timestamp, varchar, int } from "drizzle-orm/mysql-core";

export const sessionsTable = mysqlTable("advisor_sessions", {
  id: char("id", { length: 36 }).primaryKey(),
  inputs: json("inputs").$type<Record<string, unknown>>().notNull(),
  result: json("result").$type<Record<string, unknown>>().notNull(),
  trustScore: int("trust_score").notNull().default(0),
  trustTier: varchar("trust_tier", { length: 8 }).notNull().default("pass"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
