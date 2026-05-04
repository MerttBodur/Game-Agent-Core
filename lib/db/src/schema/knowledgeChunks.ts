import { customType, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
  configRequired: true;
}>({
  dataType(config) {
    return `vector(${config.dimensions})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
});

export const knowledgeChunksTable = pgTable("knowledge_chunks", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
  embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KnowledgeChunk = typeof knowledgeChunksTable.$inferSelect;
export type InsertKnowledgeChunk = typeof knowledgeChunksTable.$inferInsert;
