import { Document } from "@langchain/core/documents";
import type { Where } from "chromadb";
import type { Category } from "../../types/catalog.js";
import { buildBm25, rrfFuse, type Bm25Index } from "./bm25.js";
import { toolDocuments } from "./indexer.js";

const TOOL_K = 5;
const GUIDANCE_K = 2;
// Over-fetch a wider candidate pool from both retrievers so RRF fuses a real
// union of vector + BM25 signals before slicing to the final TOOL_K / engine K.
// 20 is safely above the largest per-category tool count (~17).
const FETCH_K = 20;

export function toolWhereForCategory(category: Category): Where {
  return { $and: [{ type: { $eq: "tool" } }, { category: { $eq: category } }] };
}

export function guidanceWhere(topic?: string): Where {
  return topic ? { $and: [{ type: { $eq: "guidance" } }, { topic: { $eq: topic } }] } : { type: { $eq: "guidance" } };
}

export interface RetrievedCandidates {
  toolDocs: Document[];
  guidanceDocs: Document[];
  toolIds: string[];
  topBm25Score: number;
}

async function search(query: string, k: number, where: Where): Promise<Document[]> {
  const { getVectorStore } = await import("./vectorStore.js");
  return getVectorStore().similaritySearch(query, k, where);
}

// Predicate mirror of toolWhereForCategory, used to scope the in-memory BM25
// corpus to the SAME subspace Chroma's `where` filters to.
export function metadataMatchesWhere(
  meta: Record<string, unknown>,
  category: Category,
): boolean {
  return meta.type === "tool" && meta.category === category;
}

function bm25ForCategory(category: Category): Bm25Index {
  const docs = toolDocuments()
    .filter((d) => metadataMatchesWhere(d.metadata as Record<string, unknown>, category))
    .map((d) => ({ id: d.metadata.toolId as string, text: d.pageContent }));
  return buildBm25(docs);
}

// Fuse a vector-ranked Document list with a BM25-ranked id list via RRF,
// returning the top-k Documents in fused order (vector docs are the payload
// source; bm25 only contributes ranking signal).
export function fuseToolDocs(vectorDocs: Document[], bm25Ids: string[], k: number): Document[] {
  const vectorIds = vectorDocs.map((d) => d.metadata.toolId as string);
  // byId is keyed by toolId; the per-category Chroma `where` filter guarantees
  // one doc per toolId in the result set (indexer emits one doc per tool×category,
  // and a category-filtered search returns only that category's docs).
  const byId = new Map(vectorDocs.map((d) => [d.metadata.toolId as string, d]));
  const fusedIds = rrfFuse([vectorIds, bm25Ids]);
  const ordered: Document[] = [];
  for (const id of fusedIds) {
    const doc = byId.get(id);
    if (doc && !ordered.includes(doc)) ordered.push(doc);
    if (ordered.length >= k) break;
  }
  return ordered;
}

export async function retrieveEngineDocs(query: string): Promise<RetrievedCandidates> {
  const [vectorDocs, guidanceDocs] = await Promise.all([
    search(query, FETCH_K, toolWhereForCategory("game_engine")),
    search(query, 1, guidanceWhere("choosing-engine-unity-unreal-godot")),
  ]);
  const bm25Hits = bm25ForCategory("game_engine").search(query, FETCH_K);
  const bm25Ids = bm25Hits.map((h) => h.id);
  const toolDocs = fuseToolDocs(vectorDocs, bm25Ids, 3);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs), topBm25Score: bm25Hits[0]?.score ?? 0 };
}

export async function retrieveForCategory(query: string, category: Category): Promise<RetrievedCandidates> {
  const [vectorDocs, guidanceDocs] = await Promise.all([
    search(query, FETCH_K, toolWhereForCategory(category)),
    search(query, GUIDANCE_K, guidanceWhere()),
  ]);
  const bm25Hits = bm25ForCategory(category).search(query, FETCH_K);
  const bm25Ids = bm25Hits.map((h) => h.id);
  const toolDocs = fuseToolDocs(vectorDocs, bm25Ids, TOOL_K);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs), topBm25Score: bm25Hits[0]?.score ?? 0 };
}

export async function retrieveFeasibilityContext(query: string): Promise<Document[]> {
  return search(query, GUIDANCE_K, guidanceWhere("whats-realistic-solo-dev"));
}

function uniqueToolIds(docs: Document[]): string[] {
  return [...new Set(docs.map((d) => d.metadata.toolId as string))];
}
