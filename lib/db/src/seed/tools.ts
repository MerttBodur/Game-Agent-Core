import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import mysql, { type RowDataPacket } from "mysql2/promise";

type CatalogTool = {
  id: string;
  name: string;
  category: string;
  description?: string;
  pricing?: string;
  supportedPlatforms?: string[];
  pros?: string[];
  cons?: string[];
  website?: string;
  rating?: number;
  compatibleEngines?: string[];
  toolType?: "builtin" | "plugin" | "asset" | "external" | "service";
  lastUpdated?: string;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../../artifacts/api-server/.env") });

if (!process.env.MYSQL_URL) {
  throw new Error("MYSQL_URL must be set. Did you forget to start docker compose?");
}

const pool = mysql.createPool(process.env.MYSQL_URL);
const catalogPath = resolve(__dirname, "../../../../artifacts/api-server/src/data/toolCatalog.json");

const priceMap: Record<string, "free" | "freemium" | "paid" | "subscription"> = {
  free: "free",
  freemium: "freemium",
  paid: "paid",
  subscription: "subscription",
  open_source: "free",
};

function inferToolType(category: string): "builtin" | "plugin" | "asset" | "external" | "service" {
  if (category === "game_engine") return "builtin";
  if (category === "art_asset_creation") return "asset";
  if (category === "deployment_publishing") return "service";
  if (category === "ai_coding_assistant") return "service";
  return "external";
}

function inferCompatibleEngines(tool: CatalogTool): string[] {
  if (Array.isArray(tool.compatibleEngines) && tool.compatibleEngines.length > 0) {
    return tool.compatibleEngines;
  }

  if (tool.id === "unity") return ["Unity"];
  if (tool.id === "unreal_engine") return ["Unreal"];
  if (tool.id === "godot") return ["Godot"];
  return ["Custom"];
}

async function main() {
  const raw = await readFile(catalogPath, "utf8");
  const catalog = JSON.parse(raw) as CatalogTool[];

  const upsertSql = `
    INSERT INTO tools (
      id, name, leaf_category, description, price_model, compatible_engines, tool_type,
      platforms, pros, cons, url, rating, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      name = VALUES(name),
      leaf_category = VALUES(leaf_category),
      description = VALUES(description),
      price_model = VALUES(price_model),
      compatible_engines = VALUES(compatible_engines),
      tool_type = VALUES(tool_type),
      platforms = VALUES(platforms),
      pros = VALUES(pros),
      cons = VALUES(cons),
      url = VALUES(url),
      rating = VALUES(rating),
      last_updated = VALUES(last_updated)
  `;

  for (const tool of catalog) {
    const priceModel = priceMap[tool.pricing ?? ""] ?? "free";
    const toolType = tool.toolType ?? inferToolType(tool.category);
    const compatibleEngines = inferCompatibleEngines(tool);

    const rating = typeof tool.rating === "number" ? tool.rating : 0;

    await pool.execute(upsertSql, [
      tool.id,
      tool.name,
      tool.category,
      tool.description ?? null,
      priceModel,
      JSON.stringify(compatibleEngines),
      toolType,
      JSON.stringify(tool.supportedPlatforms ?? []),
      JSON.stringify(tool.pros ?? []),
      JSON.stringify(tool.cons ?? []),
      tool.website ?? null,
      rating,
      tool.lastUpdated ?? null,
    ]);
  }

  const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM tools");
  const count = Number(rows[0]?.count ?? 0);
  console.log(`Seeded tools with upsert: catalog=${catalog.length}, db=${count}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
