# PDD Alignment — Sprint 5: Folder Layout + Middleware Finalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach the §5 target folder layout exactly. Extract the pipeline orchestration into `orchestrators/advisorOrchestrator.ts`, the route handlers into `controllers/`, and add the missing `validate.ts` and `errorHandler.ts` middleware. Remove the now-orphan `lib/advisorEngine.ts` and the legacy `GAME_DEV_TOOLS` adapter from `gameDevTools.ts`. After this sprint the repo matches PDD §5 byte-for-byte (folder layout, middleware list, persistence rules).

**Architecture:**
- Routes become thin (verb + path → controller).
- Controllers parse req/res only; they call orchestrators or services.
- The orchestrator owns the analyze pipeline order from §5 (validate → retrieve → score → reason → trust gate → persist → response).
- Services are pure logic (catalog filters, session persistence).
- Middleware is shared infrastructure: `rateLimit`, `validate` (Zod body), `errorHandler` (single global error sink that never leaks orchestrator internals).

**Tech Stack:** Express 5, Zod v4, Drizzle MySQL — all already in place.

**Source spec:** [docs/superpowers/specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md §4.5.1, §4.5.4, §4.5.5](../specs/2026-05-07-pdd-sections-2-3-4-5-alignment-design.md)

**Project conventions:**
- No tests. Verification = `pnpm run typecheck` + dev-server smoke test (analyze flow still works end-to-end).
- Single PR; multiple commits.
- All commands in PowerShell.
- Sprint 4 must be merged first.

**Anti-overengineering boundary:**
- **No new behavior.** This sprint is structural only. If you find yourself adding logic, stop — it belongs in another spec.
- No `IController` / `IOrchestrator` interfaces. Plain modules.
- No DI container. Direct imports.
- `errorHandler.ts` is one express middleware function returning a generic 500. No taxonomy, no RFC7807, no error codes.
- `validate.ts` exposes one factory: `validateBody(schema)`. Nothing else.
- `sessionService.ts` is a few plain functions. No repository class.
- The legacy `GAME_DEV_TOOLS` adapter in `gameDevTools.ts` is deleted; nothing should import it after Sprint 4. Verify with grep before deleting.

---

## File Structure (target — must match exactly)

```
artifacts/api-server/src/
  app.ts                           (thin)
  index.ts                         (boot)
  routes/
    advisor.ts                     (thin — verb/path → controller)
    tools.ts                       (thin)
    health.ts                      (thin)
    index.ts
  controllers/
    advisorController.ts           (NEW)
    toolsController.ts             (NEW)
  services/
    scoringService.ts              (Sprint 4)
    reasoningService.ts            (Sprint 4)
    catalogService.ts              (NEW)
    sessionService.ts              (NEW)
  orchestrators/
    advisorOrchestrator.ts         (NEW)
  middleware/
    rateLimit.ts                   (existing)
    validate.ts                    (NEW)
    errorHandler.ts                (NEW)
  data/
    toolCatalog.json               (Sprint 1)
    toolTree.json                  (Sprint 3)
  lib/
    rag/
      treeNavigator.ts             (Sprint 3)
      index.ts
    gameDevTools.ts                (loader; legacy adapter REMOVED in this sprint)
    logger.ts
  utils/                           (empty for now)
  types/
    pdd.ts                         (Sprint 1)
    tree.ts                        (Sprint 3)
    recommendation.ts              (Sprint 4)
  scripts/
    buildTree.ts                   (Sprint 3)
```

Deleted in this sprint:
- `artifacts/api-server/src/lib/advisorEngine.ts` (Sprint 3 retrieval adapter is folded into `orchestrators/advisorOrchestrator.ts`)
- The `GAME_DEV_TOOLS` / `GameDevTool` / `Ecosystem` / `ArchetypeScope` / `toLegacy` block at the bottom of `gameDevTools.ts`

---

## Task 1: Add `services/catalogService.ts`

**Files:**
- Create: `artifacts/api-server/src/services/catalogService.ts`

This service centralises catalog filters so `routes/tools.ts` and `controllers/toolsController.ts` don't duplicate logic.

- [ ] **Step 1.1: Write the file**

```ts
import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { ToolEntry } from "../types/pdd.js";

export interface CatalogFilters {
  category?: string;
  platform?: string;
  pricing?: string;
  difficulty?: string;
  teamSize?: string;
  fit2d3d?: string;
}

export function listCategoriesWithCounts() {
  return TOOL_CATEGORIES.map((cat) => ({
    ...cat,
    toolCount: TOOL_CATALOG.filter((t) => t.category === cat.id).length,
  }));
}

export function listTools(filters: CatalogFilters): ToolEntry[] {
  let result: ToolEntry[] = [...TOOL_CATALOG];
  if (filters.category)   result = result.filter((t) => t.category === filters.category);
  if (filters.platform)   result = result.filter((t) => (t.supportedPlatforms as readonly string[]).includes(filters.platform!));
  if (filters.pricing)    result = result.filter((t) => t.pricing === filters.pricing);
  if (filters.difficulty) result = result.filter((t) => t.difficultyLevel === filters.difficulty);
  if (filters.teamSize)   result = result.filter((t) => (t.teamSizeFit as readonly string[]).includes(filters.teamSize!));
  if (filters.fit2d3d)    result = result.filter((t) => t.fit2d3d === filters.fit2d3d);
  return result;
}

export function findTool(id: string): ToolEntry | undefined {
  return TOOL_CATALOG.find((t) => t.id === id);
}
```

- [ ] **Step 1.2: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 1.3: Commit**

```powershell
git add artifacts/api-server/src/services/catalogService.ts
git commit -m "feat(api): add catalogService (filters + lookup helpers)"
```

---

## Task 2: Add `services/sessionService.ts`

**Files:**
- Create: `artifacts/api-server/src/services/sessionService.ts`

- [ ] **Step 2.1: Write the file**

```ts
import { db, sessionsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import type { AnalysisResult } from "../types/recommendation.js";

export interface PersistedSessionInput {
  id: string;
  inputs: Record<string, unknown>;
  result: AnalysisResult;
}

export async function persistSession(s: PersistedSessionInput): Promise<void> {
  await db.insert(sessionsTable).values({
    id: s.id,
    inputs: s.inputs,
    result: s.result as unknown as Record<string, unknown>,
    trustScore: s.result.trustScore,
    trustTier: s.result.trustTier,
  });
}

export async function listRecentSessions(limit = 50) {
  return db
    .select({
      id: sessionsTable.id,
      inputs: sessionsTable.inputs,
      trustScore: sessionsTable.trustScore,
      trustTier: sessionsTable.trustTier,
      createdAt: sessionsTable.createdAt,
    })
    .from(sessionsTable)
    .orderBy(desc(sessionsTable.createdAt))
    .limit(limit);
}

export async function findSessionById(id: string) {
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.id, id));
  return row;
}

export async function listAllSessionResults() {
  return db.select({ result: sessionsTable.result }).from(sessionsTable);
}
```

- [ ] **Step 2.2: Typecheck and commit**

```powershell
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/services/sessionService.ts
git commit -m "feat(api): add sessionService (persist + read helpers)"
```

---

## Task 3: Add `middleware/validate.ts` and `middleware/errorHandler.ts`

**Files:**
- Create: `artifacts/api-server/src/middleware/validate.ts`
- Create: `artifacts/api-server/src/middleware/errorHandler.ts`

- [ ] **Step 3.1: Write `validate.ts`**

```ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ZodSchema } from "zod/v4";

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    req.body = parsed.data;
    next();
  };
}
```

- [ ] **Step 3.2: Write `errorHandler.ts`**

```ts
import type { ErrorRequestHandler } from "express";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "unhandled error");
  // Never leak orchestration internals — single generic 500 (§5 explicit rule).
  if (!res.headersSent) {
    res.status(500).json({ error: "Internal server error" });
  }
};
```

- [ ] **Step 3.3: Wire `errorHandler` into `app.ts`**

In `artifacts/api-server/src/app.ts`, after `app.use("/api", router);`, add:

```ts
import { errorHandler } from "./middleware/errorHandler";

// must be the LAST middleware registered
app.use(errorHandler);
```

- [ ] **Step 3.4: Typecheck and commit**

```powershell
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/middleware/validate.ts artifacts/api-server/src/middleware/errorHandler.ts artifacts/api-server/src/app.ts
git commit -m "feat(api): add validateBody and global errorHandler middleware"
```

---

## Task 4: Add `orchestrators/advisorOrchestrator.ts`

**Files:**
- Create: `artifacts/api-server/src/orchestrators/advisorOrchestrator.ts`

This module owns the §5 pipeline order. The Sprint 4 inline pipeline in `routes/advisor.ts` is moved here verbatim, then the route becomes a thin caller via the controller.

- [ ] **Step 4.1: Write the file**

```ts
import { randomUUID } from "node:crypto";
import { retrieveContext } from "../lib/rag/treeNavigator.js";
import { reason } from "../services/reasoningService.js";
import { persistSession } from "../services/sessionService.js";
import type { AnalysisResult } from "../types/recommendation.js";

export interface AdvisorInput {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  otherConstraints?: string | null;
  pinnedToolIds?: string[];
}

export type AdvisorEvent =
  | { type: "retrieval_complete"; retrieval: AnalysisResult["retrieval"] }
  | { type: "done"; result: AnalysisResult };

export async function runAdvisorPipeline(
  input: AdvisorInput,
  emit: (event: AdvisorEvent) => void,
): Promise<AnalysisResult> {
  const retrieval = await retrieveContext(input);
  emit({ type: "retrieval_complete", retrieval });

  const reasoning = await reason(
    {
      projectIdea: input.projectIdea,
      budget: input.budget,
      timeLimit: input.timeLimit,
      skillLevel: input.skillLevel,
      teamSize: input.teamSize,
      platformTarget: input.platformTarget,
      artCapability: input.artCapability,
      otherConstraints: input.otherConstraints,
      pinnedToolIds: input.pinnedToolIds ?? [],
    },
    retrieval,
  );

  const terminated = reasoning.trustTier === "block";
  const sessionId = terminated ? "" : randomUUID();
  const result: AnalysisResult = { ...reasoning, sessionId, terminated };

  if (!terminated) {
    await persistSession({
      id: sessionId,
      inputs: input as unknown as Record<string, unknown>,
      result,
    });
  }

  emit({ type: "done", result });
  return result;
}
```

- [ ] **Step 4.2: Typecheck and commit**

```powershell
pnpm --filter @workspace/api-server run typecheck
git add artifacts/api-server/src/orchestrators/advisorOrchestrator.ts
git commit -m "feat(api): add advisorOrchestrator (validate → retrieve → score → reason → trust → persist)"
```

---

## Task 5: Add controllers and thin out routes

**Files:**
- Create: `artifacts/api-server/src/controllers/advisorController.ts`
- Create: `artifacts/api-server/src/controllers/toolsController.ts`
- Modify: `artifacts/api-server/src/routes/advisor.ts`
- Modify: `artifacts/api-server/src/routes/tools.ts`

- [ ] **Step 5.1: Write `advisorController.ts`**

```ts
import type { Request, Response } from "express";
import { runAdvisorPipeline, type AdvisorInput } from "../orchestrators/advisorOrchestrator.js";
import {
  findSessionById,
  listAllSessionResults,
  listRecentSessions,
} from "../services/sessionService.js";
import type { AnalysisResult } from "../types/recommendation.js";

export async function analyze(req: Request, res: Response): Promise<void> {
  const input = req.body as AdvisorInput;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") res.flushHeaders();
  const send = (event: string, data: unknown): void => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runAdvisorPipeline(input, (e) => {
      if (e.type === "retrieval_complete") send("retrieval_complete", { retrieval: e.retrieval });
      else if (e.type === "done") send("done", e.result);
    });
    res.end();
  } catch (err) {
    console.error("Advisor pipeline failed", err);
    send("error", { message: "Analysis failed." });
    res.end();
  }
}

export async function listSessions(_req: Request, res: Response): Promise<void> {
  const rows = await listRecentSessions(50);
  res.json(rows.map((s) => ({
    id: s.id,
    projectIdea: (s.inputs as { projectIdea?: string }).projectIdea ?? "",
    trustScore: s.trustScore,
    trustTier: s.trustTier,
    createdAt: s.createdAt,
  })));
}

export async function getSession(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({ error: "id is required" });
    return;
  }
  const session = await findSessionById(id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({
    id: session.id,
    projectInput: session.inputs,
    result: session.result,
    createdAt: session.createdAt,
  });
}

export async function getStats(_req: Request, res: Response): Promise<void> {
  const sessions = await listAllSessionResults();
  const toolCounts: Record<string, number> = {};
  const catCounts: Record<string, number> = {};
  let totalConfidence = 0;
  let totalAnalyses = 0;
  for (const s of sessions) {
    const result = s.result as AnalysisResult;
    totalAnalyses++;
    totalConfidence += result.trustScore ?? 0;
    for (const rec of result.recommendations ?? []) {
      const tn = rec.primary.toolId;
      toolCounts[tn] = (toolCounts[tn] ?? 0) + 1;
      catCounts[rec.category] = (catCounts[rec.category] ?? 0) + 1;
    }
  }
  res.json({
    totalAnalyses,
    topRecommendedTools: Object.entries(toolCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([toolName, count]) => ({ toolName, count })),
    popularCategories: Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([category, count]) => ({ category, count })),
    avgConfidenceScore: totalAnalyses > 0 ? Math.round(totalConfidence / totalAnalyses) : 0,
  });
}
```

- [ ] **Step 5.2: Write `toolsController.ts`**

```ts
import type { Request, Response } from "express";
import {
  findTool,
  listCategoriesWithCounts,
  listTools,
  type CatalogFilters,
} from "../services/catalogService.js";

export function getCategories(_req: Request, res: Response): void {
  res.json(listCategoriesWithCounts());
}

export function getTools(req: Request, res: Response): void {
  const q = req.query as Partial<Record<keyof CatalogFilters, string>>;
  res.json(
    listTools({
      category: q.category,
      platform: q.platform,
      pricing: q.pricing,
      difficulty: q.difficulty,
      teamSize: q.teamSize,
      fit2d3d: q.fit2d3d,
    }),
  );
}

export function getToolById(req: Request, res: Response): void {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tool = findTool(id);
  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }
  res.json(tool);
}
```

- [ ] **Step 5.3: Replace `routes/advisor.ts`**

```ts
import { Router, type IRouter } from "express";
import { AnalyzeProjectBody } from "@workspace/api-zod";
import * as advisor from "../controllers/advisorController.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";

const router: IRouter = Router();

router.post("/advisor/analyze", rateLimit, validateBody(AnalyzeProjectBody), advisor.analyze);
router.get("/advisor/sessions", advisor.listSessions);
router.get("/advisor/sessions/:id", advisor.getSession);
router.get("/advisor/stats", advisor.getStats);

export default router;
```

- [ ] **Step 5.4: Replace `routes/tools.ts`**

```ts
import { Router, type IRouter } from "express";
import * as tools from "../controllers/toolsController.js";

const router: IRouter = Router();

router.get("/tools/categories", tools.getCategories);
router.get("/tools", tools.getTools);
router.get("/tools/:id", tools.getToolById);

export default router;
```

- [ ] **Step 5.5: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS.

- [ ] **Step 5.6: Commit**

```powershell
git add artifacts/api-server/src/controllers artifacts/api-server/src/routes
git commit -m "refactor(api): extract controllers; routes are now thin"
```

---

## Task 6: Delete `lib/advisorEngine.ts` and the legacy `GAME_DEV_TOOLS` adapter

**Files:**
- Delete: `artifacts/api-server/src/lib/advisorEngine.ts`
- Modify: `artifacts/api-server/src/lib/gameDevTools.ts` (remove the legacy adapter block)

- [ ] **Step 6.1: Verify no remaining importers**

```powershell
Get-ChildItem -Recurse -Include *.ts artifacts/api-server/src,lib | Select-String -Pattern 'advisorEngine|GAME_DEV_TOOLS|GameDevTool|toLegacy' -SimpleMatch
```

Expected: only matches inside `gameDevTools.ts` itself (the adapter we are about to delete). If anything else matches, fix the importer first.

- [ ] **Step 6.2: Delete `advisorEngine.ts`**

```powershell
Remove-Item artifacts/api-server/src/lib/advisorEngine.ts
```

- [ ] **Step 6.3: Trim `gameDevTools.ts`**

Open `artifacts/api-server/src/lib/gameDevTools.ts`. Remove the entire legacy adapter block — the section beginning with the comment `// Legacy adapter — keeps Sprint 1 booting against advisorEngine.` and ending at the file's last line. After this the file should contain only the loader, `TOOL_CATALOG`, and `TOOL_CATEGORIES` exports.

- [ ] **Step 6.4: Typecheck**

```powershell
pnpm --filter @workspace/api-server run typecheck
```

Expected: PASS. If anything still imports `GAME_DEV_TOOLS`, fix the importer (it should already use `TOOL_CATALOG` after Sprints 1–5).

- [ ] **Step 6.5: Smoke test the full flow**

```powershell
docker compose up -d mysql
pnpm --filter @workspace/api-server run dev
```

POST `/api/advisor/analyze` with the cozy 2D farming JSON from Sprint 4. Expected:
- `retrieval_complete` event fires once.
- `done` event includes `trustScore`, `trustTier`, `terminated`, `recommendations[].primary.phase`, `retrieval.fallbackStatus`.
- A row exists in `advisor_sessions` for non-block responses.

Send a malformed body (e.g. missing `projectIdea`):

```json
{ "budget": "low" }
```

Expected: HTTP 400 with `{ "error": "..." }` from `validateBody`.

Force an exception (temporarily set `OPENAI_API_KEY` to an invalid value, restart, retry the cozy farming JSON). Expected: SSE `error` event from the controller. Reset `OPENAI_API_KEY`.

- [ ] **Step 6.6: Commit**

```powershell
git add artifacts/api-server/src/lib/gameDevTools.ts artifacts/api-server/src/lib
git commit -m "refactor(api): delete advisorEngine and legacy GAME_DEV_TOOLS adapter"
```

---

## Task 7: Final CLAUDE.md pass

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 7.1: Update the Architecture section to describe the final layout**

Replace the Architecture section with a concise version reflecting Sprints 1–5:

```markdown
## Architecture

pnpm monorepo. Packages under `lib/` are shared libraries; `artifacts/` contains the deployable apps.

**API server (`artifacts/api-server/src`):**
- `routes/` — thin Express routers that delegate to controllers.
- `controllers/` — request/response shaping only.
- `orchestrators/advisorOrchestrator.ts` — owns the analyze pipeline (validate → retrieve → score → reason → trust gate → persist).
- `services/` — `scoringService` (deterministic), `reasoningService` (single LLM call), `catalogService` (filters), `sessionService` (MySQL persistence).
- `middleware/` — `rateLimit`, `validateBody(schema)`, `errorHandler` (single global sink, never leaks internals).
- `data/` — `toolCatalog.json` (§2 source of truth), `toolTree.json` (generated tree-of-contents).
- `lib/rag/treeNavigator.ts` — vectorless retrieval using a single structured-output LLM call against the tree.
- `types/` — `pdd.ts`, `tree.ts`, `recommendation.ts` (canonical TypeScript + Zod surface).

**Single sources of truth:**
- API contract: `lib/api-spec/openapi.yaml` → Orval codegen → `lib/api-zod`, `lib/api-client-react`.
- Tool catalog: `artifacts/api-server/src/data/toolCatalog.json` (validated by `ToolCatalogSchema` at boot).
- Tool tree: regenerate via `pnpm --filter @workspace/api-server run tree:build` after editing the catalog.

**Persistence:** MySQL 8.4 (Docker for local dev). Only the `advisor_sessions` table exists. Sessions are persisted only when `result.terminated === false`.

**Trust gate:** `TRUST_SCORE_BLOCK_THRESHOLD` (env, default 25). Below this, response is `terminated: true`, recommendations are absent, and no row is written.
```

- [ ] **Step 7.2: Commit**

```powershell
git add CLAUDE.md
git commit -m "docs(claude-md): final pass for §5 layout"
```

---

## Task 8: Sprint exit checklist

- [ ] **Step 8.1: Verify the target folder layout**

```powershell
Get-ChildItem -Recurse -Directory artifacts/api-server/src | Select-Object FullName
```

Expected directories present: `controllers`, `services`, `orchestrators`, `middleware`, `data`, `routes`, `lib/rag`, `scripts`, `types`, `utils`. The `lib/advisorEngine.ts` file must NOT exist.

- [ ] **Step 8.2: Verify the spec acceptance items (full list from §7)**

```powershell
# 1. No embeddings/pgvector code
Get-ChildItem -Recurse -Include *.ts artifacts/api-server/src,lib | Select-String -Pattern 'embedding|pgvector|cosine|knowledge_chunks' -SimpleMatch
# expected: no output

# 2. lib/db has no pg/Neon
Select-String -Path lib/db/package.json -Pattern '"pg"|@neondatabase'
# expected: no output

# 3. toolCatalog has 7 categories only
$cats = (Get-Content artifacts/api-server/src/data/toolCatalog.json | ConvertFrom-Json) | ForEach-Object { $_.category } | Sort-Object -Unique
$cats.Count
# expected: 7

# 4. Type-check
pnpm run typecheck

# 5. End-to-end clean checkout boot
docker compose down -v
docker compose up -d mysql
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run tree:build
pnpm --filter @workspace/api-server run dev
# expected: server boots; POST /api/advisor/analyze returns trustScore/trustTier/terminated/retrieval/recommendations[].phase

# 6. OpenAPI codegen is committed and stable
pnpm --filter @workspace/api-spec run codegen
git diff --exit-code lib/api-zod lib/api-client-react
# expected: exit 0
```

- [ ] **Step 8.3: Push branch and open final PR**

```powershell
git push -u origin <branch>
gh pr create --title "Sprint 5: §5 folder layout + middleware finalisation" --body "<reference spec §6 sprint 5; closes the PDD §2/§3/§4/§5 alignment work>"
```

PR description should explicitly list the §7 acceptance items (above) and the deletions (`lib/advisorEngine.ts`, legacy adapter block).

---

## Out of scope for Sprint 5

- Frontend updates (§1 spec) — separate work.
- Managed-cloud MySQL hosting decision (§8.1) — deferred to deployment.
- Test framework introduction — explicitly out of scope per spec §2.
- Adding observability/metrics on the orchestrator — not in PDD scope.
