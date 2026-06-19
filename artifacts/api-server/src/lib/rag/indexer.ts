import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document } from "@langchain/core/documents";
import { TOOL_CATALOG } from "../catalog.js";
import type { ToolEntry } from "../../types/catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const knowledgeDir = resolve(__dirname, "../../data/knowledge");

const PLATFORM_KEYS = ["pc", "mobile", "web", "console", "vr", "ar"] as const;

// One document PER (tool × category) because Chroma metadata must be scalar.
export function toolDocuments(catalog: readonly ToolEntry[] = TOOL_CATALOG): Document[] {
  const docs: Document[] = [];
  for (const t of catalog) {
    const pageContent = [
      t.name,
      t.description,
      `Best use case: ${t.bestUseCase}`,
      `Pros: ${t.pros.join(", ")}`,
      `Cons: ${t.cons.join(", ")}`,
      `Pricing: ${t.pricing}`,
      `Platforms: ${t.supportedPlatforms.join(", ")}`,
      `Beginner suitability: ${t.beginnerSuitability}/100`,
      `Nature: ${t.toolNature}`,
      `Learning curve: ${t.learningCurve}`,
    ].join("\n");
    const compat = new Set(t.engineCompatibility);
    const platforms = new Set(t.supportedPlatforms);
    const platformFlags = Object.fromEntries(
      PLATFORM_KEYS.map((p) => [`platform_${p}`, platforms.has(p)]),
    );
    for (const category of t.categories) {
      docs.push(
        new Document({
          id: `tool__${t.id}__${category}`,
          pageContent,
          metadata: {
            type: "tool",
            toolId: t.id,
            name: t.name,
            category,
            toolNature: t.toolNature,
            pricing: t.pricing,
            learningCurve: t.learningCurve,
            difficultyLevel: t.difficultyLevel,
            beginnerSuitability: t.beginnerSuitability,
            engine_unity: compat.has("Unity"),
            engine_unreal: compat.has("Unreal"),
            engine_godot: compat.has("Godot"),
            engine_any: compat.has("any"),
            ...platformFlags,
          },
        }),
      );
    }
  }
  return docs;
}

export function guidanceDocuments(): Document[] {
  return readdirSync(knowledgeDir)
    .filter((f) => f.endsWith(".md"))
    .map((file) => {
      const topic = file.replace(/\.md$/, "");
      return new Document({
        id: `guidance__${topic}`,
        pageContent: readFileSync(resolve(knowledgeDir, file), "utf8"),
        metadata: { type: "guidance", topic },
      });
    });
}

export async function buildIndex(): Promise<{ toolDocs: number; guidanceDocs: number }> {
  const tDocs = toolDocuments();
  const gDocs = guidanceDocuments();
  const all = [...tDocs, ...gDocs];
  // Dynamic import keeps embeddings.ts (which throws if no API key) out of
  // the module graph during pure unit tests that only exercise the builders.
  const { getVectorStore } = await import("./vectorStore.js");
  const store = getVectorStore();
  // Upsert by id so re-runs replace rather than duplicate.
  await store.addDocuments(all, { ids: all.map((d) => d.id as string) });
  return { toolDocs: tDocs.length, guidanceDocs: gDocs.length };
}
