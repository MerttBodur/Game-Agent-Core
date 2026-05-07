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
```

There are no test commands — the project currently has no test suite.

## Architecture

pnpm monorepo. Packages under `lib/` are shared libraries; `artifacts/` contains the deployable apps.

**Data flow for an analysis request:**
1. Frontend (`artifacts/game-dev-advisor`) calls `POST /api/advisor/analyze` via the generated React Query hooks in `lib/api-client-react`
2. The Express route (`artifacts/api-server/src/routes/advisor.ts`) validates the body with Zod schemas from `lib/api-zod`
3. `advisorEngine.ts` scores every tool in `gameDevTools.ts` using a rule-based function (budget, skill, platform, time, art), then retrieves augmenting context from the RAG vector store
4. OpenAI (`gpt-4o-mini`) generates the narrative summary grounded in the scored stack + retrieved chunks
5. The session is persisted to MySQL via Drizzle ORM and the full `AnalysisResult` is returned

**API contract:** `lib/api-spec/openapi.yaml` is the single source of truth. Orval reads it to generate:
- `lib/api-client-react` — TanStack Query hooks for the frontend
- `lib/api-zod` — Zod validation schemas for the backend

**Whenever the OpenAPI spec changes, run codegen** to keep both packages in sync.

**Catalog-first reads:** `/tools*` reads from `artifacts/api-server/src/data/toolCatalog.json` (loaded and validated at boot). MySQL is only used for `advisor_sessions`. The `tools` and `knowledge_chunks` Postgres tables and pgvector are gone.

**DB schema packages:**
- `lib/db/src/schema/sessions.ts` — analysis sessions

**Tool catalog** lives in `artifacts/api-server/src/data/toolCatalog.json` (27 tools across 9 categories: engine, programming, art, animation, ui, vfx, version_control, deployment, ai_tooling). Adding a new tool: edit `toolCatalog.json` and re-run `pnpm run typecheck` (the loader will reject malformed entries at boot).

## Git Convention

**CLAUDE.md değiştirildiğinde hemen commit yapılmalıdır.** Bu dosya projenin canlı dokümantasyonu; stale kalmaması için her değişiklik ayrı bir commit olarak kaydedilmeli.

## Key Conventions

- `lib/` packages use TypeScript project references (`tsc --build`); run `pnpm run typecheck:libs` to rebuild them before type-checking artifacts.
- The API server is bundled to CJS via esbuild (`artifacts/api-server/build.mjs`); it is **not** run with `tsx` in production.
- Zod imports use `zod/v4` (the v4 API surface); do not use the old `zod` default import style.
- `pnpm-workspace.yaml` enforces a 1-day minimum package release age as a supply-chain defense — do not remove `minimumReleaseAge: 1440`.
- The frontend uses Tailwind CSS v4 (`@tailwindcss/vite` plugin) with shadcn/ui components.
