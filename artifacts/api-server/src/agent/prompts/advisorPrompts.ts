import { z } from "zod/v4";
import { ENGINE_IDS } from "../../lib/engines.js";

export const FeasibilitySchema = z.object({
  feasible: z.boolean(),
  reason: z.string().min(1),
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
    "You only decide feasibility — category selection is handled downstream.",
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
  picked: z.enum(ENGINE_IDS as [string, ...string[]]),
  userPreferred: z.enum(ENGINE_IDS as [string, ...string[]]).nullable(),
  agreement: z.enum(["agreed", "challenged", "user_silent"]),
  reasoning: z.string().min(1),
  alternativesConsidered: z.array(
    z.object({
      engine: z.enum(ENGINE_IDS as [string, ...string[]]),
      reasonRejected: z.string().min(1),
    }),
  ),
});
export type EngineDecisionShape = z.infer<typeof EngineDecisionSchema>;

export function engineSystemPrompt(): string {
  return [
    "You are a senior game engine consultant. Choose exactly one engine, by its id, from the candidate engines in the provided docs.",
    "Match the project to the right engine: 2D web games favor Phaser; 3D web favors Three.js; cross-platform 2D/3D favors Unity, Godot, or GameMaker; visual novels favor Ren'Py.",
    "Unreal is the strongest fit for high-fidelity / high-end graphics 3D, and for combat-heavy or animation-rich 3D (e.g. action RPGs, fighting, third-person action) thanks to its out-of-the-box visual fidelity and animation/combat tooling.",
    "Do NOT treat the word 'indie' as a reason to exclude Unreal: 'indie' describes team size and scope, not visual fidelity. An indie 3D action RPG that wants fancy combat or high-end graphics should still get Unreal.",
    "Reserve Unity for projects that prioritise fast iteration, lighter footprint, mobile, or a broad 2D/3D mix over maximum 3D visual fidelity.",
    "If the user named an engine that is among the candidates, use it. You MAY challenge their choice with reasoning only if another candidate clearly fits better.",
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
    "Always choose a primary from the candidates — pick the best available even if imperfect, and note any limitation in your reasoning.",
    "If a candidate's text says it is specific to one engine (e.g. Unity only) and the chosen engine is different, do not select it as primary.",
    "Apply the AI-vs-traditional rule: when skill/art capability is low and budget is tight,",
    "prefer ai / low-learning-curve tools (e.g. Meshy) over high-curve standalone tools (e.g. Blender), and say why.",
    "Apply the symmetric tier rule: when budget is high AND skill is advanced, prefer the highest-quality / frontier",
    "tool the candidates offer over a value or price/performance pick, because the user is not optimising for cost.",
    "For ai_coding specifically, an advanced user with a high budget should get frontier coding tools (e.g. Claude Code,",
    "ChatGPT Codex) rather than a value option chosen for price/performance — only fall back if no frontier tool is a candidate.",
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
