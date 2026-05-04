# MVP Roadmap — Hackathon Sprint Design

**Date:** 2026-05-04
**Topic:** 5-day hackathon-targeted MVP for the Game Dev Stack Advisor
**Status:** Approved (pending user review of this written spec)

---

## 1. Context & Goal

The repo currently contains a working game-dev tool recommender: rule-based scoring engine, RAG over 27 tools, OpenAI narrative generation, React+Vite frontend with five pages. The user is entering a hackathon in **5 days** and wants the project to:

1. Work reliably under live judge interaction.
2. Demonstrate modern AI engineering depth (RAG, scoring transparency, streaming).
3. Showcase awareness of the modern AI tooling landscape — not just "use React + Next.js", but Cursor, Claude Code, Scenario.gg, Inworld, Suno, and so on.

The hackathon target frames this as a portfolio/demo build (path B). After the hackathon, the same architecture will evolve toward a public launch (path A).

## 2. Constraints

| Dimension | Decision |
|---|---|
| Deadline | 5 days from 2026-05-04 |
| Demo format | Live video presentation + jury hands-on testing |
| UI language | English (existing copy is mostly English; needs review/tightening) |
| LLM | `gpt-5-mini` (no model swap during sprint) |
| API key | Personal OpenAI key — must be protected with rate limiting |
| Deployment platform | Replit (already configured via existing `replit.md`) |
| Effective capacity | ~33-35 hours over 5 days (≈7h/day with focus + breaks) |

## 3. MVP Definition of Done

By end of Day 5, **all** of the following must work and be demonstrable:

1. **Tool catalog: 27 → ~116 tools across 16 categories.**
   - Existing 9 categories deepened (engine 5→8, programming 2→8, art 4→10, animation 2→6, ui 2→4, vfx 3→6, version_control 2→5, deployment 4→10, ai_tooling 3→20).
   - Seven new categories added: `audio` (8), `networking` (6), `backend_services` (6), `monetization` (5), `analytics` (5), `narrative` (5), `build_ci` (4).
   - `ai_tooling` covers both general AI dev tools (Cursor, Claude Code, Windsurf, v0, Lovable, Bolt.new) and game-specific AI tools (Scenario.gg, Leonardo.ai, Suno, Eleven Labs, Meshy, Tripo, Inworld, Convai, Rosebud AI, Layer.ai, Promethean AI, Charisma.ai, Krea, Runway, Move.ai).
   - RAG re-seeded; retrieval validated against 5 sample queries.

2. **"Why This Recommendation?" UI** — every tool recommendation has an expandable panel showing:
   - AI rationale (short narrative, top of panel).
   - Scoring breakdown — numeric per-dimension scores (budget, skill, platform, time, art) shown as plain values, no chart visualization.
   - Retrieved RAG chunks (text excerpt + source metadata).

3. **Streaming AI response** — narrative is streamed via SSE so judges see "thinking" in real time. Scoring + evidence land synchronously before the narrative starts.

4. **Public shareable session URL** — `/sessions/:id` is publicly accessible without auth, with proper OG meta tags so links unfurl on Twitter/Discord.

5. **Rate limit** — IP-based, in-memory, 5 requests/minute on `/api/advisor/analyze`. Returns 429 with `Retry-After`.

6. **Production deployment on Replit** — public URL serving the full app, with secrets configured and RAG seeded against the production DB.

7. **English copy review** — every UI string (form labels, buttons, error messages, page titles, helper text) reviewed and tightened.

8. **5 smoke-test scenarios pass end-to-end** in production:
   - Solo indie 2D pixel platformer, 1 month, beginner skill.
   - AAA-style 3D shooter, year+, expert team.
   - Mobile casual puzzle game, jam, intermediate.
   - VR experience prototype, quarter, advanced.
   - HTML5 web game, jam, beginner.

9. **3-minute demo video** — recorded, edited, ready for submission.

## 4. Architecture Decisions (Future-A-Proofing)

These decisions keep the sprint code minimal but compose forward into path A (public launch) without rewrites:

| Concern | Sprint (now) | Path A (later) |
|---|---|---|
| Sessions | Anonymous, no `user_id` column | Add nullable `user_id`; existing rows remain valid |
| Rate limit | In-memory `Map<ip, timestamp[]>` | Swap to Redis adapter behind same interface |
| Tool catalog | TS module (`gameDevTools.ts`) | Migrate to DB-backed CMS; keep `slug + version + lastUpdated` shape |
| RAG | pgvector + LangChain (already production-grade) | Unchanged |
| Streaming | SSE (`text/event-stream`) | Stay on SSE; no need to switch to WebSockets |
| Auth | None | Add Clerk or Replit Auth; populate `user_id` on sessions |
| `AnalysisResult.evidence` | New field added now: `{ ragChunks: [...], scoreBreakdown: {...} }` | Same shape reused for follow-up "explain more" features |

**Key principle:** the OpenAPI spec at `lib/api-spec/openapi.yaml` remains the single source of truth. Every schema change goes through `pnpm --filter @workspace/api-spec run codegen`.

## 5. Day-by-Day Plan

### Day 1 (Mon) — Catalog Research & Writing #1 [~8h]

Goal: Add ~47 new tool entries by deepening existing categories and starting two new ones.

| Task | Time |
|---|---|
| Engine deepening (+3): Cocos, Defold, LÖVE, Construct, Bevy | 0.5h |
| Programming deepening (+6): C++, Lua, JS/TS, Rust, Haxe, Python | 0.5h |
| Art deepening (+6): Substance Painter/Designer, ZBrush, Maya, Procreate, Pyxel | 0.6h |
| Animation deepening (+4): Cascadeur, Mixamo, Live2D, Maya | 0.4h |
| UI deepening (+2): NoesisGUI, Rive | 0.2h |
| VFX deepening (+3): Niagara, Houdini, EmberGen | 0.3h |
| Version control deepening (+3): Perforce, GitLab, Diversion | 0.3h |
| Deployment deepening (+6): Epic Store, GOG, Xbox/PS/Nintendo, Crazy Games | 0.6h |
| New: `audio` (8) — FMOD, Wwise, Audacity, Reaper, Soundly, BFXR, Eleven Labs, Suno | 1h |
| New: `networking` (6) — Photon, Mirror, Netcode, Nakama, Colyseus, GameLift | 0.7h |
| Buffer + research lookups | 1h |

**Acceptance:** `pnpm run typecheck` is green. No RAG re-seed yet.

### Day 2 (Tue) — Catalog Finish + RAG Seed + Why This Backend [~7h]

| Task | Time |
|---|---|
| `ai_tooling` expansion (3 → 20) | 2h |
| New: `backend_services` (6) — PlayFab, Unity Gaming Services, GameSparks, Firebase, Supabase, Beamable | 0.7h |
| New: `monetization` (5) — AppLovin, Unity LevelPlay, AdMob, Xsolla, Stripe | 0.5h |
| New: `analytics` (5) — GameAnalytics, deltaDNA, Amplitude, Mixpanel, Unity Analytics | 0.5h |
| New: `narrative` (5) — Twine, Ink, Yarn Spinner, Articy:draft, ChatMapper | 0.5h |
| New: `build_ci` (4) — Unity Cloud Build, GameCI, GitHub Actions, BuildKite | 0.4h |
| Update `TOOL_CATEGORIES` and add minimal scoring mapping for new categories | 0.5h |
| RAG re-seed + 5-query spot-check | 0.5h |
| Why This backend: extend `AnalysisResult` with `evidence: { ragChunks, scoreBreakdown }`; update OpenAPI; run codegen | 1.5h |

**Acceptance:** `POST /api/advisor/analyze` returns evidence per recommendation. Three different inputs produce three distinct stacks.

### Day 3 (Wed) — Why This UI + Streaming [~6h]

| Task | Time |
|---|---|
| Why This expandable panel (shadcn `Collapsible`) — AI rationale + numeric scores + RAG chunks with source metadata | 2h |
| Streaming SSE backend — emit "scoring complete" + "narrative chunk" events from `/api/advisor/analyze` | 2h |
| Frontend EventSource + progressive narrative rendering (typing feel) | 1.5h |
| Buffer | 0.5h |

**Acceptance:** Clicking a recommendation reveals evidence; running an analysis shows narrative streaming in.

### Day 4 (Thu) — UX Polish + Public URL + Copy [~6h]

| Task | Time |
|---|---|
| Loading / error / empty states across Analyzer, Sessions, Tools | 1.5h |
| Mobile responsive check + fixes on a real device | 1h |
| Public shareable URL — `/sessions/:id` auth-free + OG meta tags | 1h |
| English copy review across all UI strings | 1.5h |
| Smoke test #1 — five scenarios end-to-end on local | 1h |

**Acceptance:** All five smoke scenarios produce coherent output; mobile renders without breakage; shared URL unfurls on Twitter.

### Day 5 (Fri) — Deploy + Rate Limit + Demo Video [~6h]

| Task | Time |
|---|---|
| Replit deployment — secrets, prod build, RAG seed against prod DB | 2h |
| Rate limit middleware — Express middleware, in-memory Map, 5 req/min, 429 + `Retry-After` | 1h |
| Smoke test #2 on production URL + fix any Day-4 bug list items | 1h |
| Demo video — 3 minutes: hook (10s) + problem (20s) + demo (2min) + close (10s) | 2h |

**Acceptance:** Production URL works in five different browsers; demo video is jury-ready.

## 6. Success Criteria

The sprint succeeds if **every** item below holds at hackathon submission:

1. Five smoke scenarios produce coherent, distinct stacks on the production URL.
2. The Why This panel opens cleanly and shows ≥3 RAG chunks per recommendation.
3. Streaming visibly progresses during the analysis call (judges see real-time tokens).
4. The shared session URL works for an external person who has never used the site.
5. The rate limit blocks abuse without breaking ordinary usage (5 req/min headroom is enough for jury).
6. Zero 5xx errors during a 5-minute live demo window.
7. The 3-minute demo video clearly highlights the AI engineering depth (RAG transparency + streaming + scoring breakdown), not just the UI.

## 7. Risk Register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | Catalog quality degrades under rapid writing — generic-sounding entries hurt RAG signal | Medium | Claude drafts entries; user spot-checks Day 2 morning before RAG seed; rewrite weak entries inline |
| 2 | RAG retrieval gets noisy with 116 tools — wrong chunks surfaced | Medium | Keep `topK = 5`; validate with five fixed test queries on Day 2; tune `topK` if needed |
| 3 | OpenAI streaming + Express 5 friction (response_format JSON conflicts with token stream) | Medium | Prototype Day 3 morning; if blocked, fall back to non-streaming + a faux progress indicator |
| 4 | Replit cold-start pauses during the live demo | Medium | Keep a periodic health-check ping; pre-warm 60s before going live |
| 5 | Personal API key cost spikes from jury hands-on | Low | Rate limit + per-IP cost log; cap conversation count if needed |
| 6 | Mobile UI breakage discovered late | Low | Real-device test on Day 4; shadcn defaults handle most cases |
| 7 | OpenAPI codegen breaks frontend types after `evidence` schema change | Low | Run codegen immediately after spec edit; fix TS errors before moving to Day 3 |
| 8 | Day 1-2 catalog overrun starves later days | Medium | "MVP-in-MVP" rule: if catalog is <80% by Day 2 lunch, defer four lowest-priority categories (analytics, narrative, build_ci, monetization) to post-hackathon |
| 9 | Demo video quality issues (audio, framing, pacing) | Medium | Do one practice recording on Day 4 evening; identify problems before final take |

## 8. YAGNI — Deferred to Post-Hackathon

These are explicitly **out of scope** for the 5-day sprint, even though some are tempting:

- Auth / user accounts.
- Conversational follow-up / chat refinement.
- Tool comparison view ("Unity vs Godot for your project").
- PDF export.
- Dynamic OG image generation (`@vercel/og`).
- Genre-specific scoring weights.
- Analytics dashboard for advisor usage.
- A/B testing infrastructure.
- Email collection / newsletter.
- Multiple LLM provider support (Anthropic, Google, etc.).
- Starter repo template generation ("scaffold this stack").
- Discord / Slack notifications.
- i18n (English-only is sufficient).
- Tool detail pages with deep links to community resources.
- Admin UI for managing the catalog.

## 9. Demo Narration Script (3 minutes)

| Time | Beat | Narration cue |
|---|---|---|
| 0:00–0:15 | Hook | "Game devs spend weeks researching tools. We do it in 30 seconds — and you can verify the AI's work." |
| 0:15–0:45 | Form fill | Walk through the form using a real example (solo indie 2D pixel platformer, 1 month, beginner). |
| 0:45–1:30 | Streaming | Submit. Narrate while tokens stream: "the AI is grounding its narrative in our 116-tool RAG knowledge base." |
| 1:30–2:15 | Why This | Click two recommendations' evidence panels — show RAG chunks + scoring breakdown. "This isn't a black box." |
| 2:15–2:45 | Tools page | Browse the catalog. "We know about Cursor, Claude Code, Scenario.gg, Inworld, Suno — the modern AI stack, not just engines." |
| 2:45–3:00 | Share | Copy the session URL: "Try it yourself — link in the description." |

## 10. Post-Hackathon Roadmap (Forward Pointers)

Order of operations after the hackathon, leading toward path A (public launch):

1. **Immediate post-hackathon (1-2 weeks):** Add the four deferred categories (level_design, plus any cut by the MVP-in-MVP rule). Tool comparison view. Add Anthropic provider option.
2. **Path A foundations:** Auth (Clerk or Replit Auth). Persistent user history. Session sharing with privacy controls. Replace in-memory rate limiter with Redis.
3. **Conversational mode:** Multi-turn agent with `recommendStack` tool-use, follow-up questions on the recommendation.
4. **Genre-specific weights:** Train scoring weights per detected genre using session feedback signals.
5. **Domain expansion:** Add Software Dev, AI Agent Dev, Cybersecurity verticals — same architecture, separate tool catalogs and category sets.
