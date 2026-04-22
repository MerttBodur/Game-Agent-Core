import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import type { PGVectorStoreArgs } from "@langchain/community/vectorstores/pgvector";

import { getOpenAIEmbeddings, RAG_EMBEDDING_DIMENSIONS } from "./embeddings.js";

const RAG_TABLE_NAME = "knowledge_chunks";

const ragVectorStoreConfig: PGVectorStoreArgs & { dimensions: number } = {
  tableName: RAG_TABLE_NAME,
  columns: {
    idColumnName: "id",
    vectorColumnName: "embedding",
    contentColumnName: "content",
    metadataColumnName: "metadata",
  },
  distanceStrategy: "cosine",
  scoreNormalization: "similarity",
  dimensions: RAG_EMBEDDING_DIMENSIONS,
};

let ragVectorStorePromise: Promise<PGVectorStore> | undefined;

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL must be set. Did you forget to provision a database?",
    );
  }

  return databaseUrl;
}

export async function getRagVectorStore(): Promise<PGVectorStore> {
  ragVectorStorePromise ??= PGVectorStore.initialize(getOpenAIEmbeddings(), {
    ...ragVectorStoreConfig,
    postgresConnectionOptions: {
      connectionString: getDatabaseUrl(),
    },
  });

  return ragVectorStorePromise;
}

export async function closeRagVectorStore(
  vectorStore?: PGVectorStore,
): Promise<void> {
  const activeStore =
    vectorStore ??
    (ragVectorStorePromise ? await ragVectorStorePromise : undefined);

  if (!activeStore) return;

  await activeStore.end();

  if (
    !vectorStore ||
    activeStore ===
      (ragVectorStorePromise ? await ragVectorStorePromise : undefined)
  ) {
    ragVectorStorePromise = undefined;
  }
}
