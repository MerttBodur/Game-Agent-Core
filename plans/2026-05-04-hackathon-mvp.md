# Hackathon MVP — 5-Day Implementation Plan

**Source spec:** `docs/superpowers/specs/2026-05-04-mvp-roadmap-design.md`  
**Deadline:** 2026-05-09 (Day 5 end)  
**Mode:** Direct (commit to `main` after each step)

---

## Step Map

| Step | Day | Task | Depends on | Verify |
|------|-----|------|-----------|--------|
| 1 | 1 | Tool catalog — deepen existing 9 categories | — | typecheck green |
| 2 | 2 | Tool catalog — 7 new categories + ai_tooling expansion | 1 | typecheck + RAG seed |
| 3 | 2 | `evidence` field: OpenAPI → codegen → backend | 2 | analyze returns evidence |
| 4 | 3 | Why This UI (expandable panel) | 3 | panel opens, scores + chunks visible |
| 5 | 3 | Streaming SSE | 3 | narrative streams token-by-token |
| 6 | 4 | UX polish + mobile + public session URL + copy | 4, 5 | 5 smoke scenarios local |
| 7 | 5 | Rate limit middleware | — | 429 fires after 5 req/min |
| 8 | 5 | Replit deploy + prod RAG seed | 6, 7 | 5 smoke scenarios on prod |
| 9 | 5 | Demo video | 8 | 3 min, jury-ready |

**Parallelism:** Steps 4 and 5 share no files — run simultaneously (two terminal tabs). Step 7 is also independent — do it Day 5 morning while Step 6 bug fixes finish.

---

## Step 1 — Deepen Existing 9 Categories

**Context:** `artifacts/api-server/src/lib/gameDevTools.ts` holds 27 tools across 9 categories. Each tool is a typed object. IDs must be unique integers, continuing from the current max.

**Files to edit:** `gameDevTools.ts` only.

**Task list:**
- [ ] engine (+3): Cocos Creator, Defold, LÖVE, Construct 3, Bevy → ids 28–32
- [ ] programming (+6): C++, Lua, JS/TS, Rust, Haxe, Python → ids 33–38
- [ ] art (+6): Substance Painter, Substance Designer, ZBrush, Maya, Procreate, Pyxel Edit → ids 39–44
- [ ] animation (+4): Cascadeur, Mixamo, Live2D, Maya (animation-specific entry) → ids 45–48
- [ ] ui (+2): NoesisGUI, Rive → ids 49–50
- [ ] vfx (+3): Niagara, Houdini, EmberGen → ids 51–53
- [ ] version_control (+3): Perforce, GitLab, Diversion → ids 54–56
- [ ] deployment (+6): Epic Games Store, GOG Galaxy, Xbox Store, PlayStation Store, Nintendo eShop, Crazy Games → ids 57–62

**Scoring shape:** Copy the 5-dimension scoring object from an existing same-category tool and adjust values. Do not invent a new shape.

**Exit criteria:**
```bash
pnpm run typecheck   # must be green
```

---

## Step 2 — New Categories + ai_tooling Expansion

**Context:** Continues from Step 1. Add 7 new category keys to `TOOL_CATEGORIES` and append tool entries. Also update scoring weight mappings in `advisorEngine.ts` to handle new categories.

**Files to edit:** `gameDevTools.ts`, `advisorEngine.ts`.

**Task list:**
- [ ] `ai_tooling` (3 → 20): add Cursor, Claude Code, Windsurf, v0, Lovable, Bolt.new, Scenario.gg, Leonardo.ai, Suno, Eleven Labs, Meshy, Tripo, Inworld, Convai, Rosebud AI, Layer.ai, Promethean AI → ids 63–79
- [ ] `audio` (8): FMOD, Wwise, Audacity, Reaper, Soundly, BFXR, Eleven Labs (audio entry), Suno → ids 80–87
- [ ] `networking` (6): Photon, Mirror, Netcode for GameObjects, Nakama, Colyseus, AWS GameLift → ids 88–93
- [ ] `backend_services` (6): PlayFab, Unity Gaming Services, Firebase, Supabase, Beamable, GameSparks → ids 94–99
- [ ] `monetization` (5): AppLovin MAX, Unity LevelPlay, AdMob, Xsolla, Stripe → ids 100–104
- [ ] `analytics` (5): GameAnalytics, deltaDNA, Amplitude, Mixpanel, Unity Analytics → ids 105–109
- [ ] `narrative` (5): Twine, Ink, Yarn Spinner, Articy:draft, ChatMapper → ids 110–114
- [ ] `build_ci` (4): Unity Cloud Build, GameCI, GitHub Actions, BuildKite → ids 115–118
- [ ] Mirror existing scoring-category weight pattern in `advisorEngine.ts` for each new category

**Exit criteria:**
```bash
pnpm run typecheck   # green
pnpm --filter @workspace/api-server run rag:seed   # seeds without error
# Manually POST /api/advisor/analyze with 2 inputs — confirm new categories appear
```

---

## Step 3 — `evidence` Field: OpenAPI → Codegen → Backend

**Context:** `ToolRecommendation` in the OpenAPI spec has no `evidence` field. The order of changes is strict: spec first, then codegen, then backend — skipping order causes TypeScript errors.

**Files to edit:** `lib/api-spec/openapi.yaml`, then `artifacts/api-server/src/lib/advisorEngine.ts`.

**Task list:**

**3a. OpenAPI spec** — add two new schemas and extend `ToolRecommendation`:

```yaml
ScoreBreakdown:
  type: object
  properties:
    budget: { type: number }
    skill: { type: number }
    platform: { type: number }
    time: { type: number }
    art: { type: number }
  required: [budget, skill, platform, time, art]

RagChunk:
  type: object
  properties:
    text: { type: string }
    source: { type: string }
    score: { type: number }
  required: [text, source]
```

Add to `ToolRecommendation.properties`:
```yaml
evidence:
  type: object
  properties:
    scoreBreakdown: { $ref: '#/components/schemas/ScoreBreakdown' }
    ragChunks:
      type: array
      items: { $ref: '#/components/schemas/RagChunk' }
  required: [scoreBreakdown, ragChunks]
```
Add `evidence` to `ToolRecommendation.required`.

**3b. Run codegen:**
```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck   # fix any errors before continuing
```

**3c. Backend** (`advisorEngine.ts`):
- In `scoreTool`: extract the 5 per-dimension sub-scores that are currently implicit arithmetic into a `ScoreBreakdown` object and return it alongside the total.
- When building each `ToolRecommendation`: populate `evidence.scoreBreakdown` from the per-dimension scores and `evidence.ragChunks` by mapping the existing `RetrievedKnowledgeChunk` array to `{ text, source, score }`.

**Exit criteria:**
```bash
pnpm run typecheck   # green
# POST /api/advisor/analyze → each ToolRecommendation contains `evidence.scoreBreakdown` and `evidence.ragChunks`
```

---

## Step 4 — Why This UI (Expandable Panel)

**Context:** `artifacts/game-dev-advisor` is the React+Vite+Tailwind frontend. shadcn `Collapsible` is already installed. `ToolRecommendation` now carries `evidence` from Step 3.

**Files to create/edit:** new `components/EvidencePanel.tsx`, existing recommendation card component.

**Task list:**
- [ ] Create `EvidencePanel.tsx` — accepts `ToolRecommendation` prop:
  - Trigger button: "Why this?" text
  - Open: AI rationale (`reasoning` string, already in the model)
  - Open: 5 score rows — label + number, e.g. "Budget: 80" (no charts)
  - Open: up to 3 RAG chunk excerpts — `<blockquote>` + source label
- [ ] Wire into existing recommendation card — one `EvidencePanel` per card

**Exit criteria:**
- Clicking "Why this?" opens/closes panel without layout shift
- Scores visible as plain numbers
- At least 1 RAG chunk shown per recommendation

---

## Step 5 — Streaming SSE

**Context:** `POST /api/advisor/analyze` currently returns full JSON. Goal: emit scored stack immediately, then stream `finalSummary` tokens.

**SSE event protocol:**
```
event: stack    ← AnalysisResult with finalSummary: '' (one JSON payload)
data: {...}

event: token    ← one narrative fragment
data: "The recommended"

event: done
data: {}
```

**Files to edit:** `artifacts/api-server/src/routes/advisor.ts`, frontend query/hook file.

**Task list:**

**5a. Backend:**
- Set `Content-Type: text/event-stream` on the response, disable buffering (`res.flushHeaders()`)
- Emit `event: stack` with the full result (minus finalSummary) after scoring completes
- Call OpenAI with `stream: true`; for each chunk emit `event: token`
- On stream end emit `event: done`

**5b. Frontend:**
- Replace the Orval mutation for `analyzeProject` with a manual `fetch` + `ReadableStream` reader (EventSource doesn't support POST)
- On `event: stack`: set result state (cards render immediately)
- On `event: token`: append to `finalSummary` in state
- On `event: done`: set loading false

**Risk shortcut:** If `stream: true` conflicts with any response validation middleware, skip validation for this one endpoint server-side and emit full JSON as a single SSE event, then apply a client-side typewriter animation (`setTimeout` loop over the text).

**Exit criteria:**
- Recommendation cards appear before the narrative finishes
- Narrative text visibly appends in real-time

---

## Step 6 — UX Polish + Public Session URL + Copy

**Context:** Final local polish before deployment. Three parallel tracks — no shared files between A/B/C/D.

**Files to edit:** Various frontend pages and components.

**Task list:**

**A. Loading / error / empty states:**
- [ ] Analyzer: spinner during SSE, error banner on fetch failure, empty state if no categories
- [ ] Sessions list: "No sessions yet — analyze a project to get started"
- [ ] Tools page: loading skeleton, error fallback

**B. Mobile responsive (test at 390px):**
- [ ] Form grid → single column on mobile
- [ ] Fix horizontal overflow in recommendation cards
- [ ] Verify font sizes are readable

**C. Public session URL:**
- [ ] Confirm `/sessions/:id` has no auth guard
- [ ] Add OG meta tags (use `react-helmet-async` or equivalent already in project):
  - `og:title`: `Game Dev Stack: {stackOverview}`
  - `og:description`: `{projectSummary}` truncated to 160 chars
  - `og:url`: full session URL

**D. English copy review:**
- [ ] All form labels, buttons, error messages, placeholder text — tighten verbose copy
- [ ] Check for any Turkish strings that leaked through

**Smoke test (local) — 5 scenarios:**
1. Solo indie 2D pixel platformer, 1 month, beginner
2. AAA-style 3D shooter, year+, expert team
3. Mobile casual puzzle, game jam, intermediate
4. VR experience prototype, quarter, advanced
5. HTML5 web game, game jam, beginner

For each: submit → cards appear → narrative streams → open evidence panel → copy session URL → open in incognito.

**Exit criteria:** All 5 smoke scenarios pass locally.

---

## Step 7 — Rate Limit Middleware

**Context:** Personal OpenAI key needs protection. In-memory, per-IP, 5 req/min. No new packages.

**Files to create/edit:** new `artifacts/api-server/src/middleware/rateLimit.ts`, `artifacts/api-server/src/routes/advisor.ts`.

**Task list:**
- [ ] Create `rateLimit.ts`:
  ```ts
  const requests = new Map<string, number[]>()

  export function rateLimit(windowMs: number, max: number) {
    return (req: Request, res: Response, next: NextFunction) => {
      const ip = req.ip ?? 'unknown'
      const now = Date.now()
      const timestamps = (requests.get(ip) ?? []).filter(t => now - t < windowMs)
      if (timestamps.length >= max) {
        res.set('Retry-After', String(Math.ceil(windowMs / 1000)))
        res.status(429).json({ error: 'Too many requests' })
        return
      }
      timestamps.push(now)
      requests.set(ip, timestamps)
      next()
    }
  }
  ```
- [ ] Apply to `/analyze` only: `router.post('/analyze', rateLimit(60_000, 5), analyzeHandler)`

**Exit criteria:**
```bash
# 6 rapid POSTs to /api/advisor/analyze → 6th returns 429 with Retry-After header
```

---

## Step 8 — Replit Deploy + Prod RAG Seed

**Context:** `replit.md` already in repo. Secrets go in Replit Secrets UI, not in committed files.

**Task list:**
- [ ] Push all code to `main`
- [ ] Replit Secrets: set `OPENAI_API_KEY`, `DATABASE_URL`
- [ ] Prod build: `pnpm run build`
- [ ] Prod RAG seed: `pnpm --filter @workspace/api-server run rag:seed`
- [ ] Configure keep-alive ping (UptimeRobot or Replit's built-in) to `/healthz` every 5 min
- [ ] Run 5 smoke scenarios on the production URL

**Exit criteria:**
- All 5 smoke scenarios produce coherent, distinct stacks on the public URL
- Zero 5xx errors during a 5-minute continuous session

---

## Step 9 — Demo Video

**Script (3 min, from spec §9):**

| Time | Beat | Cue |
|------|------|-----|
| 0:00–0:15 | Hook | "Game devs spend weeks researching tools. We do it in 30 seconds — and you can verify the AI's work." |
| 0:15–0:45 | Form fill | Solo indie 2D pixel platformer, 1 month, beginner |
| 0:45–1:30 | Streaming | Narrate while tokens stream: "AI grounding in 116-tool RAG knowledge base" |
| 1:30–2:15 | Why This | Open 2 evidence panels — show RAG chunks + score breakdown |
| 2:15–2:45 | Tools page | Highlight Cursor, Claude Code, Scenario.gg, Inworld, Suno |
| 2:45–3:00 | Share | Copy session URL: "Try it yourself" |

**Task list:**
- [ ] Practice run Day 4 evening — catch audio/pacing issues
- [ ] Final take
- [ ] Light edit: cut dead air, add title card

**Exit criteria:** Single MP4, ≤3 min.

---

## Risk Shortcuts

| Risk | Shortcut |
|------|----------|
| SSE conflicts with middleware | Emit full JSON as single SSE + client-side typewriter animation |
| RAG retrieval noisy with 116 tools | Lower `topK` 5→3; add category filter to retrieval query |
| Catalog writing overruns Day 2 | Drop analytics, narrative, build_ci, monetization (post-hackathon) |
| Replit cold-start during demo | Pre-warm 60s before going live; keep `/healthz` tab polling |

---

## YAGNI — Out of Scope

Auth, conversational follow-up, tool comparison, PDF export, dynamic OG images, genre-specific scoring weights, multiple LLM providers, admin UI, i18n. Do not implement any of these during the sprint.
