import { createHash } from "node:crypto";
import { GAME_DEV_TOOLS, type GameDevTool } from "../gameDevTools.js";
import type { RagChunkMetadata } from "./types.js";

export interface RagDocument {
  id: string;
  content: string;
  metadata: RagChunkMetadata;
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
