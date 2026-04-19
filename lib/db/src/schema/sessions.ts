import { pgTable, text, serial, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionsTable = pgTable("advisor_sessions", {
  id: serial("id").primaryKey(),
  projectIdea: text("project_idea").notNull(),
  projectInput: jsonb("project_input").notNull(),
  detectedProjectType: text("detected_project_type").notNull(),
  stackOverview: text("stack_overview").notNull(),
  overallConfidence: real("overall_confidence").notNull(),
  result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
