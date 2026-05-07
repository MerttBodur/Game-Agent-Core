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

export type RagSourceType = "catalog" | "game_dataset";

export type RagChunkKind = "tool_profile" | "game_profile";

export interface RagChunkMetadata extends Record<string, unknown> {
  toolName?: string;
  category?: string;
  title?: string;
  archetype?: "jam" | "prototype" | "indie" | "AA" | "AAA";
  engine?: string;
  language?: string;
  year?: number;
  source?: string;
  sourceType: RagSourceType;
  sourceId: string;
  sourceUrl?: string;
  chunkKind: RagChunkKind;
  tags?: string[];
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
