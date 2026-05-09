# PDD Alignment — Sprint 2: MySQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Postgres + pgvector + Neon with MySQL 8.4 (local Docker) for the only remaining persisted entity, `sessions`. Drop `tools`, `knowledge_chunks`, `conversations`, and `messages` tables. The repo type-checks and the advisor pipeline still boots end-to-end at the end of the sprint.

**Architecture:** A single Docker Compose service runs MySQL 8.4 on port 3306. `lib/db` is rewritten on top of `mysql2` + Drizzle's `mysql2` adapter. Tool reads come from `TOOL_CATALOG` (already in place from Sprint 1). Session ids switch from autoincrement integer to CHAR(36) UUID (generated server-side), eliminating the need for Drizzle's `.returning()` (not supported in MySQL dialect).

**Tech Stack:** MySQL 8.4 (Docker), mysql2 driver, Drizzle ORM (mysql2 adapter), Drizzle Kit, Node `crypto.randomUUID()`.

**Source spec:** [docs/superpowers/specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md §4.5.2](../specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md)

**Project conventions:**
- No tests. Verification = `pnpm run typecheck` + manual `curl` smoke against running dev server.
- Single PR; multiple commits per task.
- All commands in PowerShell.
- Sprint 1 must be merged first; this sprint depends on `TOOL_CATALOG` from `gameDevTools.ts`.

**Anti-overengineering boundary:**
- One `db` connection. No connection-pool tuning constants.
- One schema file (`sessions.ts`). No leftover `conversations`/`messages`/`tools`/`knowledge_chunks` even as "future use".
- No data migration script — there is no existing production data to migrate (this is a dev-only project today).
- Use `crypto.randomUUID()` directly. No UUID library.
- No `MysqlSessionRepository` / `IDatabase` interface. Direct Drizzle calls.
- Connection-string env name follows §5.2: `MYSQL_URL`. Don't keep a `DATABASE_URL` alias.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `docker-compose.yml` | Create at repo root | MySQL 8.4 service for local dev |
| `.env.example` | Modify | Replace `DATABASE_URL` with `MYSQL_URL`; document defaults |
| `artifacts/api-server/.env` | Modify | Local dev value `mysql://root:root@localhost:3306/toolrecommender` |
| `artifacts/api-server/package.json` | Modify | Drop `pg`; add `mysql2` |
| `lib/db/package.json` | Modify | Drop `pg`, `@types/pg`; add `mysql2` |
| `lib/db/src/index.ts` | Rewrite | mysql2 pool + Drizzle mysql2 adapter |
| `lib/db/src/schema/sessions.ts` | Rewrite | MySQL dialect, CHAR(36) UUID id, JSON columns |
| `lib/db/src/schema/index.ts` | Rewrite | Export only `sessions` |
| `lib/db/src/schema/tools.ts` | Delete | Catalog lives only in JSON now |
| `lib/db/src/schema/knowledgeChunks.ts` | Delete | Vector store removed |
| `lib/db/src/schema/conversations.ts` | Delete | Unused |
| `lib/db/src/schema/messages.ts` | Delete | Unused |
| `lib/db/drizzle.config.ts` | Modify | dialect: `"mysql"`, read `MYSQL_URL` |
| `artifacts/api-server/src/routes/advisor.ts` | Modify | Generate UUID for session id; drop `toolsTable` query and `toolIdMap` |
| `lib/api-spec/openapi.yaml` | Modify | `ToolRecommendation.toolId`: integer → string; `SessionSummary.id`, `Session.id`, `AnalysisResult.sessionId`: integer → string |
| `CLAUDE.md` | Modify | Replace `rag:seed` and Postgres docs with MySQL/Docker workflow |

---

## Task 1: Add Docker Compose for MySQL

**Files:**
- Create: `docker-compose.yml` at repo root
- Modify: `.env.example`
- Modify: `artifacts/api-server/.env` (or create if missing)

- [ ] **Step 1.1: Create `docker-compose.yml`**

```yaml
services:
  mysql:
    image: mysql:8.4
    container_name: toolrecommender-mysql
    environment:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: toolrecommender
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-uroot", "-proot"]
      interval: 5s
      timeout: 3s
      retries: 20

volumes:
  mysql-data:
```

- [ ] **Step 1.2: Replace `.env.example`**

Replace contents of `.env.example` (root) with:

```env
# API server
PORT=3000
OPENAI_API_KEY=sk-replace-me

# MySQL (matches docker-compose.yml defaults)
MYSQL_URL=mysql://root:root@localhost:3306/toolrecommender

# Trust score gate (Sprint 4); keep documented now to avoid surprises
TRUST_SCORE_BLOCK_THRESHOLD=25
```

- [ ] **Step 1.3: Update `artifacts/api-server/.env`**

If the file exists, replace `DATABASE_URL=...` with `MYSQL_URL=mysql://root:root@localhost:3306/toolrecommender`. Keep `OPENAI_API_KEY` and `PORT`.

If the file does not exist, create it from `.env.example` minus secrets.

- [ ] **Step 1.4: Boot MySQL and confirm reachability**

```powershell
docker compose up -d mysql
docker compose ps
```

Expected: `toolrecommender-mysql` shows `(healthy)` after ~10s.

- [ ] **Step 1.5: Commit**

```powershell
git add docker-compose.yml .env.example artifacts/api-server/.env
git commit -m "feat(infra): add MySQL 8.4 docker-compose for local dev"
```

---

## Task 2: Swap database driver dependencies

**Files:**
- Modify: `lib/db/package.json`
- Modify: `artifacts/api-server/package.json`

- [ ] **Step 2.1: Edit `lib/db/package.json`**

Replace `"pg": "^8.20.0"` in `dependencies` with `"mysql2": "^3.11.0"`. Remove `@types/pg` from `devDependencies`. Final shape:

```json
{
  "dependencies": {
    "dotenv": "^17.4.2",
    "drizzle-orm": "catalog:",
    "drizzle-zod": "^0.8.3",
    "mysql2": "^3.11.0",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:",
    "drizzle-kit": "^0.31.9"
  }
}
```

- [ ] **Step 2.2: Edit `artifacts/api-server/package.json`**

Remove `"pg": "^8.20.0"` from `dependencies`. Add `"mysql2": "^3.11.0"`. Final `dependencies` block:

```json
{
  "dependencies": {
    "@workspace/api-zod": "workspace:*",
    "@workspace/db": "workspace:*",
    "cookie-parser": "^1.4.7",
    "cors": "^2",
    "dotenv": "^17.4.2",
    "drizzle-orm": "catalog:",
    "express": "^5",
    "mysql2": "^3.11.0",
    "openai": "^6.34.0",
    "pino": "^9",
    "pino-http": "^10"
  }
}
```

Note: keep the `rag:seed` script entry for now — it is removed in Sprint 3 along with the script file.

- [ ] **Step 2.3: Install**

```powershell
pnpm install
```

Expected: lockfile updates. The repo's `minimumReleaseAge: 1440` policy may delay if `mysql2 ^3.11.0` is fresher than 1 day — pin to a slightly older minor (e.g. `^3.10.0`) if blocked.

- [ ] **Step 2.4: Commit**

```powershell
git add lib/db/package.json artifacts/api-server/package.json pnpm-lock.yaml
git commit -m "chore(deps): replace pg with mysql2"
```

---

## Task 3: Rewrite `lib/db` for MySQL

**Files:**
- Rewrite: `lib/db/src/index.ts`
- Rewrite: `lib/db/src/schema/sessions.ts`
- Rewrite: `lib/db/src/schema/index.ts`
- Delete: `lib/db/src/schema/tools.ts`
- Delete: `lib/db/src/schema/knowledgeChunks.ts`
- Delete: `lib/db/src/schema/conversations.ts`
- Delete: `lib/db/src/schema/messages.ts`
- Modify: `lib/db/drizzle.config.ts`

- [ ] **Step 3.1: Replace `lib/db/src/schema/sessions.ts`**

```ts
import { mysqlTable, char, json, timestamp, varchar, int } from "drizzle-orm/mysql-core";

export const sessionsTable = mysqlTable("advisor_sessions", {
  id: char("id", { length: 36 }).primaryKey(),
  inputs: json("inputs").$type<Record<string, unknown>>().notNull(),
  result: json("result").$type<Record<string, unknown>>().notNull(),
  trustScore: int("trust_score").notNull().default(0),
  trustTier: varchar("trust_tier", { length: 8 }).notNull().default("pass"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
```

Notes:
- `trustScore`/`trustTier` columns exist now to keep the schema stable for Sprint 4. Defaults make Sprint 2 inserts (which don't yet supply them) succeed.
- `inputs` consolidates the old `projectIdea`/`projectInput`/`detectedProjectType`/`stackOverview`/`overallConfidence` fan-out into a single JSON column.

- [ ] **Step 3.2: Replace `lib/db/src/schema/index.ts`**

```ts
export * from "./sessions";
```

- [ ] **Step 3.3: Delete obsolete schema files**

```powershell
Remove-Item lib/db/src/schema/tools.ts
Remove-Item lib/db/src/schema/knowledgeChunks.ts
Remove-Item lib/db/src/schema/conversations.ts
Remove-Item lib/db/src/schema/messages.ts
```

- [ ] **Step 3.4: Replace `lib/db/src/index.ts`**

```ts
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

if (!process.env.MYSQL_URL) {
  throw new Error("MYSQL_URL must be set. Did you forget to start docker compose?");
}

export const pool = mysql.createPool(process.env.MYSQL_URL);
export const db = drizzle(pool, { schema, mode: "default" });

export * from "./schema";
```

- [ ] **Step 3.5: Replace `lib/db/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../artifacts/api-server/.env") });

if (!process.env.MYSQL_URL) {
  throw new Error("MYSQL_URL must be set");
}

export default defineConfig({
  schema: resolve(__dirname, "./src/schema/index.ts"),
  dialect: "mysql",
  dbCredentials: { url: process.env.MYSQL_URL },
});
```

- [ ] **Step 3.6: Push the schema to MySQL**

```powershell
pnpm --filter @workspace/db run push
```

Expected: drizzle-kit creates the `advisor_sessions` table. Confirm with:

```powershell
docker exec -i toolrecommender-mysql mysql -uroot -proot toolrecommender -e "SHOW TABLES; DESCRIBE advisor_sessions;"
```

Expected: one table `advisor_sessions` with columns `id, inputs, result, trust_score, trust_tier, created_at`.

- [ ] **Step 3.7: Commit**

```powershell
git add lib/db/
git commit -m "feat(db): port lib/db to MySQL (sessions only)"
```

---

## Task 4: Update `routes/advisor.ts` for the new schema

**Files:**
- Modify: `artifacts/api-server/src/routes/advisor.ts`

The current file does three Postgres-specific things that must change:
1. Imports `toolsTable` (deleted) and builds `toolIdMap: Record<string, number>` to attach `toolId` to recommendations.
2. Calls `.returning()` on insert (not supported in MySQL dialect).
3. Reads `sessionsTable.id` as a number; the column is now CHAR(36).

- [ ] **Step 4.1: Patch the imports**

Replace:

```ts
import { db, sessionsTable, toolsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
```

with:

```ts
import { randomUUID } from "node:crypto";
import { db, sessionsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
```

- [ ] **Step 4.2: Drop the `toolIdMap` integer-from-DB branch**

In the analyze handler, find:

```ts
const dbTools = await db.select().from(toolsTable);
const toolIdMap: Record<string, number> = {};
for (const t of dbTools) toolIdMap[t.name] = t.id;
```

Replace with:

```ts
const toolIdMap: Record<string, string> = Object.fromEntries(
  GAME_DEV_TOOLS.map((t) => [t.name, t.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")]),
);
```

(`toolId` is now the catalog slug. Sprint 4 will replace this with a direct lookup against `TOOL_CATALOG[*].id` once the catalog import path is refactored; for Sprint 2 derive the slug from name to stay green.)

In `toRecommendationDTO`, change `toolId: toolIdMap[entry.topTool.name] ?? 0` → `toolId: toolIdMap[entry.topTool.name] ?? ""`. Same in the alternatives `.map`. Change the parameter type `toolIdMap: Record<string, number>` to `Record<string, string>`.

- [ ] **Step 4.3: Rewrite the two session inserts**

Replace the blocked-result insert:

```ts
const [session] = await db
  .insert(sessionsTable)
  .values({
    projectIdea: input.projectIdea,
    projectInput: input as object,
    detectedProjectType: metadata.detectedProjectType,
    stackOverview: metadata.stackOverview,
    overallConfidence: metadata.overallConfidence,
    result: blockedResult as object,
  })
  .returning();

blockedResult.sessionId = session.id;
```

with:

```ts
const sessionId = randomUUID();
blockedResult.sessionId = sessionId;
await db.insert(sessionsTable).values({
  id: sessionId,
  inputs: input as Record<string, unknown>,
  result: blockedResult as Record<string, unknown>,
});
```

Apply the same change to the success-path insert further down — generate the UUID first, set `resultObj.sessionId = sessionId`, then insert. Drop `.returning()` entirely.

Also change `sessionId: 0` initial values in `blockedResult` and `resultObj` to `sessionId: ""`.

- [ ] **Step 4.4: Update the sessions list and detail handlers**

For `GET /advisor/sessions`, replace the `select(...)` block with:

```ts
const sessions = await db
  .select({
    id: sessionsTable.id,
    inputs: sessionsTable.inputs,
    trustScore: sessionsTable.trustScore,
    trustTier: sessionsTable.trustTier,
    createdAt: sessionsTable.createdAt,
  })
  .from(sessionsTable)
  .orderBy(desc(sessionsTable.createdAt))
  .limit(50);

res.json(sessions.map((s) => ({
  id: s.id,
  projectIdea: (s.inputs as { projectIdea?: string }).projectIdea ?? "",
  trustScore: s.trustScore,
  trustTier: s.trustTier,
  createdAt: s.createdAt,
})));
```

For `GET /advisor/sessions/:id`, replace the `GetSessionParams.safeParse` branch with a direct check:

```ts
const id = req.params.id;
if (typeof id !== "string" || id.length === 0) {
  res.status(400).json({ error: "id is required" });
  return;
}
const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
```

The rest of the handler is unchanged. Remove the now-unused `GetSessionParams` import.

- [ ] **Step 4.5: Update `/advisor/stats` only if typecheck flags it**

The existing loop reads from `s.result` (a JSON column) — MySQL JSON behaves identically here. Likely no code change. If typecheck flags `s.id` arithmetic, swap to string handling.

- [ ] **Step 4.6: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 4.7: Smoke test**

```powershell
pnpm --filter @workspace/api-server run dev
```

POST to `/api/advisor/analyze` with:

```json
{ "projectIdea": "test", "budget": "low", "timeLimit": "month", "skillLevel": "beginner", "teamSize": "solo", "platformTarget": ["pc"], "artCapability": "basic" }
```

Expected: streaming completes, final event includes a `sessionId` that is a 36-char UUID string. Then:

```powershell
docker exec -i toolrecommender-mysql mysql -uroot -proot toolrecommender -e "SELECT id, trust_tier FROM advisor_sessions ORDER BY created_at DESC LIMIT 1;"
```

Expected: one row with the UUID.

Stop the server.

- [ ] **Step 4.8: Commit**

```powershell
git add artifacts/api-server/src/routes/advisor.ts
git commit -m "refactor(api): generate session UUIDs, drop toolsTable join, use mysql session schema"
```

---

## Task 5: Update OpenAPI for string ids

The Sprint 1 OpenAPI changes already moved `Tool.id` to string. Sprint 2 must propagate the string type to recommendation/session shapes whose `toolId`/`sessionId`/session `id` are no longer integers.

**Files:**
- Modify: `lib/api-spec/openapi.yaml`

- [ ] **Step 5.1: Patch `ToolRecommendation.toolId`**

Locate the `ToolRecommendation` schema (around line 243). Change:

```yaml
        toolId:
          type: integer
```

to:

```yaml
        toolId:
          type: string
```

- [ ] **Step 5.2: Patch session id types**

In `AnalysisResult`:

```yaml
        sessionId:
          type: integer
```

→

```yaml
        sessionId:
          type: string
```

In `SessionSummary`:

```yaml
        id:
          type: integer
```

→

```yaml
        id:
          type: string
```

In `Session`:

```yaml
        id:
          type: integer
```

→

```yaml
        id:
          type: string
```

In the `/advisor/sessions/{id}` path parameter:

```yaml
          schema:
            type: integer
```

→

```yaml
          schema:
            type: string
```

- [ ] **Step 5.3: Codegen**

```powershell
pnpm --filter @workspace/api-spec run codegen
```

- [ ] **Step 5.4: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 5.5: Commit**

```powershell
git add lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react
git commit -m "feat(api-spec): switch toolId and sessionId to string"
```

---

## Task 6: Update CLAUDE.md and remove the obsolete dataset script

**Files:**
- Modify: `CLAUDE.md`
- Modify: `artifacts/api-server/package.json` (remove `dataset:popularity` only — `rag:seed` is removed in Sprint 3)

- [ ] **Step 6.1: Update `CLAUDE.md` commands block**

Replace the commands fence with:

````markdown
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
````

Remove the `pnpm --filter @workspace/api-server run rag:seed` line entirely.

In the Architecture section, replace the RAG layer paragraph with:

```markdown
**Catalog-first reads:** `/tools*` reads from `artifacts/api-server/src/data/toolCatalog.json` (loaded and validated at boot). MySQL is only used for `advisor_sessions`. The `tools` and `knowledge_chunks` Postgres tables and pgvector are gone.
```

In the DB schema bullet list, leave only:
- `lib/db/src/schema/sessions.ts — analysis sessions`

In the Tool catalog paragraph, replace the seed instruction with:
> Adding a new tool: edit `toolCatalog.json` and re-run `pnpm run typecheck` (the loader will reject malformed entries at boot).

- [ ] **Step 6.2: Drop the obsolete dataset script entry**

In `artifacts/api-server/package.json`, remove the `dataset:popularity` script line. Leave `rag:seed` for Sprint 3 to remove (it still references files that exist).

- [ ] **Step 6.3: Commit**

```powershell
git add CLAUDE.md artifacts/api-server/package.json
git commit -m "docs(claude-md): document MySQL workflow, drop popularity script"
```

---

## Task 7: Sprint exit checklist

- [ ] **Step 7.1: Verify acceptance**

```powershell
# 1. No pg/pgvector/Neon imports remain
Get-ChildItem -Recurse -Include *.ts artifacts/api-server/src,lib/db/src | Select-String -Pattern 'from "pg"|pgvector|@neondatabase' -SimpleMatch
# expected: no output

# 2. Type-check passes
pnpm run typecheck
# expected: pass

# 3. Clean MySQL boot path works
docker compose down -v
docker compose up -d mysql
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run dev
# expected: server logs "Server listening" without throwing
```

- [ ] **Step 7.2: Push branch and open PR**

```powershell
git push -u origin <branch>
gh pr create --title "Sprint 2: MySQL migration" --body "<reference spec §6 sprint 2>"
```

PR description should explicitly note:
- All schema state is recreated from `pnpm run push`; no manual data migration.
- `tools`, `knowledge_chunks`, `conversations`, `messages` tables are intentionally not ported.
- `sessionId` is now a UUID string.

---

## Out of scope for Sprint 2

- Removing `rag:seed` script entry, the `lib/rag/*` files, and the embeddings pipeline — done in Sprint 3.
- New `trustScore` / `terminated` / `retrieval` fields on `AnalysisResult` — Sprint 4.
- Folder restructure (`controllers/services/orchestrators`) — Sprint 5.
- Managed-cloud MySQL hosting decision (per spec §8.1, deferred to deployment time).
