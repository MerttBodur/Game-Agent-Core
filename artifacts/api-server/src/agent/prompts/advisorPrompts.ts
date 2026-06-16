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
    "Block ONLY clearly unrealistic asks (e.g. a solo dev cloning a AAA open-world game in a week).",
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
    teamSize: string;
    artCapability: string;
    platformTarget: string[];
  },
  guidance: string,
): string {
  return [
    `Project idea: ${input.projectIdea}`,
    `Budget: ${input.budget}, Skill: ${input.skillLevel}, Team: ${input.teamSize}, Art capability: ${input.artCapability}`,
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
    primary: item,
    alternatives: z.array(item).max(2),
    reasoning: z.string().min(1),
  });
}

export function categorySystemPrompt(category: string): string {
  return [
    `You recommend tools for the "${category}" category of a game project.`,
    "Choose ONE primary tool and up to 2 alternatives, ONLY from the provided candidates.",
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
