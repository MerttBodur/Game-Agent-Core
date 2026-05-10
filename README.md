# Hackathon Entrant

**Mert Bodur**  
**Turkey, Istanbul**  
**Bahçeşehir University - Computer Science, 2nd Year**

# Game Dev Stack Advisor

## Overview

Game Dev Stack Advisor is an AI-powered recommendation platform built for the AMD Developer Hackathon. It helps game developers choose a realistic development stack before they spend weeks experimenting with the wrong engine, art tools, audio tools, IDE, source control workflow, or publishing path.

The user describes a game idea and adds practical constraints such as budget, timeline, skill level, team size, target platforms, art capability, multiplayer needs, and paid-tool preferences. The system then analyzes the project, selects a suitable game engine, retrieves relevant tools from a curated knowledge base, scores the candidates, and returns a structured recommendation with pros, cons, compatibility notes, alternatives, and a final explanation.

The goal is simple: turn an early game idea into a practical, explainable production stack.

## What It Does

- Analyzes a free-text game concept and structured project constraints.
- Recommends a complete game development tool stack.
- Selects an appropriate game engine such as Unity, Unreal, Godot, or Custom.
- Scores tools against budget, platform, skill level, timeline, art capability, and team size.
- Explains why each recommended tool fits the project.
- Shows alternatives when there are multiple reasonable options.
- Saves successful analysis sessions for later review.
- Provides a searchable tool catalog with 67 tools across 7 categories.
- Streams backend progress to the frontend through Server-Sent Events.

## Supported Tool Categories

The current MVP knowledge base covers:

- Game Engine
- IDE
- Version Control
- Art & Asset Creation
- Audio
- AI Coding Assistant
- Deployment & Publishing

The catalog is intentionally bounded. The AI can only recommend tools that exist in the structured knowledge base, which reduces hallucination risk and keeps recommendations traceable.

## Why It Matters

Choosing the wrong stack is expensive for small game teams. A solo beginner building a 2D mobile game should not receive the same stack as an experienced team building a realistic 3D PC game. Budget, platform, skill level, team size, art workflow, and release strategy all change the correct answer.

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
   The React frontend collects the game idea, budget, timeline, skill level, team size, platform targets, art capability, multiplayer flag, and optional constraints.

2. **API validation**
   The Express backend validates the request against generated Zod schemas derived from `lib/api-spec/openapi.yaml`, which is the API source of truth.

3. **Project analysis**
   The backend calls OpenAI with a strict JSON schema to extract project signals, target categories, project summary, 2D/3D signals, target platform, and mentioned engine preferences.

4. **Engine decision**
   A second structured AI step chooses the most suitable engine and records whether it agrees with or challenges the user's preferred engine.

5. **Vectorless RAG retrieval**
   The retrieval step queries the tool catalog by category, engine compatibility, price model, platform overlap, and engine constraints. It uses a tree/catalog-based RAG design instead of embeddings or vector search.

6. **Retry control**
   If retrieval returns too few tools, the pipeline broadens the category search. If it returns too many, it pre-filters candidates by price and platform.

7. **Scoring**
   Candidate tools are scored with deterministic weights for budget, skill, platform, timeline, art capability, and team size.

8. **Recommendation generation**
   OpenAI receives only allowed candidate tools and must respond with a strict JSON schema. Tool IDs are constrained to the retrieved pool, so the model cannot recommend tools outside the catalog.

9. **Trust gate and persistence**
   The backend applies a trust tier, blocks persistence when needed, and stores successful sessions in MySQL through Drizzle ORM.

10. **Frontend result**
    The UI renders the project summary, trust score, top picks, alternatives, strengths, weaknesses, compatibility notes, and final analysis.

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
        +--> Analyze Step       -> OpenAI structured JSON output
        +--> Pick Engine Step   -> OpenAI structured JSON output
        +--> Retrieve Step      -> MySQL/catalog lookup + constraints
        +--> Retry Step         -> broaden or pre-filter candidates
        +--> Scoring Service    -> deterministic candidate scores
        +--> Recommend Step     -> OpenAI structured JSON output
        |
        v
MySQL + Drizzle ORM
        |
        v
Saved sessions, catalog records, statistics
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
|   `-- db/                      # Drizzle schema, migrations, seed scripts
|-- docs/                        # Planning and design documents
|-- plans/                       # Sprint and hackathon planning notes
|-- docker-compose.yml           # Local MySQL service
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
- OpenAI Node SDK
- Server-Sent Events for streaming analysis results
- Zod validation
- Pino logging
- Custom rate limiting middleware

### Data and API

- MySQL 8.4
- Drizzle ORM
- Drizzle Kit
- OpenAPI 3.1
- Orval-generated API client and schemas
- Static JSON catalog fallback
- Tree/catalog-based RAG retrieval

### Build and Tooling

- pnpm workspaces
- esbuild for backend bundling
- Docker Compose for local MySQL
- tsx for scripts and tests

## Requirements

- Node.js 24
- pnpm
- Docker Desktop or a local MySQL 8-compatible database
- OpenAI API key
- Git

## Environment Variables

Create `artifacts/api-server/.env`:

```env
PORT=3000
MYSQL_URL=mysql://root:root@localhost:3306/toolrecommender
OPENAI_API_KEY=your_openai_api_key_here
```

Optional variables:

```env
AI_INTEGRATIONS_OPENAI_API_KEY=your_openai_api_key_here
AI_INTEGRATIONS_OPENAI_BASE_URL=
TRUST_SCORE_BLOCK_THRESHOLD=0
```

The backend reads `AI_INTEGRATIONS_OPENAI_API_KEY` first and falls back to `OPENAI_API_KEY`.

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

4. Start MySQL:

```bash
docker compose up -d
```

5. Create `artifacts/api-server/.env` using the environment variables shown above.

6. Push the database schema:

```bash
pnpm --filter @workspace/db run push
```

7. Seed the tool catalog:

```bash
pnpm --filter @workspace/db run seed:tools
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
pnpm run test
pnpm --filter @workspace/api-spec run codegen
pnpm --filter @workspace/db run push
pnpm --filter @workspace/db run seed:tools
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
- Structured OpenAI analysis and recommendation steps
- Deterministic scoring
- Catalog fallback when DB catalog retrieval fails
- Rate limiting for analysis requests

Not included yet:

- Authentication
- Admin catalog editor
- PDF export
- User accounts
- Vector database
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

## License

MIT
