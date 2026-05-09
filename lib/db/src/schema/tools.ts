import {
  date,
  decimal,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";

export const toolsTable = mysqlTable(
  "tools",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 128 }).notNull(),
    leafCategory: varchar("leaf_category", { length: 64 }).notNull(),
    description: text("description"),
    priceModel: mysqlEnum("price_model", ["free", "freemium", "paid", "subscription"]).notNull(),
    compatibleEngines: json("compatible_engines").$type<string[]>().notNull(),
    toolType: mysqlEnum("tool_type", ["builtin", "plugin", "asset", "external", "service"]).notNull(),
    platforms: json("platforms").$type<string[]>().notNull(),
    pros: json("pros").$type<string[] | null>(),
    cons: json("cons").$type<string[] | null>(),
    url: varchar("url", { length: 512 }),
    rating: decimal("rating", { precision: 3, scale: 2 }).notNull().default("0.00"),
    lastUpdated: date("last_updated"),
  },
  (table) => ({
    leafCategoryIdx: index("idx_leaf_category").on(table.leafCategory),
    priceModelIdx: index("idx_price_model").on(table.priceModel),
  }),
);

export type Tool = typeof toolsTable.$inferSelect;
export type InsertTool = typeof toolsTable.$inferInsert;
