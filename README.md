# Hackathon Entrant

**Mert Bodur**  
**Turkey, Istanbul**  
**Bahçeşehir University - Computer Science, 2nd Year**

# Game Dev Stack Advisor

## Overview

Game Dev Stack Advisor is an AI-powered recommendation platform built for the AMD Developer Hackathon. It helps game developers choose a realistic development stack before they spend weeks experimenting with the wrong engine, art tools, VFX, animation, audio, or AI coding tools.

The user describes a game idea and adds practical constraints such as budget, skill level, team size, target platforms, art capability, and paid-tool preferences. The system first checks whether the project is feasible, selects a suitable game engine, retrieves relevant tools per category from a Chroma-backed RAG knowledge base, scores the candidates deterministically on a 0-10 scale, and returns a structured recommendation with pros, cons, alternatives, and a final explanation.

The goal is simple: turn an early game idea into a practical, explainable production stack.

## What It Does

- Runs a feasibility gate on a free-text game concept and structured project constraints.
- Recommends a complete game development tool stack.
- Selects an appropriate game engine: Unity, Unreal, or Godot.
- Scores tools against budget, platform, skill level, art capability, and team size on a 0-10 scale.
- Explains why each recommended tool fits the project.
- Shows alternatives when there are multiple reasonable options.
- Saves feasible analysis sessions for later review.
- Provides a searchable tool catalog spanning six game development categories.
- Streams backend progress to the frontend through Server-Sent Events.

## Supported Tool Categories

The current MVP knowledge base covers:

- Game Engine
- Art & Asset Creation
- VFX
- Animation
- Audio
- AI Coding Tool

The catalog is intentionally bounded. The AI can only recommend tools that exist in the structured knowledge base, which reduces hallucination risk and keeps recommendations traceable.

## Why It Matters

Choosing the wrong stack is expensive for small game teams. A solo beginner building a 2D mobile game should not receive the same stack as an experienced team building a realistic 3D PC game. Budget, platform, skill level, team size, and art workflow all change the correct answer.

Game Dev Stack Advisor provides:

- **Faster planning**: teams can evaluate stack choices before production starts.
- **Lower technical risk**: recommendations are filtered through project constraints.
- **Better tool fit**: each tool is scored against concrete development factors.
- **Explainability**: recommendations include reasoning, pros, cons, and alternatives.
- **Reduced hallucination**: retrieved candidates come from a curated catalog.
- **Beginner support**: new developers receive practical guidance instead of generic advice.
- **Hackathon-friendly iteration**: the system is built as a modular MVP that can be expanded with more tools, categories, and reasoning rules.

## How It Works

1. **User input**
   The React frontend collects the game idea, budget, skill level, team size, platform targets, art capability, and optional paid-tool priorities and notes.

2. **API validation**
   The Express backend validates the request against generated Zod schemas derived from `lib/api-spec/openapi.yaml`, which is the API source of truth.

3. **Feasibility gate**
   A structured AI step decides whether the project is realistic for the stated constraints. Unrealistic projects terminate early with a reason and no persisted session. Feasible projects yield the set of target tool categories to recommend.

4. **Engine decision**
   A second structured AI step, grounded in retrieved engine guidance, chooses the most suitable engine (Unity, Unreal, or Godot) and records whether it agrees with or challenges the user's preferred engine.

5. **Per-category RAG retrieval and recommendation**
   For each target category, the pipeline retrieves candidate tools from a Chroma vector store using OpenAI embeddings, filtered by category and engine compatibility metadata. OpenAI then picks a primary tool plus alternatives from that retrieved pool, so it cannot recommend tools outside the catalog.

6. **Deterministic scoring**
   Each recommended tool is scored on a 0-10 scale using deterministic weights for budget, skill level, platform fit, art capability, team size, and AI-vs-traditional tool nature.

7. **Final explanation**
   A final structured step produces the project summary and an overall explanation tying the engine and per-category picks together.

8. **Persistence**
   Feasible sessions are stored in MySQL through Drizzle ORM. Terminated (infeasible) projects are never persisted.

9. **Frontend result**
   The UI streams progress over SSE and renders the feasibility outcome, engine decision, scored top picks, alternatives, strengths, weaknesses, and the final analysis.

## Technical Architecture

```text
React + Vite Frontend
        |
        | /api requests, SSE stream
        v
Express 5 API Server
        |
        | request validation from OpenAPI-generated Zod schemas
        v
Advisor Orchestrator
        |
        +--> Feasibility Step       -> OpenAI structured JSON output (gate)
        +--> Pick Engine Step       -> Chroma RAG + OpenAI structured output
        +--> Recommend Category Step -> Chroma RAG + OpenAI, per target category
        +--> Scoring Service        -> deterministic 0-10 candidate scores
        +--> Score/Explain Step     -> OpenAI structured JSON output (summary)
        |
        v
MySQL + Drizzle ORM
        |
        v
Saved sessions and statistics
```

## Repository Structure

```text
.
|-- artifacts/
|   |-- api-server/              # Express backend and advisor pipeline
|   `-- game-dev-advisor/        # React + Vite frontend
|-- lib/
|   |-- api-spec/                # OpenAPI contract, source of truth
|   |-- api-zod/                 # Generated Zod schemas
|   |-- api-client-react/        # Generated React API client
|   `-- db/                      # Drizzle schema and migrations
|-- docs/                        # Planning and design documents
|-- plans/                       # Sprint and hackathon planning notes
|-- docker-compose.yml           # Local MySQL and Chroma services
|-- pnpm-workspace.yaml          # Monorepo workspace definition
`-- README.md
```

## Tech Stack

### Frontend

- React 19
- TypeScript 5.9
- Vite
- Tailwind CSS 4
- shadcn/ui-style component structure
- Radix UI primitives
- TanStack React Query
- Wouter routing

### Backend

- Node.js 24
- Express 5
- TypeScript
- LangChain.js with OpenAI chat and embedding models
- OpenAI Node SDK
- Server-Sent Events for streaming analysis results
- Zod (v4) validation
- Pino logging
- Custom rate limiting middleware

### Data and API

- MySQL 8.4
- Drizzle ORM
- Drizzle Kit
- Chroma vector store for RAG retrieval
- OpenAI embeddings
- OpenAPI 3.1
- Orval-generated API client and schemas
- Static JSON tool catalog (`toolCatalog.json`) plus Markdown guidance docs

### Build and Tooling

- pnpm workspaces
- esbuild for backend bundling
- Docker Compose for local MySQL and Chroma
- tsx for scripts and tests

## Requirements

- Node.js 24
- pnpm
- Docker Desktop (for local MySQL 8 and Chroma) or compatible services
- OpenAI API key
- Git

## Environment Variables

Create `artifacts/api-server/.env` (see `artifacts/api-server/.env.example`):

```env
PORT=3000
MYSQL_URL=mysql://root:root@localhost:3306/toolrecommender
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=gamedev_tools
```

The OpenAI key is used for both chat completions and embeddings. `CHROMA_URL` and `CHROMA_COLLECTION` point the RAG index and retriever at the local Chroma instance started by Docker Compose.

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd ToolRecommender
```

2. Enable pnpm through Corepack:

```bash
corepack enable
```

3. Install dependencies:

```bash
pnpm install
```

4. Start MySQL and Chroma:

```bash
docker compose up -d mysql chroma
```

5. Create `artifacts/api-server/.env` using the environment variables shown above.

6. Push the database schema:

```bash
pnpm --filter @workspace/db run push
```

7. Build the RAG index from the catalog and guidance docs:

```bash
pnpm --filter @workspace/api-server run rag:index
```

8. Start the backend API:

```bash
pnpm --filter @workspace/api-server run dev
```

9. In a second terminal, start the frontend:

```bash
pnpm --filter @workspace/game-dev-advisor run dev
```

10. Open the app:

```text
Frontend: http://localhost:5173
API:      http://localhost:3000/api
```

## Useful Commands

```bash
pnpm run typecheck
pnpm run build
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run rag:index
pnpm --filter @workspace/api-server run rag:eval
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/game-dev-advisor run dev
```

## API Endpoints

Base path: `/api`

- `GET /healthz` - health check
- `POST /advisor/analyze` - analyze a project and stream recommendation events
- `GET /advisor/sessions` - list recent analysis sessions
- `GET /advisor/sessions/{id}` - get one saved analysis session
- `GET /advisor/stats` - get usage statistics
- `GET /tools` - list catalog tools
- `GET /tools/{id}` - get one tool
- `GET /tools/categories` - list tool categories

## Current MVP Scope

Implemented:

- Web analyzer flow
- Tool catalog browsing
- Session history
- Express API
- MySQL persistence
- OpenAPI-based contracts
- Feasibility gate plus structured OpenAI engine and recommendation steps
- Chroma + OpenAI embeddings RAG retrieval
- Deterministic 0-10 scoring
- Rate limiting for analysis requests

Not included yet:

- Authentication
- Admin catalog editor
- PDF export
- User accounts
- Fine-tuning
- Autonomous project generation
- Continuous learning from previous sessions

## Future Improvements

- Add more tools and deeper category branches.
- Add comparison views for multiple saved analyses.
- Add export to Markdown or PDF.
- Add admin tooling for catalog updates.
- Add richer feasibility scoring by genre and project scope.
- Add follow-up questions when the project input is ambiguous.
- Add deployment scripts and production environment documentation.

