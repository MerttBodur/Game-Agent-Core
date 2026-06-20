# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
# Type-check everything
pnpm run typecheck

# Build all packages (runs typecheck first)
pnpm run build

# Boot local services
docker compose up -d mysql chroma

# Push DB schema changes (dev only, not for production migrations)
pnpm --filter @workspace/db run push

# Run API server in dev mode (http://localhost:3000)
pnpm --filter @workspace/api-server run dev

# Run frontend dev server (http://localhost:5173)
pnpm --filter @workspace/game-dev-advisor run dev

# Run API unit tests
pnpm --filter @workspace/api-server run test

# Run the live advisor pipeline integration test
pnpm --filter @workspace/api-server exec tsx --test src/agent/advisorPipeline.integration.test.ts

# Rebuild the Chroma RAG index from the catalog and guidance docs
pnpm --filter @workspace/api-server run rag:index

# Run live retrieval quality checks against Chroma + OpenAI embeddings
pnpm --filter @workspace/api-server run rag:eval

# Regenerate API client hooks and Zod types from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Kill process on a port
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

## Architecture

pnpm monorepo. Packages under `lib/` are shared libraries; `artifacts/` contains the deployable apps.

**API server (`artifacts/api-server/src`):**
- `routes/` - thin Express routers that delegate to controllers.
- `controllers/` - request/response shaping, SSE event mapping, and validation boundaries.
- `orchestrators/advisorOrchestrator.ts` - owns the RAG advisor pipeline: feasibility -> engine -> per-category recommendations -> deterministic /10 scoring -> persistence.
- `agent/steps/` - LangChain/OpenAI structured-output steps for feasibility, engine choice, category recommendation, and final explanation.
- `lib/rag/` - OpenAI embeddings, Chroma vector store access, index construction, metadata-filtered retrieval helpers, and chat model factory.
- `services/` - deterministic scoring, catalog filtering, and session persistence.
- `middleware/` - `rateLimit`, `validateBody(schema)`, `errorHandler` (single global sink, never leaks internals).
- `data/` - `toolCatalog.json` plus `knowledge/*.md` guidance documents used by the RAG index.
- `types/` - catalog taxonomy/types and advisor pipeline/result types.

**Single sources of truth:**
- API contract: `lib/api-spec/openapi.yaml` -> Orval codegen -> `lib/api-zod`, `lib/api-client-react`.
- Tool catalog: `artifacts/api-server/src/data/toolCatalog.json` (validated by `ToolCatalogSchema` at boot).
- RAG index: rebuild via `pnpm --filter @workspace/api-server run rag:index` after editing the catalog or guidance docs.

**RAG pipeline:** The advisor first runs a feasibility gate. Unrealistic projects terminate early with `terminated: true` and no persisted row. Feasible projects choose an engine, retrieve per-category candidates, score recommendations deterministically on a 0-10 scale, and stream progress over SSE.

**RAG defense layers:** Input passes a Layer 1 prompt-injection guard before the SSE pipeline (`middleware/inputGuard.ts` -> `lib/security/promptGuard.ts`). Per-category retrieval passes a Layer 2 confidence gate (`lib/rag/retrievalGate.ts`) using a BM25 floor calibrated via `rag:eval`; weak categories are skipped, not request-failed. Layer 4 faithfulness checking is deferred; see `rag-defense-layers-integration.md`.

**Chroma indexing:** Chroma stores one document per `(tool x category)` because metadata filters must be scalar. Tool metadata includes `category`, `toolId`, `engine_unity`, `engine_unreal`, `engine_godot`, and `engine_any`; guidance docs are stored in the same collection with `type: guidance` and `topic`.

**Taxonomy:** The canonical categories are `game_engine`, `art_asset`, `vfx`, `animation`, `audio`, and `ai_coding`.

**Persistence:** MySQL 8.4 (Docker for local dev). Only advisor sessions are persisted. Sessions are written only when `result.terminated === false`.

## Git Convention

When `CLAUDE.md` changes, commit it immediately in its own commit. This file is live project documentation and should not stay stale.

## Key Conventions

- Read `replit.md` before starting project work.
- Treat `lib/api-spec/openapi.yaml` as the API source of truth.
- Use OpenAI Docs MCP for OpenAI API, embeddings, RAG, model, and structured-output work.
- `lib/` packages use TypeScript project references (`tsc --build`); run `pnpm run typecheck:libs` to rebuild them before type-checking artifacts.
- The API server is bundled to CJS via esbuild (`artifacts/api-server/build.mjs`); it is not run with `tsx` in production.
- Zod imports use `zod/v4` (the v4 API surface); do not use the old `zod` default import style.
- `pnpm-workspace.yaml` enforces a 1-day minimum package release age as a supply-chain defense; do not remove `minimumReleaseAge: 1440`.
- The frontend uses Tailwind CSS v4 (`@tailwindcss/vite` plugin) with shadcn/ui components.
