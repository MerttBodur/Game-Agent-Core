import type { Document } from "@langchain/core/documents";
import type { Where } from "chromadb";
import type { Category, EngineName } from "../../types/catalog.js";

const TOOL_K = 5;
const GUIDANCE_K = 2;

// Chroma metadata is scalar-only; engine compatibility is matched via boolean flags.
export function engineFlagKey(engine: EngineName): "engine_unity" | "engine_unreal" | "engine_godot" {
  return engine === "Unity" ? "engine_unity" : engine === "Unreal" ? "engine_unreal" : "engine_godot";
}

export function toolWhereForCategory(category: Category, picked?: EngineName): Where {
  const clauses: Where[] = [{ type: { $eq: "tool" } }, { category: { $eq: category } }];
  if (picked) {
    clauses.push({ $or: [{ [engineFlagKey(picked)]: { $eq: true } }, { engine_any: { $eq: true } }] });
  }
  return { $and: clauses };
}

export function guidanceWhere(topic?: string): Where {
  return topic ? { $and: [{ type: { $eq: "guidance" } }, { topic: { $eq: topic } }] } : { type: { $eq: "guidance" } };
}

export interface RetrievedCandidates { toolDocs: Document[]; guidanceDocs: Document[]; toolIds: string[]; }

async function search(query: string, k: number, where: Where): Promise<Document[]> {
  const { getVectorStore } = await import("./vectorStore.js");
  return getVectorStore().similaritySearch(query, k, where);
}

export async function retrieveEngineDocs(query: string): Promise<RetrievedCandidates> {
  const [toolDocs, guidanceDocs] = await Promise.all([
    search(query, 3, toolWhereForCategory("game_engine")),
    search(query, 1, guidanceWhere("choosing-engine-unity-unreal-godot")),
  ]);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs) };
}

export async function retrieveForCategory(query: string, category: Category, picked: EngineName): Promise<RetrievedCandidates> {
  const [toolDocs, guidanceDocs] = await Promise.all([
    search(query, TOOL_K, toolWhereForCategory(category, picked)),
    search(query, GUIDANCE_K, guidanceWhere()),
  ]);
  return { toolDocs, guidanceDocs, toolIds: uniqueToolIds(toolDocs) };
}

export async function retrieveFeasibilityContext(query: string): Promise<Document[]> {
  return search(query, GUIDANCE_K, guidanceWhere("whats-realistic-solo-dev"));
}

function uniqueToolIds(docs: Document[]): string[] {
  return [...new Set(docs.map((d) => d.metadata.toolId as string))];
}
