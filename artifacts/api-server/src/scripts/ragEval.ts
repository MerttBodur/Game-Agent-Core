import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { retrieveEngineDocs, retrieveForCategory } from "../lib/rag/retriever.js";
import type { Category, EngineName } from "../types/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MRR_FLOOR = 0.5;
const K = 5;

interface GoldCase {
  name: string;
  query: string;
  category: Category;
  picked?: EngineName;
  relevantToolIds: string[];
}

function loadCases(): GoldCase[] {
  return JSON.parse(readFileSync(resolve(__dirname, "../data/eval/goldset.json"), "utf8"));
}

async function retrieve(c: GoldCase): Promise<string[]> {
  if (c.category === "game_engine") return (await retrieveEngineDocs(c.query)).toolIds;
  return (await retrieveForCategory(c.query, c.category)).toolIds;
}

function metrics(retrieved: string[], relevant: string[]) {
  const topK = retrieved.slice(0, K);
  const rel = new Set(relevant);
  const hits = topK.filter((id) => rel.has(id)).length;
  const recall = relevant.length ? hits / relevant.length : 0;
  const precision = topK.length ? hits / topK.length : 0;
  const firstRank = topK.findIndex((id) => rel.has(id));
  const rr = firstRank === -1 ? 0 : 1 / (firstRank + 1);
  return { recall, precision, rr };
}

async function main(): Promise<void> {
  const cases = loadCases();
  let sumR = 0, sumP = 0, sumRR = 0;
  console.log(`name`.padEnd(38), "R@K", "P@K", "MRR", "retrieved");
  for (const c of cases) {
    const ids = await retrieve(c);
    const { recall, precision, rr } = metrics(ids, c.relevantToolIds);
    sumR += recall; sumP += precision; sumRR += rr;
    console.log(
      c.name.padEnd(38),
      recall.toFixed(2), precision.toFixed(2), rr.toFixed(2),
      `[${ids.slice(0, K).join(", ")}]`,
    );
  }
  const n = cases.length || 1;
  const meanRR = sumRR / n;
  console.log("\n--- aggregate ---");
  console.log(`Recall@${K}: ${(sumR / n).toFixed(3)}  Precision@${K}: ${(sumP / n).toFixed(3)}  MRR: ${meanRR.toFixed(3)}`);
  if (meanRR < MRR_FLOOR) {
    console.error(`FAIL: MRR ${meanRR.toFixed(3)} below floor ${MRR_FLOOR}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
