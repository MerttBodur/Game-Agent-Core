# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
# Type-check everything
pnpm run typecheck

# Build all packages (runs typecheck first)
pnpm run build

# Boot local MySQL
docker compose up -d mysql

# Push DB schema changes (dev only, not for production migrations)
pnpm --filter @workspace/db run push

# Run API server in dev mode (http://localhost:3000)
pnpm --filter @workspace/api-server run dev

# Run frontend dev server (http://localhost:5173)
pnpm --filter @workspace/game-dev-advisor run dev

# Kill process on a port
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Regenerate API client hooks and Zod types from OpenAPI spec
pnpm --filter @workspace/api-spec run codegen

# Regenerate the tree-of-contents from the tool catalog
pnpm --filter @workspace/api-server run tree:build
```

There are no test commands — the project currently has no test suite.

## Architecture

pnpm monorepo. Packages under `lib/` are shared libraries; `artifacts/` contains the deployable apps.

**API server (`artifacts/api-server/src`):**
- `routes/` — thin Express routers that delegate to controllers.
- `controllers/` — request/response shaping only.
- `orchestrators/advisorOrchestrator.ts` — owns the analyze pipeline (validate -> retrieve -> score -> reason -> trust gate -> persist).
- `services/` — `scoringService` (deterministic), `reasoningService` (single LLM call), `catalogService` (filters), `sessionService` (MySQL persistence).
- `middleware/` — `rateLimit`, `validateBody(schema)`, `errorHandler` (single global sink, never leaks internals).
- `data/` — `toolCatalog.json` (Section 2 source of truth), `toolTree.json` (generated tree-of-contents).
- `lib/rag/treeNavigator.ts` — vectorless retrieval using a single structured-output LLM call against the tree.
- `types/` — `pdd.ts`, `tree.ts`, `recommendation.ts` (canonical TypeScript + Zod surface).

**Single sources of truth:**
- API contract: `lib/api-spec/openapi.yaml` -> Orval codegen -> `lib/api-zod`, `lib/api-client-react`.
- Tool catalog: `artifacts/api-server/src/data/toolCatalog.json` (validated by `ToolCatalogSchema` at boot).
- Tool tree: regenerate via `pnpm --filter @workspace/api-server run tree:build` after editing the catalog.

**Persistence:** MySQL 8.4 (Docker for local dev). Only the `advisor_sessions` table exists. Sessions are persisted only when `result.terminated === false`.

**Trust gate:** `TRUST_SCORE_BLOCK_THRESHOLD` (env, default 25). Below this, response is `terminated: true`, recommendations are absent, and no row is written.

## Git Convention

**CLAUDE.md değiştirildiğinde hemen commit yapılmalıdır.** Bu dosya projenin canlı dokümantasyonu; stale kalmaması için her değişiklik ayrı bir commit olarak kaydedilmeli.

## Key Conventions

- `lib/` packages use TypeScript project references (`tsc --build`); run `pnpm run typecheck:libs` to rebuild them before type-checking artifacts.
- The API server is bundled to CJS via esbuild (`artifacts/api-server/build.mjs`); it is **not** run with `tsx` in production.
- Zod imports use `zod/v4` (the v4 API surface); do not use the old `zod` default import style.
- `pnpm-workspace.yaml` enforces a 1-day minimum package release age as a supply-chain defense — do not remove `minimumReleaseAge: 1440`.
- The frontend uses Tailwind CSS v4 (`@tailwindcss/vite` plugin) with shadcn/ui components.
