import { createHash } from "node:crypto";

import { Document } from "@langchain/core/documents";
import type { DocumentInterface } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { GAME_DEV_TOOLS, type GameDevTool } from "../gameDevTools.js";
import type { RagChunkMetadata } from "./types.js";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatList(label: string, values: string[]): string {
  return `${label}: ${values.join(", ")}`;
}

function formatToolContent(tool: GameDevTool): string {
  return [
    `Tool: ${tool.name}`,
    `Category: ${tool.category}`,
    `Pricing: ${tool.pricing}`,
    `Minimum skill level: ${tool.minSkillLevel}`,
    formatList("Platforms", tool.platforms),
    `Description: ${tool.description}`,
    formatList("Strengths", tool.strengths),
    formatList("Weaknesses", tool.weaknesses),
    formatList("Best for", tool.bestFor),
    formatList("Tags", tool.tags),
  ].join("\n");
}

function toToolMetadata(tool: GameDevTool): RagChunkMetadata {
  return {
    toolName: tool.name,
    category: tool.category,
    sourceType: "catalog",
    sourceId: `catalog:${slugify(tool.name)}`,
    sourceUrl: tool.website,
    chunkKind: "tool_profile",
    tags: [...tool.tags],
    pricing: tool.pricing,
    minSkillLevel: tool.minSkillLevel,
    platforms: [...tool.platforms],
  };
}

function toStableUuid(value: string): string {
  const hash = createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, 32)
    .split("");

  hash[12] = "5";
  hash[16] = ((Number.parseInt(hash[16] ?? "0", 16) & 0x3) | 0x8).toString(16);

  return [
    hash.slice(0, 8).join(""),
    hash.slice(8, 12).join(""),
    hash.slice(12, 16).join(""),
    hash.slice(16, 20).join(""),
    hash.slice(20, 32).join(""),
  ].join("-");
}

export function getStableDocumentId(
  document: DocumentInterface,
  _index?: number,
): string {
  const metadata = document.metadata as Partial<RagChunkMetadata>;
  const stableSource = [
    metadata.sourceType,
    metadata.sourceId,
    metadata.chunkKind,
    document.pageContent,
  ].join("\n");

  return toStableUuid(stableSource);
}

export async function buildToolDocuments(
  tools: GameDevTool[] = GAME_DEV_TOOLS,
): Promise<Document<RagChunkMetadata>[]> {
  const baseDocuments = tools.map(
    (tool) =>
      new Document<RagChunkMetadata>({
        pageContent: formatToolContent(tool),
        metadata: toToolMetadata(tool),
      }),
  );

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 120,
  });

  const chunkedDocuments = await splitter.splitDocuments(baseDocuments);

  return chunkedDocuments.map(
    (document) =>
      new Document<RagChunkMetadata>({
        id: getStableDocumentId(document),
        pageContent: document.pageContent,
        metadata: document.metadata as RagChunkMetadata,
      }),
  );
}
