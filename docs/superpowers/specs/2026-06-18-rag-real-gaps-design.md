# RAG Pipeline — Closing the Real Gaps + Catalog Broadening

**Date:** 2026-06-18
**Status:** Approved (design), pending implementation plan
**Source guide:** `rag-pipeline-guide.md` (generic end-to-end RAG tutorial)

## Context & Goal

`rag-pipeline-guide.md` is a generic RAG tutorial written for a free-text Q&A
chatbot. This project is **not** a chatbot — it is a structured advisor pipeline
(feasibility gate → engine pick → per-category recommendation → deterministic
/10 scoring → persistence), where the LLM selects from a metadata-filtered
candidate set constrained by a `toolId` enum.

The goal is to **close the gaps where the guide genuinely improves _this_
pipeline**, and to skip the recommendations that fight its design. We also
broaden and correct the tool catalog, since retrieval quality is bounded by
data quality.

## Gap Analysis (guide vs. project)

| Guide section | Project today | Decision |
|---|---|---|
| Embedding (same model chunk+query, `text-embedding-3-small`) | Already exactly this | No change |
| Vector DB (Chroma, cosine, metadata) | Already this | No change |
| Metadata filtering before search | category + engine flags | Keep (a strength); extend |
| **Hybrid search (BM25 + semantic)** | Pure semantic only | **CLOSE** |
| **Prompt grounding** ("don't invent", separators) | Partial (toolId enum strong; attrs loose) | **CLOSE** |
| **Eval metrics (Precision@K, MRR)** | 2 ad-hoc smoke assertions | **CLOSE** |
| **Metadata/content enrichment** | pricing in text; platforms/beginner not surfaced | **CLOSE** |
| Reranking (top-20 → top-5) | None | **SKIP** — corpus ≤ docs/category; RRF hybrid covers precision |
| Semantic chunking (price/feature sub-chunks) | Whole-tool docs | **SKIP** — see below |
| Agentic multi-query RAG | Deterministic pipeline | **SKIP** — pipeline already structured/better |

### Why semantic chunking is explicitly out of scope

1. **Documents are already smaller than one chunk.** The guide's chunk target is
   200–500 tokens; the project's entire per-tool embedded `pageContent` averages
   ~123 tokens (max ~139). Chunking would produce ~20–40 token fragments —
   below the guide's own floor ("too small → context loss").
2. **Data is already structured.** Chunking exists to recover structure from
   unstructured scraped text. The catalog already has discrete `pros`, `cons`,
   `pricing`, `bestUseCase` fields. Splitting them would lose the cross-field
   signal (e.g. "cheap AND good at animation") that whole-tool embeddings carry.
3. **The retrieval unit is the tool, not a passage.** The pipeline retrieves
   candidate tools, dedupes to `toolIds`, and the LLM picks from a `toolId` enum.
   Chunking would force re-grouping chunks back into tools before ranking.

   Revisit only if long-form sources (vendor docs, Reddit, transcripts) are
   ingested later — that is a separate knowledge-base-expansion feature.

## Workstream 1 — Hybrid Retrieval (BM25 + Semantic, RRF fusion)

**Approach:** In-memory BM25 over the catalog, fused with Chroma vector results
via Reciprocal Rank Fusion (RRF). Chosen over (a) swapping Chroma for
Weaviate/Qdrant (heavy infra migration for a ~60-tool corpus — YAGNI) and
(b) pure semantic + query expansion (does not fix named-entity misses).

- **New `lib/rag/bm25.ts`:** builds an in-memory BM25 index from
  `toolDocuments()` (the same docs Chroma indexes). Supports the **same metadata
  filter predicates** (category, engine flags) so both retrievers search the
  identical filtered subspace. Corpus is tiny (~70 docs) → build is sub-millisecond.
- **`retriever.ts`:** each `retrieveForCategory` / `retrieveEngineDocs` runs
  vector search **and** BM25 over the same `where` filter, then fuses via RRF
  (`score = Σ 1/(k + rank)`, k=60) and returns top-K.
- **Why RRF over weighted α-fusion:** parameter-free (no α to tune), and immune
  to the cosine-vs-BM25 score-scale mismatch.

## Workstream 2 — Prompt Grounding Hardening

- **`advisorPrompts.ts` `categorySystemPrompt`:** add explicit grounding rules:
  - "Use ONLY the pros, cons, pricing, and facts present in the candidate text.
    Do NOT invent capabilities, prices, or platform support not shown."
  - "If candidates are insufficient for a confident pick, say so in `reasoning`
    rather than fabricating."
- **`recommendCategory.ts` `formatCandidates`:** replace loose `slice(0,3)`
  truncation with clean, fully-labeled candidate blocks separated by `---`
  (the guide's separator rule). The `toolId` enum already prevents inventing
  tools; this prevents inventing _attributes_.

## Workstream 3 — Real Eval Metrics

Replace the 2 ad-hoc assertions in `scripts/ragEval.ts` with a labeled gold-set:
- **`eval/goldset.json`:** ~12–15 cases, each
  `{ query, category, picked, relevantToolIds[] }`.
- Compute **Recall@K, Precision@K, MRR** per case + aggregate. Print a table and
  overall numbers; exit non-zero if MRR drops below a floor.
- Runs against live Chroma + OpenAI (same `rag:eval` command). Used to prove the
  hybrid change ≥ the pure-semantic baseline.

## Workstream 4 — Metadata / Content Enrichment

- **`indexer.ts` `toolDocuments()`:**
  - Add scalar filter flags: `pricing`, `platform_pc` / `platform_mobile` / …
    (booleans to stay Chroma-scalar), `beginnerSuitability`, `difficultyLevel`.
  - Surface `pricing`, platforms, `beginnerSuitability` into the embedded
    `pageContent` so semantic + BM25 see them.
- **Data fix:** correct `supportedPlatforms` in `toolCatalog.json` — cross-platform
  desktop tools (Blender, Krita, Aseprite, Audacity, Reaper, FMOD, Wwise, Maya,
  ZBrush, Substance) currently list a single platform. Must be fixed before
  platform filtering ships, or the filter mis-fires.
- Requires `rag:index` rebuild after the change.

## Workstream 5 — Catalog Broadening (usability-filtered)

Add ~28 high-usability tools (real indie adoption, distinct use case, accessible
pricing), mapped to **existing** categories (no taxonomy change), `toolNature`
tagged. AI-native tools marked `ai`. All verified current as of 2026-06-18.

**game_engine (+8):** GameMaker, Construct 3, GDevelop, RPG Maker, Ren'Py,
Defold, Phaser, LÖVE.

**art_asset (+~8):** Nano Banana (ai), Tripo (ai), Rodin/Hyper3D (ai),
Midjourney (ai); Photoshop, GIMP, Clip Studio Paint, MagicaVoxel.
(Leonardo AI already in catalog as `leonardo_ai` — dedupe, do not re-add.)

**animation (+4):** Kling AI (ai), OpenToonz, Moho, Rive.

**vfx (+1):** Runway Gen-4 (ai).

**audio (+4):** FL Studio, LMMS, Bosca Ceoil, ChipTone.

**ai_coding (+3):** Claude Code (ai), Cline (ai), Aider (ai).

**Excluded deliberately:** Sora (OpenAI discontinued it March 2026), Amazon Q
(weak outside AWS), FLUX/Stable Diffusion (power-user/self-host — lower indie
usability vs Midjourney), Quixel Mixer / ArmorPaint / 3D-Coat / Marmoset
(specialist or redundant with Substance, already present), Ableton/Cubase
(pro-priced; Reaper covers affordable DAW), Udio/Stable Audio (Suno covers AI
music), Tabnine (enterprise niche), Solar2D/PlayCanvas/Cocos/Bevy/Stride
(niche/overlap), Adobe Animate (declining game-dev relevance), Luma Dream
Machine (overlaps Runway/Kling).

Each new entry must be fully field-complete per `ToolEntrySchema` (description,
bestUseCase, ≥1 pros/cons, pricing, platforms, engineCompatibility,
beginnerSuitability, etc.) and pass `ToolCatalogSchema` validation at boot.

## Workstream 6 — Index Rebuild

After catalog + indexer changes, rebuild Chroma via `rag:index`; re-run
`rag:eval` to confirm metrics hold/improve.

## Testing Strategy

- **Unit:** BM25 ranking correctness; RRF fusion ordering; metadata-filter parity
  between BM25 and Chroma `where`; candidate-formatting/separator output;
  grounding-prompt content; new catalog entries pass schema. Extend existing
  `indexer.test.ts` / `retriever.test.ts`.
- **Integration:** `advisorPipeline.integration.test.ts` stays green.
- **Eval:** gold-set harness reports Recall@K / Precision@K / MRR; run before/after
  to prove hybrid ≥ semantic.

## Out of Scope

Semantic sub-chunking of tools; agentic multi-query / LangGraph loop; swapping
Chroma for Qdrant/Weaviate; Cohere/bge reranker; new taxonomy category for
AI-gen tools; long-form knowledge-base ingestion.

## Sources (catalog research, verified 2026-06-18)

- Indie engines: cubix.co/blog/top-10-game-engines-for-indie-developers,
  app.cinevva.com/guides/web-game-engines-comparison.html
- Art / 3D: juegostudio.com/blog/best-tools-for-art-and-design,
  4dviz.com/blog/top-10-3d-texturing-software,
  meshy.ai/blog/best-ai-tools-for-3d-game-assets
- AI image / 3D gen: pricepertoken.com (Gemini 3 Pro Image / Nano Banana),
  aiunpacking.com/guides/ai-image-generators-2026
- Animation / video: knowlify.com/articles/best-2d-animation-software,
  eesel.ai/blog/kling-ai-pricing, versely.studio/blog/runway-gen-4-pricing
- Audio: blog.landr.com/best-daw, midination.com/daw/free-daw/best-free-daw,
  bfxr.net
- AI coding: augmentcode.com/tools/8-top-ai-coding-assistants-and-their-best-use-cases
- Sora shutdown (exclusion): spectrumailab.com/blog/veo-3-vs-sora-vs-runway-best-ai-video-generator-2026
