import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_DEV_TOOLS, type GameDevTool } from "../gameDevTools.js";
import type { RagChunkMetadata } from "./types.js";

export interface RagDocument {
  id: string;
  content: string;
  metadata: RagChunkMetadata;
}

type Scope = "jam" | "prototype" | "indie" | "AA" | "AAA";

interface GameEntry {
  title: string;
  archetype: Scope;
  engine: string;
  language: string;
  year: number;
  budgetUSD?: number | null;
  teamSize?: number | null;
  devYears?: number | null;
  source?: string;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatToolContent(tool: GameDevTool): string {
  return [
    `Tool: ${tool.name}`,
    `Category: ${tool.category}`,
    `Pricing: ${tool.pricing}`,
    `Minimum skill level: ${tool.minSkillLevel}`,
    `Platforms: ${tool.platforms.join(", ")}`,
    `Description: ${tool.description}`,
    `Strengths: ${tool.strengths.join(", ")}`,
    `Weaknesses: ${tool.weaknesses.join(", ")}`,
    `Best for: ${tool.bestFor.join(", ")}`,
    `Tags: ${tool.tags.join(", ")}`,
  ].join("\n");
}

function toStableUuid(value: string): string {
  const hash = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hash[12] = "5";
  hash[16] = ((Number.parseInt(hash[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)]
    .map((s) => s.join(""))
    .join("-");
}

export function buildToolDocuments(tools: GameDevTool[] = GAME_DEV_TOOLS): RagDocument[] {
  return tools.map((tool) => {
    const content = formatToolContent(tool);
    const sourceId = `catalog:${slugify(tool.name)}`;
    const metadata: RagChunkMetadata = {
      toolName: tool.name,
      category: tool.category,
      sourceType: "catalog",
      sourceId,
      sourceUrl: tool.website,
      chunkKind: "tool_profile",
      tags: [...tool.tags],
      pricing: tool.pricing,
      minSkillLevel: tool.minSkillLevel,
      platforms: [...tool.platforms],
    };
    return { id: toStableUuid(`catalog\n${sourceId}\ntool_profile\n${content}`), content, metadata };
  });
}

function loadGamesDataset(): GameEntry[] {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(resolve(here, "../games-dataset/games.json"), "utf8");
    return JSON.parse(raw) as GameEntry[];
  } catch {
    return [];
  }
}

function formatGameContent(game: GameEntry): string {
  const parts = [
    `${game.title} (${game.year}) - ${game.archetype} project.`,
    `Engine: ${game.engine}. Language: ${game.language}.`,
  ];
  if (game.budgetUSD != null) parts.push(`Budget ~ $${game.budgetUSD.toLocaleString()}.`);
  if (game.teamSize != null) parts.push(`Team size: ~${game.teamSize} people.`);
  if (game.devYears != null) parts.push(`Development time: ~${game.devYears} years.`);
  if (game.source) parts.push(`Source: ${game.source}.`);
  return parts.join(" ");
}

export function buildGameDocuments(games: GameEntry[] = loadGamesDataset()): RagDocument[] {
  return games.map((game) => {
    const content = formatGameContent(game);
    const sourceId = `game:${slugify(game.title)}:${game.year}`;
    const metadata: RagChunkMetadata = {
      title: game.title,
      archetype: game.archetype,
      engine: game.engine,
      language: game.language,
      year: game.year,
      source: game.source,
      sourceType: "game_dataset",
      sourceId,
      chunkKind: "game_profile",
      tags: ["game", game.archetype, game.engine, game.language].map((v) => v.toLowerCase()),
    };
    return { id: toStableUuid(`game_dataset\n${sourceId}\ngame_profile\n${content}`), content, metadata };
  });
}

export function buildAllDocuments(): RagDocument[] {
  return [...buildToolDocuments(), ...buildGameDocuments()];
}
