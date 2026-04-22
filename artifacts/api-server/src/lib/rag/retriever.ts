import type { DocumentInterface } from "@langchain/core/documents";

import { getRagVectorStore } from "./vectorStore.js";
import type {
  RagChunkMetadata,
  RagProjectQuery,
  RetrievedKnowledgeChunk,
  RetrieveRelevantKnowledgeOptions,
} from "./types.js";

const DEFAULT_TOP_K = 5;

export function buildSemanticProjectQuery(input: RagProjectQuery): string {
  return [
    `Game project idea: ${input.projectIdea}`,
    `Budget: ${input.budget}`,
    `Timeline: ${input.timeLimit}`,
    `Developer skill level: ${input.skillLevel}`,
    `Team size: ${input.teamSize}`,
    `Target platforms: ${input.platformTarget.join(", ") || "unspecified"}`,
    `Art capability: ${input.artCapability}`,
    `Other constraints: ${input.otherConstraints?.trim() || "none"}`,
    "Find relevant game development tools across engines, programming, art, animation, UI, VFX, version control, deployment, and AI tooling.",
  ].join("\n");
}

function getStringMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function getStringArrayMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
): string[] {
  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function normalizeMetadata(document: DocumentInterface): RagChunkMetadata {
  const metadata = document.metadata as Record<string, unknown>;

  return {
    ...metadata,
    toolName: getStringMetadataValue(metadata, "toolName"),
    category: getStringMetadataValue(metadata, "category"),
    sourceType: "catalog",
    sourceId: getStringMetadataValue(metadata, "sourceId"),
    sourceUrl: getStringMetadataValue(metadata, "sourceUrl"),
    chunkKind: "tool_profile",
    tags: getStringArrayMetadataValue(metadata, "tags"),
  };
}

export async function retrieveRelevantKnowledge(
  input: RagProjectQuery,
  options: RetrieveRelevantKnowledgeOptions = {},
): Promise<RetrievedKnowledgeChunk[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const vectorStore = await getRagVectorStore();
  const query = buildSemanticProjectQuery(input);
  const results = await vectorStore.similaritySearchWithScore(query, topK, {
    sourceType: "catalog",
  });

  return results.map(([document, score]) => {
    const normalized: RetrievedKnowledgeChunk = {
      content: document.pageContent,
      metadata: normalizeMetadata(document),
    };

    if (Number.isFinite(score)) {
      normalized.score = score;
    }

    return normalized;
  });
}
