# Hackathon MVP — 5-Day Sprint Construction Plan

**Objective:** Game Dev Stack Advisor hackathon-ready MVP  
**Spec:** `docs/superpowers/specs/2026-05-04-mvp-roadmap-design.md`  
**Deadline:** 2026-05-09 (5 days from 2026-05-04)  
**Mode:** Direct (no GitHub remote)

---

## Steps at a Glance

| # | Step | Day | Depends On | Parallel With |
|---|------|-----|------------|---------------|
| 1 | Catalog Expansion (27 → 116 tools) | 1–2 | — | 2 |
| 2 | Evidence Schema + Codegen | 2 | — | 1 |
| 3 | Engine Evidence Output | 2 | 2 | — |
| 4 | SSE Streaming Backend | 3 | 3 | — |
| 5 | Why This UI Panel | 3 | 2 | 4 |
| 6 | Streaming Frontend | 3 | 4 + 5 | — |
| 7 | Rate Limiting Middleware | 5 | — | 8, 9 |
| 8 | Public Session URL + OG Tags | 4 | 2 | 7 |
| 9 | UX Polish + Copy Review | 4 | 5 | 7, 8 |
| 10 | RAG Re-seed + Smoke Tests + Deploy | 5 | All | — |

---

## Step 1 — Catalog Expansion (27 → ~116 tools)

**Day:** 1–2 (8h total)  
**File:** `artifacts/api-server/src/lib/gameDevTools.ts`  
**Blocks:** Step 10 (RAG seed quality)

### Context Brief

The tool catalog is the knowledge base for both rule-based scoring and RAG embeddings. Currently 27 tools across 9 categories. The target is ~116 tools across 16 categories. Each tool is a `GameDevTool` object with: `id` (unique int), `name`, `category`, `description`, `website`, `pricing`, `minSkillLevel`, `platforms`, `strengths`, `weaknesses`, `bestFor`, `tags`.

The `scoreTool()` function in `advisorEngine.ts` uses `tool.pricing`, `tool.minSkillLevel`, `tool.platforms`, and `tool.tags` for scoring. Descriptions are embedded into pgvector for RAG. **Quality of descriptions matters more than quantity** — each description should be 2-4 sentences of dense, factual content.

Category IDs must be registered in the `TOOL_CATEGORIES` array (bottom of the file) before tools referencing them can be returned by the API's `/tools/categories` endpoint.

### Task List

**Existing categories — deepen:**

- `engine`: Add Cocos Creator, Defold, LÖVE, Construct 3, Bevy (5→8, total +3)
- `programming`: Add C++, Lua, JavaScript/TypeScript, Rust, Haxe, Python (2→8)
- `art`: Add Substance Painter, Substance Designer, ZBrush, Maya, Procreate, Pyxel Edit (4→10)
- `animation`: Add Cascadeur, Mixamo, Live2D Cubism, Maya Animation (2→6)
- `ui`: Add NoesisGUI, Rive (2→4)
- `vfx`: Add Niagara (UE5), Houdini, EmberGen (3→6)
- `version_control`: Add Perforce Helix Core, GitLab, Diversion (2→5)
- `deployment`: Add Epic Games Store, GOG Connect, Xbox/PlayStation/Nintendo Partner portals, CrazyGames, Poki (4→10)
- `ai_tooling`: Expand from 3 to 20 tools — include both:
  - General AI dev tools: Cursor, Claude Code, Windsurf, v0.dev, Lovable, Bolt.new, GitHub Copilot (keep), Midjourney (keep), ChatGPT (keep)
  - Game-specific AI: Scenario.gg, Leonardo.ai, Suno, Eleven Labs, Meshy, Tripo3D, Inworld AI, Convai, Rosebud AI, Layer.ai, Promethean AI, Charisma.ai, Krea, Runway, Move.ai

**New categories — add to `TOOL_CATEGORIES` array AND add tools:**

- `audio` (8): FMOD Studio, Wwise, Audacity, Reaper, Soundly, BFXR, Eleven Labs TTS, Suno
- `networking` (6): Photon Fusion, Mirror Networking, Unity Netcode for GameObjects, Nakama, Colyseus, Amazon GameLift
- `backend_services` (6): PlayFab, Unity Gaming Services, GameSparks, Firebase, Supabase, Beamable
- `monetization` (5): AppLovin MAX, Unity LevelPlay, AdMob, Xsolla, Stripe
- `analytics` (5): GameAnalytics, deltaDNA, Amplitude, Mixpanel, Unity Analytics
- `narrative` (5): Twine, Ink (inkle), Yarn Spinner, Articy:draft 3, ChatMapper
- `build_ci` (4): Unity Cloud Build, GameCI (Docker), GitHub Actions, Buildkite

**For each new tool entry, ensure:**
- `id` is unique across the entire file (continue from last existing id)
- `platforms` array uses lowercase values matching existing pattern: `"pc"`, `"mobile"`, `"web"`, `"console"`, `"vr"`, `"cross-platform"`
- `pricing` is one of: `"free"`, `"freemium"`, `"paid"`, `"subscription"`, `"open_source"`
- `minSkillLevel` is one of: `"beginner"`, `"intermediate"`, `"advanced"`, `"expert"`
- `tags` array includes relevant terms from: `"beginner-friendly"`, `"game-jam"`, `"ai"`, `"2d"`, `"3d"`, `"open-source"`, `"cloud"`, `"realtime"`, etc.

### Verification

```bash
pnpm run typecheck
# Count tools (run from repo root):
node -e "const t=require('./artifacts/api-server/src/lib/gameDevTools.ts');console.log(t)" 2>/dev/null || grep -c "  id:" artifacts/api-server/src/lib/gameDevTools.ts
```

### Exit Criteria

- `pnpm run typecheck` passes with zero errors
- Total tool count ≥ 100 (target 116)
- All 16 category IDs registered in `TOOL_CATEGORIES`
- No duplicate `id` values
- RAG re-seed deferred to Step 10

---

## Step 2 — Evidence Schema + Codegen

**Day:** 2 (1.5h)  
**File:** `lib/api-spec/openapi.yaml`  
**Then:** `pnpm --filter @workspace/api-spec run codegen`  
**Blocks:** Steps 3, 5, 6, 8

### Context Brief

`lib/api-spec/openapi.yaml` is the single source of truth. Orval generates:
- `lib/api-client-react/src/generated/` — TanStack Query hooks + TS types for the frontend
- `lib/api-zod/src/generated/` — Zod schemas for server-side validation

Add `evidence` to `ToolRecommendation` as an **optional** field (not in `required` array) so the server can omit it gracefully and existing session data stays valid.

### Task List

1. **Add `ScoreBreakdown` schema** to `components/schemas`:
   ```yaml
   ScoreBreakdown:
     type: object
     properties:
       budget: { type: number }
       skill: { type: number }
       platform: { type: number }
       timeLimit: { type: number }
       artCapability: { type: number }
       total: { type: number }
     required: [budget, skill, platform, timeLimit, artCapability, total]
   ```

2. **Add `RagChunk` schema**:
   ```yaml
   RagChunk:
     type: object
     properties:
       text: { type: string }
       source: { type: string }
       score: { type: ["number", "null"] }
     required: [text, source]
   ```

3. **Add `Evidence` schema**:
   ```yaml
   Evidence:
     type: object
     properties:
       scoreBreakdown: { $ref: "#/components/schemas/ScoreBreakdown" }
       ragChunks:
         type: array
         items: { $ref: "#/components/schemas/RagChunk" }
     required: [scoreBreakdown, ragChunks]
   ```

4. **Add optional `evidence` to `ToolRecommendation`** (do NOT add to `required`):
   ```yaml
   evidence:
     $ref: "#/components/schemas/Evidence"
   ```

5. **Run codegen:**
   ```bash
   pnpm --filter @workspace/api-spec run codegen
   ```

6. Fix any TypeScript errors introduced by codegen.

### Verification

```bash
pnpm run typecheck
# Check generated types:
grep -l "Evidence\|RagChunk\|ScoreBreakdown" lib/api-client-react/src/generated/api.schemas.ts
```

### Exit Criteria

- `pnpm run typecheck` passes
- `Evidence`, `RagChunk`, `ScoreBreakdown` types exist in `lib/api-client-react/src/generated/api.schemas.ts`
- `ToolRecommendation` has optional `evidence?: Evidence` field

---

## Step 3 — Engine Evidence Output

**Day:** 2 (1.5h)  
**File:** `artifacts/api-server/src/lib/advisorEngine.ts`  
**Also:** `artifacts/api-server/src/routes/advisor.ts`  
**Depends On:** Step 2  
**Blocks:** Step 4

### Context Brief

`scoreTool()` computes budget/skill/platform/timeLimit/artCapability deltas but returns only a single clamped total. The goal is to expose each dimension's contribution so the UI can show a breakdown.

`analyzeProjectWithAI()` already retrieves RAG chunks via `retrieveKnowledgeForAdvisor()` — they just need to be returned alongside the result so the route can pass them through to `evidence.ragChunks`.

### Task List

1. **Add `ScoreBreakdown` interface** in `advisorEngine.ts`:
   ```typescript
   interface ScoreBreakdown {
     budget: number;
     skill: number;
     platform: number;
     timeLimit: number;
     artCapability: number;
     total: number;
   }
   ```

2. **Refactor `scoreTool()`** to return `{ total: number; breakdown: ScoreBreakdown }` instead of `number`. Track each dimension delta separately, sum them, clamp `total`.

3. **Thread `scoreBreakdown` through `categoryResults`** — each tool entry carries its breakdown.

4. **Extend `analyzeProjectWithAI()` return type** to include:
   ```typescript
   ragChunks: Array<{ text: string; source: string; score?: number }>;
   ```
   Map the already-retrieved `getRetrievedKnowledgeChunks()` output to this shape.

5. **Update `advisor.ts` route** to populate `evidence` on each `ToolRecommendation`:
   ```typescript
   evidence: {
     scoreBreakdown: cr.topTool.scoreBreakdown,
     ragChunks: analysis.ragChunks,
   }
   ```

### Verification

```bash
pnpm run typecheck
# Start dev server, then:
curl -s -X POST http://localhost:3000/api/advisor/analyze \
  -H "Content-Type: application/json" \
  -d '{"projectIdea":"2D platformer","budget":"low","timeLimit":"month","skillLevel":"intermediate","teamSize":"solo","platformTarget":["pc"],"artCapability":"basic"}' \
  | node -e "const d=require('fs').readFileSync(0,'utf8');const r=JSON.parse(d);console.log(JSON.stringify(r.categories?.[0]?.topPick?.evidence,null,2))"
```

### Exit Criteria

- `pnpm run typecheck` passes
- Response includes `categories[0].topPick.evidence.scoreBreakdown` with 6 numeric keys
- `categories[0].topPick.evidence.ragChunks` is an array (empty if RAG not yet seeded)

---

## Step 4 — SSE Streaming Backend

**Day:** 3 (2h)  
**File:** `artifacts/api-server/src/routes/advisor.ts`  
**Depends On:** Step 3  
**Blocks:** Step 6

### Context Brief

Currently the route returns one JSON blob after a full OpenAI call (~5–15s). Judges see nothing.

**Critical constraint:** OpenAI `response_format: { type: "json_object" }` is incompatible with `stream: true`. The solution is to split into two calls:
- **Phase 1** (non-streamed, JSON mode): `projectSummary`, `detectedProjectType`, `stackOverview`, `overallConfidence` — keep existing prompt/parse
- **Phase 2** (streamed, prose mode, no response_format): `finalSummary` — stream tokens via `stream: true`

SSE wire format:
```
event: <name>\ndata: <json>\n\n
```

Events to emit in order:
1. `scoring_complete` — immediately after scoring all tools (before any OpenAI call)
2. `metadata_complete` — after Phase 1 JSON call
3. `narrative_chunk` — one per token from Phase 2 stream (`{ token: string }`)
4. `done` — full `AnalysisResult` (after DB insert)
5. `error` — on any unhandled exception (`{ message: string }`)

### Task List

1. **Set SSE headers** at the top of the route handler:
   ```typescript
   res.setHeader("Content-Type", "text/event-stream");
   res.setHeader("Cache-Control", "no-cache");
   res.setHeader("Connection", "keep-alive");
   res.flushHeaders();
   const send = (event: string, data: unknown) =>
     res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
   ```

2. **Emit `scoring_complete`** immediately after computing `categoryResults` (before any OpenAI call).

3. **Phase 1 OpenAI call** — same prompt as today but remove all `finalSummary` generation; emit `metadata_complete`.

4. **Phase 2 streaming call:**
   ```typescript
   const stream = await openai.chat.completions.create({
     model: "gpt-5-mini",
     stream: true,
     messages: [{ role: "user", content: finalSummaryPrompt }],
   });
   let finalSummary = "";
   for await (const chunk of stream) {
     const token = chunk.choices[0]?.delta?.content ?? "";
     if (token) { finalSummary += token; send("narrative_chunk", { token }); }
   }
   ```

5. **DB insert** after streaming; emit `done` with complete `AnalysisResult`; call `res.end()`.

6. **Wrap in try/catch** — on error: `send("error", { message: "Analysis failed." }); res.end();`

### Verification

```bash
curl -N -X POST http://localhost:3000/api/advisor/analyze \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"projectIdea":"2D platformer","budget":"low","timeLimit":"month","skillLevel":"beginner","teamSize":"solo","platformTarget":["pc"],"artCapability":"none"}'
# Should see: event: scoring_complete → event: metadata_complete → event: narrative_chunk (×N) → event: done
pnpm run typecheck
```

### Exit Criteria

- `event: scoring_complete` arrives within 500ms of request
- `event: narrative_chunk` events arrive progressively
- `event: done` payload contains complete `AnalysisResult` with `evidence`
- `pnpm run typecheck` passes

---

## Step 5 — Why This UI Panel

**Day:** 3 (2h)  
**File:** `artifacts/game-dev-advisor/src/pages/Analyzer.tsx`  
**Depends On:** Step 2 (for `Evidence` type)  
**Parallel With:** Step 4 (can build with static mock data first)

### Context Brief

Each `CategoryCard` shows `topPick.reasoning`. Add an expandable "Why this recommendation?" section using the shadcn `Collapsible` component (already at `src/components/ui/collapsible.tsx`).

Panel content:
1. **Score Breakdown** — `evidence.scoreBreakdown`: small grid, 5 rows (Budget / Skill / Platform / Time / Art), plain numbers. No charts.
2. **RAG Chunks** — `evidence.ragChunks`: each as a blockquote with source attribution below.

Only render if `topPick.evidence` is present (the field is optional).

### Task List

1. **Import `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`** from `@/components/ui/collapsible`.

2. **Create `EvidencePanel` component:**
   ```tsx
   function EvidencePanel({ evidence }: { evidence: Evidence }) {
     return (
       <div className="mt-3 space-y-4 text-xs text-muted-foreground">
         <div>
           <p className="font-semibold mb-1 text-foreground">Score Breakdown</p>
           <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
             {Object.entries(evidence.scoreBreakdown)
               .filter(([k]) => k !== "total")
               .map(([k, v]) => (
                 <><dt className="capitalize">{k}</dt><dd className="font-mono">{v}</dd></>
               ))}
           </dl>
         </div>
         {evidence.ragChunks.length > 0 && (
           <div>
             <p className="font-semibold mb-1 text-foreground">Knowledge Sources</p>
             {evidence.ragChunks.map((chunk, i) => (
               <blockquote key={i} className="border-l-2 border-border pl-2 mb-2 italic">
                 {chunk.text}
                 <footer className="not-italic text-muted-foreground/60 mt-1">{chunk.source}</footer>
               </blockquote>
             ))}
           </div>
         )}
       </div>
     );
   }
   ```

3. **Add `Collapsible` to `CategoryCard`** below the alternatives toggle:
   ```tsx
   {cat.topPick.evidence && (
     <Collapsible className="mt-3">
       <CollapsibleTrigger className="text-xs text-primary hover:underline">
         Why this recommendation?
       </CollapsibleTrigger>
       <CollapsibleContent>
         <EvidencePanel evidence={cat.topPick.evidence} />
       </CollapsibleContent>
     </Collapsible>
   )}
   ```

4. **Update `CATEGORY_LABELS`** to cover all 16 categories:
   ```typescript
   audio: "Audio & Music",
   networking: "Networking",
   backend_services: "Backend Services",
   monetization: "Monetization",
   analytics: "Analytics",
   narrative: "Narrative Tools",
   build_ci: "Build & CI",
   ```

### Verification

- `pnpm run typecheck` passes
- Start frontend dev server; submit a test analysis
- Click "Why this recommendation?" — panel expands with score breakdown + chunks

### Exit Criteria

- Collapsible opens/closes cleanly
- Score breakdown shows 5 numeric rows
- RAG chunks render with source attribution
- `pnpm run typecheck` passes

---

## Step 6 — Streaming Frontend

**Day:** 3 (1.5h)  
**File:** `artifacts/game-dev-advisor/src/pages/Analyzer.tsx`  
**Depends On:** Steps 4 + 5

### Context Brief

Replace the `useAnalyzeProject()` TanStack Query mutation with a `fetch` + `ReadableStream` SSE parser. EventSource doesn't support POST bodies, so we use `fetch` and parse SSE lines manually.

State machine:
- `idle` → `scoring` (submit) → `metadata_ready` (scoring_complete) → `streaming` (metadata_complete) → `done` (done event)
- Any state → `error` on error event or fetch failure

### Task List

1. **Remove `useAnalyzeProject` import** and add state:
   ```typescript
   const [phase, setPhase] = useState<"idle"|"scoring"|"metadata_ready"|"streaming"|"done"|"error">("idle");
   const [partialCategories, setPartialCategories] = useState<CategoryRecommendation[]>([]);
   const [narrativeTokens, setNarrativeTokens] = useState("");
   const [result, setResult] = useState<AnalysisResult | null>(null);
   const [errorMsg, setErrorMsg] = useState("");
   ```

2. **Write `streamAnalysis()` function** using `fetch` + `ReadableStream`:
   ```typescript
   async function streamAnalysis(input: ProjectInput): Promise<void> {
     const res = await fetch("/api/advisor/analyze", {
       method: "POST",
       headers: { "Content-Type": "application/json" },
       body: JSON.stringify(input),
     });
     const reader = res.body!.getReader();
     const decoder = new TextDecoder();
     let buffer = "";
     while (true) {
       const { done, value } = await reader.read();
       if (done) break;
       buffer += decoder.decode(value, { stream: true });
       // Parse SSE lines from buffer, dispatch callbacks per event type
     }
   }
   ```
   Parse `event:` and `data:` lines from the buffer; dispatch to state setters.

3. **Update `handleSubmit`** to call `streamAnalysis(input)` instead of `mutation.mutate(...)`. Set `phase = "scoring"` before the call.

4. **Phase-aware loading UI:**
   - `scoring`: "Scoring 116 tools across all categories..."
   - `metadata_ready`: partial categories grid visible + "Generating AI narrative..."
   - `streaming`: full categories grid + live-typing `finalSummary` built from `narrativeTokens`
   - `done`: `result` shown (same as current `AnalysisView`)
   - `error`: error message from `errorMsg`

5. **Show `partialCategories` grid** as soon as `scoring_complete` arrives — before OpenAI calls return.

### Verification

- Submit form; within ~500ms the category cards appear
- Narrative text visibly streams token by token below the cards
- Final state identical to pre-streaming behavior (same data)
- `pnpm run typecheck` passes

### Exit Criteria

- Category cards visible before narrative starts
- Narrative streams visibly
- No duplicate render of categories on `done`
- `pnpm run typecheck` passes

---

## Step 7 — Rate Limiting Middleware

**Day:** 5 (1h)  
**New file:** `artifacts/api-server/src/middleware/rateLimit.ts`  
**Applied in:** `artifacts/api-server/src/routes/advisor.ts`  
**Independent** (no blockers, no dependents)

### Context Brief

In-memory IP-based rate limit: 5 requests per minute per IP. Returns 429 + `Retry-After: 60`. The `Map<ip, timestamp[]>` is module-level (persists across requests within the process lifetime). On Replit's single-process deployment this is sufficient.

### Task List

1. **Create `artifacts/api-server/src/middleware/rateLimit.ts`:**
   ```typescript
   import type { Request, Response, NextFunction } from "express";

   const WINDOW_MS = 60_000;
   const MAX_REQUESTS = 5;
   const store = new Map<string, number[]>();

   export function rateLimit(req: Request, res: Response, next: NextFunction): void {
     const ip = req.ip ?? "unknown";
     const now = Date.now();
     const timestamps = (store.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
     if (timestamps.length >= MAX_REQUESTS) {
       res.setHeader("Retry-After", "60");
       res.status(429).json({ error: "Too many requests. Please wait 60 seconds before trying again." });
       return;
     }
     timestamps.push(now);
     store.set(ip, timestamps);
     next();
   }
   ```

2. **Import and apply in `advisor.ts`** — the `/advisor/analyze` route only:
   ```typescript
   import { rateLimit } from "../middleware/rateLimit.js";
   router.post("/advisor/analyze", rateLimit, async (req, res) => { ... });
   ```

### Verification

```bash
# In bash loop (or PowerShell equivalent):
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "req $i: %{http_code}\n" -X POST http://localhost:3000/api/advisor/analyze \
    -H "Content-Type: application/json" \
    -d '{"projectIdea":"x","budget":"low","timeLimit":"jam","skillLevel":"beginner","teamSize":"solo","platformTarget":["pc"],"artCapability":"none"}'
done
# Expected: req 1-5: 200 (or streaming headers). req 6: 429
pnpm run typecheck
```

### Exit Criteria

- 5 requests succeed; 6th returns 429
- 429 body: `{"error":"Too many requests..."}`
- `Retry-After: 60` header present
- Health check, sessions, tools endpoints unaffected
- `pnpm run typecheck` passes

---

## Step 8 — Public Session URL + OG Tags

**Day:** 4 (1h)  
**Files:** `artifacts/game-dev-advisor/index.html`, `artifacts/game-dev-advisor/src/pages/SessionDetail.tsx`  
**Depends On:** Step 2

### Context Brief

`/sessions/:id` already exists and is auth-free (no auth in the app). Add OG meta tags for link unfurling and a "Share" button that copies the URL.

True per-session dynamic OG requires SSR — out of scope. Static fallback tags in `index.html` are sufficient for Discord/Slack unfurling during the demo.

### Task List

1. **Add static OG tags to `artifacts/game-dev-advisor/index.html`:**
   ```html
   <meta property="og:title" content="Game Dev Stack Advisor" />
   <meta property="og:description" content="AI-powered game development tool stack recommendations — see exactly why each tool was chosen." />
   <meta property="og:type" content="website" />
   <meta name="twitter:card" content="summary" />
   ```

2. **Update `SessionDetail.tsx` — set `document.title` dynamically:**
   ```typescript
   useEffect(() => {
     if (session?.result?.stackOverview) {
       document.title = `${session.result.stackOverview} — Game Dev Stack Advisor`;
     }
     return () => { document.title = "Game Dev Stack Advisor"; };
   }, [session?.result?.stackOverview]);
   ```

3. **Add "Copy Link" button** to `SessionDetail.tsx`:
   ```typescript
   const [copied, setCopied] = useState(false);
   const handleShare = async () => {
     await navigator.clipboard.writeText(window.location.href);
     setCopied(true);
     setTimeout(() => setCopied(false), 2000);
   };
   // Render: <Button onClick={handleShare}>{copied ? "Link copied!" : "Copy Link"}</Button>
   ```

4. **Verify auth-free access** — open `/sessions/1` in incognito; should load without redirect.

### Verification

- Open `http://localhost:5173/sessions/1` in incognito → session loads fully
- Click "Copy Link" → toast shows "Link copied!" for 2s
- `pnpm run typecheck` passes

### Exit Criteria

- Session detail loads without auth
- `document.title` reflects the specific session's stack overview
- Share button works and shows confirmation
- `index.html` has OG meta tags

---

## Step 9 — UX Polish + Copy Review

**Day:** 4 (1.5h)  
**Files:** All pages in `artifacts/game-dev-advisor/src/pages/`, `Layout.tsx`  
**Depends On:** Step 5

### Context Brief

Before the live demo, all pages must have loading, error, and empty states. All UI copy must be reviewed for clarity and consistency.

### Task List

1. **Loading states** (use shadcn `Skeleton` or spinner):
   - `Sessions.tsx`: skeleton cards while `listSessions` is pending
   - `SessionDetail.tsx`: spinner while `getSession` is pending
   - `Tools.tsx`: skeleton rows while `listTools` is pending

2. **Error states** — user-friendly messages for all fetch failures:
   - Generic: "Something went wrong. Please try again."
   - 429: "You're sending requests too quickly. Please wait a minute."
   - 404: "Not found."

3. **Empty states:**
   - Sessions empty: "No analyses yet. Start by describing your game project above."
   - Tools empty: "No tools found for this filter."

4. **Copy review checklist:**
   - Heading casing consistent (Title Case for headings, sentence case for body)
   - Button text consistent: "Analyze Project", "View Session", "Copy Link"
   - No "..." placeholder text visible
   - No hardcoded debug strings
   - Error messages expose no internal details

5. **Mobile check at 390px viewport:**
   - Form fields stack vertically (no horizontal overflow)
   - Category grid collapses to 1 column
   - Nav links stack or collapse into a menu

### Verification

- Browse all pages in Chrome DevTools at 390px width — no horizontal scroll
- Disable API server; reload each page — all show graceful error states
- `pnpm run typecheck` passes

### Exit Criteria

- Every page: loading state, error state, empty state present
- No visible placeholder/debug copy
- 390px mobile: no horizontal overflow
- `pnpm run typecheck` passes

---

## Step 10 — RAG Re-seed + Smoke Tests + Deploy

**Day:** 5 (4h)  
**Depends On:** All previous steps

### Context Brief

Final step: seed RAG with the expanded ~116-tool catalog, run 5 end-to-end smoke scenarios, deploy to Replit, verify production.

### Task List

#### RAG Re-seed (0.5h)

```bash
pnpm --filter @workspace/api-server run rag:seed
# Expected output: "Seeded N RAG chunks into knowledge_chunks." where N ≥ 100
```

Validate with 5 test queries through the UI or API:
- "2D pixel platformer beginner solo"
- "AAA 3D shooter expert large team console"
- "Mobile casual puzzle intermediate small team"
- "VR experience prototype advanced quarter"
- "HTML5 web game jam beginner solo zero budget"

Each should return ≥ 3 RAG chunks in `evidence.ragChunks`.

#### Smoke Tests — 5 Scenarios (1h)

| # | Scenario | budget | timeLimit | skillLevel | teamSize | platformTarget | artCapability |
|---|---|---|---|---|---|---|---|
| 1 | Solo indie 2D pixel platformer | zero | month | beginner | solo | [pc] | basic |
| 2 | AAA-style 3D shooter | enterprise | longterm | expert | large | [pc, console] | professional |
| 3 | Mobile casual puzzle game | low | jam | intermediate | small | [mobile] | intermediate |
| 4 | VR experience prototype | medium | quarter | advanced | small | [vr] | intermediate |
| 5 | HTML5 web game | zero | jam | beginner | solo | [web] | none |

For each: submit via the UI, verify:
- No 5xx error
- `stackOverview` is coherent (names real tools)
- Evidence panel shows ≥ 3 RAG chunks
- Streaming: narrative visibly progresses

#### Replit Deployment (2h)

1. Configure Replit secrets: `DATABASE_URL`, `OPENAI_API_KEY`
2. Run `pnpm run build` — must succeed with no errors
3. Verify `replit.md` run command starts both processes
4. Seed RAG against prod DB: `DATABASE_URL=<prod-url> pnpm --filter @workspace/api-server run rag:seed`
5. Run all 5 smoke scenarios on the production URL
6. Pre-warm: keep a browser tab open or set up a periodic health ping to avoid Replit cold starts during the demo

#### Demo Video (0.5h)

Script (3 minutes):
- 0:00–0:15 Hook: "Game devs spend weeks researching tools. We do it in 30 seconds — and you can verify the AI's work."
- 0:15–0:45 Form fill: Scenario 1 (solo, 2D, beginner)
- 0:45–1:30 Streaming: narrate while tokens stream — "grounding in our 116-tool RAG knowledge base"
- 1:30–2:15 Why This: click 2 evidence panels — "This isn't a black box"
- 2:15–2:45 Tools page: "We know Cursor, Claude Code, Scenario.gg, Inworld, Suno — the modern AI stack"
- 2:45–3:00 Share: "Try it yourself — link in the description"

### Verification

```bash
pnpm run build         # no errors
curl https://<replit-url>/api/healthz   # {"status":"ok"}
```

### Exit Criteria

- RAG seed: ≥ 100 chunks seeded
- All 5 smoke scenarios pass on local AND production (no 5xx, coherent stacks)
- Zero 5xx errors in a 5-minute live demo window on production
- Demo video recorded, under 3 minutes, jury-ready
- Production URL responds within 3s after pre-warm

---

## Mutation Protocol

If a step is skipped or deferred, record it here:

| Step | Action | Reason | Alternative |
|------|--------|---------|-------------|
| — | — | — | — |

## Invariants (verify after every step)

- `pnpm run typecheck` must pass before moving to the next step
- `openapi.yaml` is the single source of truth — any type shared between server and frontend goes through codegen
- No secrets hardcoded in source files
- `TOOL_CATEGORIES` stays in sync with category IDs used by tool entries
