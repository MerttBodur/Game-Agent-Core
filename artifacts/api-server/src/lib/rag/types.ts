export interface RagProjectQuery {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  otherConstraints?: string | null;
}

export type RagSourceType = "catalog";

export type RagChunkKind = "tool_profile";

export interface RagChunkMetadata extends Record<string, unknown> {
  toolName: string;
  category: string;
  sourceType: RagSourceType;
  sourceId: string;
  sourceUrl: string;
  chunkKind: RagChunkKind;
  tags: string[];
}

export interface RetrievedKnowledgeChunk {
  content: string;
  metadata: RagChunkMetadata;
  score?: number;
  [key: string]: unknown;
}

export interface RetrieveRelevantKnowledgeOptions {
  topK?: number;
}
