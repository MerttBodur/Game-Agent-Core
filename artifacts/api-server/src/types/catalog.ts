import { z } from "zod/v4";

export const CATEGORIES = ["game_engine", "art_asset", "vfx", "animation", "audio", "ai_coding"] as const;
export type Category = (typeof CATEGORIES)[number];

export const NON_ENGINE_CATEGORIES = ["art_asset", "vfx", "animation", "audio", "ai_coding"] as const;
export type NonEngineCategory = (typeof NON_ENGINE_CATEGORIES)[number];

export const ENGINES = ["Unity", "Unreal", "Godot"] as const;
export type EngineName = (typeof ENGINES)[number];

export const ENGINE_COMPAT = ["Unity", "Unreal", "Godot", "any"] as const;
export const TOOL_NATURES = ["ai", "traditional", "hybrid"] as const;
export const LEARNING_CURVES = ["low", "medium", "high"] as const;
export const PRICING = ["free", "open_source", "freemium", "paid", "subscription", "revenue_share", "enterprise"] as const;
export const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const PLATFORMS = ["pc", "mobile", "web", "console", "vr", "ar"] as const;

export const CATEGORY_LABELS: Record<Category, string> = {
  game_engine: "Game Engine",
  art_asset: "Art & Asset",
  vfx: "VFX",
  animation: "Animation",
  audio: "Audio",
  ai_coding: "AI Coding Tool",
};

export const ToolEntrySchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id must be lowercase snake_case"),
  name: z.string().min(1),
  categories: z.array(z.enum(CATEGORIES)).min(1),
  description: z.string().min(1),
  bestUseCase: z.string().min(1),
  toolNature: z.enum(TOOL_NATURES),
  learningCurve: z.enum(LEARNING_CURVES),
  engineCompatibility: z.array(z.enum(ENGINE_COMPAT)).min(1),
  pricing: z.enum(PRICING),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS),
  beginnerSuitability: z.number().int().min(0).max(100),
  supportedPlatforms: z.array(z.enum(PLATFORMS)).min(1),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  website: z.string().url().optional(),
});
export type ToolEntry = z.infer<typeof ToolEntrySchema>;

export const ToolCatalogSchema = z.array(ToolEntrySchema);
export type ToolCatalog = z.infer<typeof ToolCatalogSchema>;
