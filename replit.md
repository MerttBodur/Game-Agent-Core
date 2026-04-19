# Game Dev Stack Advisor

## Overview

A RAG-powered AI agent that recommends game development tool stacks based on project constraints. Users input their project idea, budget, timeline, skill level, team size, platform targets, and art capability. The system analyzes these inputs, scores tools from a knowledge base using a rule-based engine, and generates AI-powered narrative explanations via OpenAI.

## Architecture

pnpm workspace monorepo with TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations (gpt-5-mini for analysis)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui

## Artifacts

- **game-dev-advisor** (`/`) — React+Vite frontend, dark theme
- **api-server** (`/api`) — Express 5 backend

## Key Files

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/db/src/schema/tools.ts` — Game dev tools table
- `lib/db/src/schema/sessions.ts` — Analysis sessions table
- `artifacts/api-server/src/lib/gameDevTools.ts` — Tool catalog data (27 tools)
- `artifacts/api-server/src/lib/advisorEngine.ts` — Scoring + OpenAI analysis engine
- `artifacts/api-server/src/routes/advisor.ts` — Advisor API routes
- `artifacts/api-server/src/routes/tools.ts` — Tool catalog API routes
- `artifacts/game-dev-advisor/src/pages/Analyzer.tsx` — Main analyzer page
- `artifacts/game-dev-advisor/src/pages/Sessions.tsx` — History page
- `artifacts/game-dev-advisor/src/pages/Tools.tsx` — Tool catalog page

## Categories Supported

engine, programming, art, animation, ui, vfx, version_control, deployment, ai_tooling

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Future Layers (Planned)

- More tools in the knowledge base
- Persistent user sessions / accounts
- Tool comparison feature
- Export recommendations as PDF
- More granular scoring (genre-specific weights)
- Conversational follow-up questions
