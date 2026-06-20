import { z } from "zod/v4";
import { ENGINES, NON_ENGINE_CATEGORIES } from "../../types/catalog.js";

export const FeasibilitySchema = z.object({
  feasible: z.boolean(),
  reason: z.string().min(1),
  targetCategories: z.array(z.enum(NON_ENGINE_CATEGORIES)),
});
export type FeasibilityShape = z.infer<typeof FeasibilitySchema>;

export function feasibilitySystemPrompt(): string {
  return [
    "You are a pragmatic game-development feasibility reviewer.",
    "Given a project idea and constraints, decide whether the project is realistically achievable.",
    "Set feasible=false ONLY when the idea clearly matches one of these scope-vs-resources combinations:",
    "  1. A GTA-scale open world built by 1-2 people in weeks or months.",
    "  2. A photorealistic OPEN WORLD with zero art capability and a sub-$1,000 (low) budget.",
    "  3. A persistent online MMO as a first solo project.",
    "  4. A solo developer building an AAA-scale game (e.g. GTA, The Witcher, Cyberpunk):",
    "     AAA production value is out of reach for one person regardless of experience or timeline.",
    "  5. A multiplayer FPS with ranked matchmaking built solo in under six months.",
    "If the idea does not clearly match one of those, set feasible=true. When in doubt, pass.",
    "AA-scale solo games are FEASIBLE, not a block: real solo devs have shipped them with focused",
    "scope and long timelines (e.g. Stardew Valley, Papers Please, Axiom Verge). Do not block on AA.",
    "Constraints like 'realistic graphics + low budget + weak/no art' are NOT a block by themselves:",
    "they are achievable via asset stores, free PBR libraries (e.g. Megascans/Fab), and AI generation.",
    "In that case set feasible=true and use the reason to caution the user — e.g. advise dropping true",
    "photorealism for a stylised or asset-driven look and keeping scope to one small environment.",
    "If feasible, pick the non-engine categories this project actually needs from:",
    NON_ENGINE_CATEGORIES.join(", ") + ".",
    "Skip categories the project does not need (e.g. a text-only game needs no animation or vfx).",
    "Answer in English. Keep the reason to 1-2 sentences.",
  ].join("\n");
}

export function feasibilityUserPrompt(
  input: {
    projectIdea: string;
    budget: string;
    skillLevel: string;
    artCapability: string;
    platformTarget: string[];
  },
  guidance: string,
): string {
  return [
    `Project idea: ${input.projectIdea}`,
    `Budget: ${input.budget}, Skill: ${input.skillLevel}, Art capability: ${input.artCapability}`,
    `Platforms: ${input.platformTarget.join(", ") || "unspecified"}`,
    "",
    "Reference guidance:",
    guidance || "(none retrieved)",
  ].join("\n");
}

export const EngineDecisionSchema = z.object({
  picked: z.enum(ENGINES),
  userPreferred: z.enum(ENGINES).nullable(),
  agreement: z.enum(["agreed", "challenged", "user_silent"]),
  reasoning: z.string().min(1),
  alternativesConsidered: z.array(
    z.object({
      engine: z.enum(ENGINES),
      reasonRejected: z.string().min(1),
    }),
  ),
});
export type EngineDecisionShape = z.infer<typeof EngineDecisionSchema>;

export function engineSystemPrompt(): string {
  return [
    "You are a senior game engine consultant. Choose exactly one of Unity, Unreal, or Godot.",
    "Parse any engine the user mentioned in their idea. You MAY challenge their choice with reasoning if another engine fits better.",
    "Set userPreferred to the engine the user mentioned, or null if they mentioned none.",
    "agreement rules: 'user_silent' if userPreferred is null; 'agreed' if picked === userPreferred; 'challenged' if picked !== userPreferred.",
    "Only use the provided engine docs and guidance as evidence. Answer in English.",
  ].join("\n");
}

export function engineUserPrompt(idea: string, context: string): string {
  return [`Project idea: ${idea}`, "", "Engine docs and guidance:", context || "(none retrieved)"].join("\n");
}

// Built per-request so the model can only choose from retrieved candidate ids.
export function buildCategorySchema(candidateIds: string[]) {
  const idEnum = z.enum(candidateIds as [string, ...string[]]);
  const item = z.object({
    toolId: idEnum,
    reasoning: z.string().min(1),
    pros: z.array(z.string().min(1)).min(1),
    cons: z.array(z.string().min(1)).min(1),
  });
  return z.object({
    answerPossible: z.boolean(),
    primary: item,
    alternatives: z.array(item).max(2),
    reasoning: z.string().min(1),
  });
}

export function categorySystemPrompt(category: string): string {
  return [
    `You recommend tools for the "${category}" category of a game project.`,
    "Choose ONE primary tool and up to 2 alternatives, ONLY from the provided candidates.",
    "Use ONLY the pros, cons, pricing, platforms and facts present in each candidate's text.",
    "Do NOT invent capabilities, prices, or platform support that are not shown in the candidate text.",
    "If the candidates are insufficient for a confident pick, say so in your reasoning rather than fabricating.",
    "Set answerPossible=false if the provided candidates are genuinely insufficient for a confident pick; otherwise set it true.",
    "Apply the AI-vs-traditional rule: when skill/art capability is low and budget is tight,",
    "prefer ai / low-learning-curve tools (e.g. Meshy) over high-curve standalone tools (e.g. Blender), and say why.",
    "Answer in English.",
  ].join("\n");
}

export function categoryUserPrompt(args: {
  idea: string;
  budget: string;
  skillLevel: string;
  artCapability: string;
  category: string;
  candidates: string;
}): string {
  return [
    `Project idea: ${args.idea}`,
    `Budget: ${args.budget}, Skill: ${args.skillLevel}, Art capability: ${args.artCapability}`,
    `Category: ${args.category}`,
    "",
    "Candidate tools (choose only from these):",
    args.candidates,
  ].join("\n");
}

export function buildReviewSchema(recommendedIds: string[]) {
  return z.object({
    projectSummary: z.string().min(1),
    finalSummary: z.string().min(1),
    scoreReasons: z.array(
      z.object({
        toolId: z.enum(recommendedIds as [string, ...string[]]),
        scoreReason: z.string().min(1),
      }),
    ),
  });
}

export function reviewSystemPrompt(): string {
  return [
    "You are a senior game-development consultant reviewing a recommended tool stack.",
    "Each tool already has a deterministic score out of 10. For EACH tool, write a one-sentence scoreReason",
    "explaining why it scored what it did given the constraints (e.g. why 8/10 and not 10/10).",
    "Then write a short markdown finalSummary (max ~200 words) and a one-line projectSummary. English only.",
  ].join("\n");
}

export function reviewUserPrompt(idea: string, stack: string): string {
  return [`Project idea: ${idea}`, "", "Scored recommendations:", stack].join("\n");
}
