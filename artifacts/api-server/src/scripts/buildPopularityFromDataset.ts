import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Scope = "jam" | "prototype" | "indie" | "AA" | "AAA";

interface GameEntry {
  title: string;
  archetype: Scope;
  engine: string;
  language: string;
}

const SCOPES: Scope[] = ["jam", "prototype", "indie", "AA", "AAA"];

const datasetPath = resolve(process.cwd(), "src/lib/games-dataset/games.json");
const outputPath = resolve(process.cwd(), "src/lib/games-dataset/popularity.json");

const raw = readFileSync(datasetPath, "utf8");
const games = JSON.parse(raw) as GameEntry[];

const counts: Record<string, Record<Scope, number>> = {};
const totalsByScope: Record<Scope, number> = { jam: 0, prototype: 0, indie: 0, AA: 0, AAA: 0 };

function bump(toolName: string, scope: Scope): void {
  const key = toolName.trim();
  if (!key) return;
  if (!counts[key]) counts[key] = { jam: 0, prototype: 0, indie: 0, AA: 0, AAA: 0 };
  counts[key][scope] += 1;
}

for (const g of games) {
  if (!SCOPES.includes(g.archetype)) continue;
  totalsByScope[g.archetype] += 1;
  bump(g.engine, g.archetype);
  bump(g.language, g.archetype);
}

const popularity: Record<string, Record<Scope, number>> = {};
for (const [tool, vec] of Object.entries(counts)) {
  const ratios: Record<Scope, number> = { jam: 0.5, prototype: 0.5, indie: 0.5, AA: 0.5, AAA: 0.5 };
  for (const scope of SCOPES) {
    const total = totalsByScope[scope];
    ratios[scope] = total > 0 ? vec[scope] / total : 0.5;
  }
  popularity[tool] = ratios;
}

writeFileSync(outputPath, `${JSON.stringify(popularity, null, 2)}\n`, "utf8");
console.log(`Wrote popularity.json - ${Object.keys(popularity).length} tools across ${games.length} games.`);
