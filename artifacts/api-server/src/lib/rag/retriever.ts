import { getEmbedding } from "./embeddings.js";
import { similaritySearch } from "./vectorStore.js";
import type { RagProjectQuery, RetrievedKnowledgeChunk, RetrieveRelevantKnowledgeOptions } from "./types.js";

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

export async function retrieveRelevantKnowledge(
  input: RagProjectQuery,
  options: RetrieveRelevantKnowledgeOptions = {},
): Promise<RetrievedKnowledgeChunk[]> {
  const topK = options.topK ?? DEFAULT_TOP_K;
  const query = buildSemanticProjectQuery(input);
  const embedding = await getEmbedding(query);
  const rows = await similaritySearch(embedding, topK);
  return rows.map((row) => ({
    content: row.content,
    metadata: row.metadata as RetrievedKnowledgeChunk["metadata"],
    score: row.score,
  }));
}
