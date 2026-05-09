import type {
  CategoryRecommendation,
  Evidence,
  ProjectInput,
} from "@workspace/api-client-react";

export type Scope = "jam" | "prototype" | "indie" | "AA" | "AAA";
export type ProjectMode =
  | "single_player"
  | "co_op_local"
  | "multiplayer_online"
  | "live_service";

export interface ClientGameDevTool {
  name: string;
  category: string;
  pricing: string;
  minSkillLevel: string;
  platforms: string[];
  tags: string[];
  ecosystem: string[];
  popularityByArchetype: Record<Scope, number> | null;
  archetypeBias?: Partial<Record<Scope, number>>;
  description?: string;
  strengths?: string[];
  weaknesses?: string[];
}

const WEIGHTS_BY_ARCHETYPE: Record<Scope, Record<string, number>> = {
  jam: { budget: 0.6, skill: 1.2, platform: 0.8, time: 1.5, art: 1.0 },
  prototype: { budget: 0.7, skill: 1.1, platform: 0.9, time: 1.3, art: 1.0 },
  indie: { budget: 1.0, skill: 1.0, platform: 1.0, time: 1.0, art: 1.0 },
  AA: { budget: 0.9, skill: 0.9, platform: 1.1, time: 0.8, art: 1.1 },
  AAA: { budget: 0.7, skill: 0.7, platform: 1.3, time: 0.6, art: 1.3 },
};

const LOCKED_CATEGORIES = new Set(["programming", "vfx"]);

const CATEGORY_LABELS: Record<string, string> = {
  engine: "Game Engine",
  programming: "Programming Language",
  art: "Art & Assets",
  animation: "Animation",
  vfx: "VFX & Particles",
  version_control: "Version Control",
  deployment: "Deployment",
  ai_tooling: "AI Tooling",
  audio: "Audio & Music",
  networking: "Networking",
  backend_services: "Backend Services",
};

function hiddenCategoriesForMode(mode: ProjectMode): string[] {
  if (mode === "single_player") return ["networking", "backend_services"];
  if (mode === "co_op_local") return ["backend_services"];
  return [];
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function injectJitter(score: number, toolName: string, seed: string): number {
  const j = (djb2(`${toolName}::${seed}`) % 1000) / 1000 - 0.5;
  return Math.max(0, Math.min(100, score + j));
}

function budgetDelta(t: ClientGameDevTool, input: ProjectInput): number {
  const m: Record<string, string[]> = {
    zero: ["open_source", "free"],
    low: ["open_source", "free", "freemium"],
    medium: ["open_source", "free", "freemium", "paid"],
    high: ["open_source", "free", "freemium", "paid", "subscription"],
    enterprise: ["open_source", "free", "freemium", "paid", "subscription"],
  };
  return (m[input.budget] ?? []).includes(t.pricing) ? 15 : -20;
}

function skillDelta(t: ClientGameDevTool, input: ProjectInput): number {
  const lv = ["beginner", "intermediate", "advanced", "expert"];
  const u = lv.indexOf(input.skillLevel);
  const r = lv.indexOf(t.minSkillLevel);
  if (u >= r) return u - r >= 2 ? 15 : 10;
  return -15 * (r - u);
}

function platformDelta(t: ClientGameDevTool, input: ProjectInput): number {
  if (input.platformTarget.length === 0) return 0;
  const u = input.platformTarget.map((p) => p.toLowerCase());
  const tp = t.platforms.map((p) => p.toLowerCase());
  const o = u.filter((p) => tp.includes(p));
  return o.length > 0 ? 10 + (o.length - 1) * 3 : -25;
}

function timeDelta(t: ClientGameDevTool, input: ProjectInput): number {
  if (input.timeLimit !== "jam") return 0;
  let d = 0;
  if (t.tags.includes("beginner-friendly") || t.tags.includes("game-jam")) d += 15;
  if (t.minSkillLevel === "expert" || t.minSkillLevel === "advanced") d -= 10;
  return d;
}

function artDelta(t: ClientGameDevTool, input: ProjectInput): number {
  if (t.category !== "art" && t.category !== "animation") return 0;
  const m: Record<string, string[]> = {
    none: ["ai_tooling"],
    basic: ["ai_tooling", "beginner"],
    intermediate: ["ai_tooling", "beginner", "intermediate"],
    advanced: ["ai_tooling", "beginner", "intermediate", "advanced"],
    professional: ["ai_tooling", "beginner", "intermediate", "advanced", "expert"],
  };
  const a = m[input.artCapability] ?? [];
  return a.includes(t.minSkillLevel) || a.includes("ai_tooling") ? 10 : -15;
}

export interface ScoringContext {
  input: ProjectInput;
  achievableScope: Scope;
  projectIdSeed: string;
  datasetIsThin: boolean;
}

export interface ClientScoreBreakdown {
  budget: number;
  skill: number;
  platform: number;
  timeLimit: number;
  artCapability: number;
  popularity: number;
  paidPriority: number;
  jitter: number;
  total: number;
}

export function scoreTool(
  tool: ClientGameDevTool,
  ctx: ScoringContext,
): { total: number; breakdown: ClientScoreBreakdown } {
  const w = WEIGHTS_BY_ARCHETYPE[ctx.achievableScope];
  const budget = budgetDelta(tool, ctx.input) * w.budget;
  const skill = skillDelta(tool, ctx.input) * w.skill;
  const platform = platformDelta(tool, ctx.input) * w.platform;
  const time = timeDelta(tool, ctx.input) * w.time;
  const art = artDelta(tool, ctx.input) * w.art;

  let popularity = 0;
  if (tool.popularityByArchetype) {
    const p = tool.popularityByArchetype[ctx.achievableScope] ?? 0.5;
    popularity = (p - 0.5) * (ctx.datasetIsThin ? 12.5 : 25);
  }

  const isPaid = ["paid", "subscription", "freemium"].includes(tool.pricing);
  const flagged = ctx.input.paidPriorityCategories?.includes(tool.category) ?? false;
  let paidPriority = 0;
  if (isPaid && flagged) paidPriority = 8;
  else if (isPaid && !flagged) paidPriority = -6;
  else if (!isPaid && !flagged) paidPriority = 4;

  const archetypeBiasDelta = tool.archetypeBias?.[ctx.achievableScope] ?? 0;

  const pre =
    50 +
    budget +
    skill +
    platform +
    time +
    art +
    popularity +
    paidPriority +
    archetypeBiasDelta;
  const total = injectJitter(pre, tool.name, ctx.projectIdSeed);
  const jitter = total - Math.max(0, Math.min(100, pre));

  return {
    total,
    breakdown: {
      budget,
      skill,
      platform,
      timeLimit: time,
      artCapability: art,
      popularity,
      paidPriority,
      jitter,
      total,
    },
  };
}

export interface RecomputeArgs {
  input: ProjectInput;
  modeOverride: ProjectMode;
  scopeOverride: Scope;
  candidatePool: Record<string, ClientGameDevTool[]>;
  ragChunks: Evidence["ragChunks"];
}

export interface RecomputedResults {
  locked: CategoryRecommendation[];
  flexible: CategoryRecommendation[];
  hidden: string[];
}

export function recomputeCategoryResults(args: RecomputeArgs): RecomputedResults {
  const ctx: ScoringContext = {
    input: args.input,
    achievableScope: args.scopeOverride,
    projectIdSeed: args.input.projectIdea.slice(0, 64),
    datasetIsThin: true,
  };
  const hidden = hiddenCategoriesForMode(args.modeOverride);

  const enginePool = args.candidatePool.engine ?? [];
  const engineScored = enginePool
    .map((tool) => ({ tool, ...scoreTool(tool, ctx) }))
    .sort((a, b) => b.total - a.total);
  const engineTop = engineScored[0];
  if (!engineTop) return { locked: [], flexible: [], hidden };

  const ecosystem =
    engineTop.tool.ecosystem.find((e) => e !== "engine_agnostic") ?? "engine_agnostic";

  const locked: CategoryRecommendation[] = [toRec("engine", engineScored)];
  const flexible: CategoryRecommendation[] = [];

  for (const [cat, pool] of Object.entries(args.candidatePool)) {
    if (cat === "engine") continue;
    if (hidden.includes(cat)) continue;
    const isLocked = LOCKED_CATEGORIES.has(cat);
    const filtered = isLocked
      ? pool.filter(
          (t) => t.ecosystem.includes(ecosystem) || t.ecosystem.includes("engine_agnostic"),
        )
      : pool;
    if (filtered.length === 0) continue;
    const scored = filtered
      .map((tool) => ({ tool, ...scoreTool(tool, ctx) }))
      .sort((a, b) => b.total - a.total);
    (isLocked ? locked : flexible).push(toRec(cat, scored));
  }

  return { locked, flexible, hidden };

  function toRec(
    cat: string,
    scored: { tool: ClientGameDevTool; total: number; breakdown: ClientScoreBreakdown }[],
  ): CategoryRecommendation {
    const top = scored[0];
    const alts = scored.slice(1, 3);
    const ev = (b: ClientScoreBreakdown): Evidence => ({
      scoreBreakdown: b as never,
      ragChunks: args.ragChunks,
    });
    const baseTool = (t: ClientGameDevTool) => ({
      toolId: 0,
      strengths: t.strengths ?? [],
      weaknesses: t.weaknesses ?? [],
      tradeoffs: (t.weaknesses ?? [])[0] ?? "",
    });
    return {
      category: cat,
      categoryLabel: CATEGORY_LABELS[cat] ?? cat,
      topPick: {
        ...baseTool(top.tool),
        toolName: top.tool.name,
        score: top.total,
        reasoning: top.tool.description ?? "",
        evidence: ev(top.breakdown),
        isTopPick: true,
      },
      alternatives: alts.map((a) => ({
        ...baseTool(a.tool),
        toolName: a.tool.name,
        score: a.total,
        reasoning: a.tool.description ?? "",
        evidence: ev(a.breakdown),
        isTopPick: false,
      })),
      categoryReasoning: top.tool.description ?? "",
    };
  }
}
