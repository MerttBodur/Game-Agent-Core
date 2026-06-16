import { mysqlTable, char, json, timestamp } from "drizzle-orm/mysql-core";

export const sessionsTable = mysqlTable("advisor_sessions", {
  id: char("id", { length: 36 }).primaryKey(),
  inputs: json("inputs").$type<Record<string, unknown>>().notNull(),
  result: json("result").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
