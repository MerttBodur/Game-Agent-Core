import { pool } from "@workspace/db";
import type { Document } from "@langchain/core/documents";

import { GAME_DEV_TOOLS } from "../lib/gameDevTools.js";
import { buildToolDocuments, getStableDocumentId } from "../lib/rag/documents.js";
import { getRagVectorStore } from "../lib/rag/vectorStore.js";

async function closePool() {
  try {
    await pool.end();
  } catch {
    // The vector store may already have closed the shared workspace pool.
  }
}

async function main() {
  console.log(`Preparing RAG seed for ${GAME_DEV_TOOLS.length} tools...`);

  // Drizzle models the vector column, but pgvector itself must exist in Postgres.
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

  const documents: Document[] = await buildToolDocuments();
  // PGVectorStore deletes by uuid[], so Worker 2's stable IDs should be UUID strings.
  const ids = documents.map((document: Document) => getStableDocumentId(document));
  const vectorStore = await getRagVectorStore();

  try {
    if (ids.length > 0) {
      await vectorStore.delete({ ids });
    }

    if (documents.length > 0) {
      await vectorStore.addDocuments(documents, { ids });
    }

    console.log(`Seeded ${documents.length} RAG chunks into knowledge_chunks.`);
  } finally {
    const storePool = "pool" in vectorStore ? vectorStore.pool : undefined;
    const storeUsesWorkspacePool = storePool === pool;

    if (typeof vectorStore.end === "function") {
      await vectorStore.end();
    }

    if (!storeUsesWorkspacePool) {
      await closePool();
    }
  }
}

main().catch(async (error: unknown) => {
  console.error("RAG seed failed.");
  console.error(error);
  await closePool();
  process.exitCode = 1;
});
