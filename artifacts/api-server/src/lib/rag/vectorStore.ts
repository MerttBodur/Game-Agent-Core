import { Chroma } from "@langchain/community/vectorstores/chroma";
import { embeddings } from "./embeddings.js";

export const COLLECTION_NAME =
  process.env.CHROMA_COLLECTION ?? "gamedev_tools";
const CHROMA_URL = process.env.CHROMA_URL ?? "http://localhost:8000";

export function getVectorStore(): Chroma {
  return new Chroma(embeddings, {
    collectionName: COLLECTION_NAME,
    url: CHROMA_URL,
    collectionMetadata: { "hnsw:space": "cosine" },
  });
}
