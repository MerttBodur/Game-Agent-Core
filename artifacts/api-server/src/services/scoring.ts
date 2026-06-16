import type { Category, EngineName, ToolEntry } from "../types/catalog.js";

export interface ScoringContext {
  budget: "low" | "medium" | "high" | "enterprise";
  skillLevel: "beginner" | "intermediate" | "advanced" | "expert";
  artCapability: "none" | "basic" | "intermediate" | "advanced" | "professional";
  platformTarget: string[];
  pickedEngine: EngineName;
  category: Category;
  paidPriorityCategories: string[];
}

const WEIGHTS = { budget: 0.2, skill: 0.15, platform: 0.15, art: 0.15, ai: 0.15, engine: 0.2 } as const;

const BUDGET_ALLOWED: Record<ScoringContext["budget"], ToolEntry["pricing"][]> = {
  low: ["free", "open_source", "freemium"],
  medium: ["free", "open_source", "freemium", "subscription"],
  high: ["free", "open_source", "freemium", "paid", "subscription", "revenue_share"],
  enterprise: ["free", "open_source", "freemium", "paid", "subscription", "revenue_share", "enterprise"],
};
const SKILL_RANK = { beginner: 0, intermediate: 1, advanced: 2, expert: 2 } as const;
const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;
const ART_RANK = { none: 0, basic: 1, intermediate: 2, advanced: 3, professional: 4 } as const;
const CURVE_RANK = { low: 0, medium: 1, high: 2 } as const;
const ART_CATEGORIES: Category[] = ["art_asset", "vfx", "animation"];

function budgetFit(t: ToolEntry, ctx: ScoringContext): number {
  if (BUDGET_ALLOWED[ctx.budget].includes(t.pricing)) return 1;
  return ctx.paidPriorityCategories.includes(ctx.category) ? 0.7 : 0.2;
}

function skillFit(t: ToolEntry, ctx: ScoringContext): number {
  const gap = DIFFICULTY_RANK[t.difficultyLevel] - SKILL_RANK[ctx.skillLevel];
  return gap <= 0 ? 1 : Math.max(0, 1 - gap * 0.5);
}

function platformFit(t: ToolEntry, ctx: ScoringContext): number {
  if (ctx.platformTarget.length === 0) return 0.5;
  const supported = new Set(t.supportedPlatforms as readonly string[]);
  const matched = ctx.platformTarget.filter((p) => supported.has(p)).length;
  return matched / ctx.platformTarget.length;
}

function artFit(t: ToolEntry, ctx: ScoringContext): number {
  if (!ART_CATEGORIES.includes(ctx.category)) return 1;
  const gap = CURVE_RANK[t.learningCurve] - ART_RANK[ctx.artCapability] / 2;
  return gap <= 0 ? 1 : Math.max(0, 1 - gap * 0.4);
}

// When skill/art is low and budget tight, AI / low-curve tools are more appropriate.
function aiAppropriateness(t: ToolEntry, ctx: ScoringContext): number {
  const constrained = ctx.budget === "low" && (ctx.skillLevel === "beginner" || ART_RANK[ctx.artCapability] <= 1);
  if (!constrained) return t.toolNature === "ai" || t.learningCurve === "low" ? 0.8 : 0.7;
  if (t.toolNature === "ai" || t.learningCurve === "low") return 1;
  return t.learningCurve === "high" ? 0.3 : 0.6;
}

function engineFit(t: ToolEntry, ctx: ScoringContext): number {
  if (ctx.category === "game_engine") {
    return t.id === ctx.pickedEngine.toLowerCase() || t.engineCompatibility.includes(ctx.pickedEngine) ? 1 : 0.3;
  }
  return t.engineCompatibility.includes("any") || t.engineCompatibility.includes(ctx.pickedEngine) ? 1 : 0.2;
}

export function scoreTool(t: ToolEntry, ctx: ScoringContext): number {
  const raw =
    WEIGHTS.budget * budgetFit(t, ctx) +
    WEIGHTS.skill * skillFit(t, ctx) +
    WEIGHTS.platform * platformFit(t, ctx) +
    WEIGHTS.art * artFit(t, ctx) +
    WEIGHTS.ai * aiAppropriateness(t, ctx) +
    WEIGHTS.engine * engineFit(t, ctx);
  return Math.round(raw * 10 * 10) / 10; // 0-10, one decimal
}
