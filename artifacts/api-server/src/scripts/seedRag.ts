import "dotenv/config";
import { pool } from "@workspace/db";
import { buildAllDocuments } from "../lib/rag/documents.js";
import { getEmbedding } from "../lib/rag/embeddings.js";
import { upsertChunks, deleteChunks } from "../lib/rag/vectorStore.js";

async function main() {
  console.log("Preparing RAG seed...");
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

  const documents = buildAllDocuments();
  const ids = documents.map((d) => d.id);

  await deleteChunks(ids);

  const chunks = await Promise.all(
    documents.map(async (doc) => ({
      id: doc.id,
      content: doc.content,
      metadata: doc.metadata as Record<string, unknown>,
      embedding: await getEmbedding(doc.content),
    })),
  );

  await upsertChunks(chunks);
  console.log(`Seeded ${chunks.length} RAG chunks into knowledge_chunks.`);
  await pool.end();
}

main().catch(async (error) => {
  console.error("RAG seed failed:", error);
  await pool.end();
  process.exitCode = 1;
});
