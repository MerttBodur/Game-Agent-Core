import { z } from "zod/v4";

export const PDD_CATEGORIES = [
  "game_engine",
  "ide",
  "version_control",
  "art_asset_creation",
  "audio",
  "ai_coding_assistant",
  "deployment_publishing",
] as const;
export type PddCategory = (typeof PDD_CATEGORIES)[number];

export const PHASES = [
  "planning",
  "programming",
  "version_control",
  "art_assets",
  "audio",
  "deployment_publishing",
] as const;
export type Phase = (typeof PHASES)[number];

export const PRICING = [
  "free",
  "open_source",
  "freemium",
  "paid",
  "subscription",
  "revenue_share",
  "enterprise",
] as const;
export type Pricing = (typeof PRICING)[number];

export const DIFFICULTY_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const FIT_2D3D = ["2d", "3d", "both"] as const;
export type Fit2D3D = (typeof FIT_2D3D)[number];

export const TEAM_SIZES = ["solo", "small", "medium", "large"] as const;
export type TeamSizeFit = (typeof TEAM_SIZES)[number];

export const PLATFORMS = ["pc", "mobile", "web", "console", "vr", "ar"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const GENRES = [
  "action", "adventure", "rpg", "strategy", "simulation",
  "puzzle", "platformer", "shooter", "racing", "sports",
  "horror", "narrative", "casual", "arcade",
] as const;
export type Genre = (typeof GENRES)[number];

export const ToolEntrySchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9_]+$/, "id must be lowercase snake_case"),
  name: z.string().min(1),
  category: z.enum(PDD_CATEGORIES),
  subcategory: z.string().optional(),
  description: z.string().min(1),
  bestUseCase: z.string().min(1),
  supportedPlatforms: z.array(z.enum(PLATFORMS)).min(1),
  pricing: z.enum(PRICING),
  difficultyLevel: z.enum(DIFFICULTY_LEVELS),
  beginnerSuitability: z.number().int().min(0).max(100),
  teamSizeFit: z.array(z.enum(TEAM_SIZES)).min(1),
  genreFit: z.array(z.enum(GENRES)).min(1),
  fit2d3d: z.enum(FIT_2D3D),
  pros: z.array(z.string().min(1)).min(1),
  cons: z.array(z.string().min(1)).min(1),
  alternatives: z.array(z.string().min(1)).min(1),
  phase: z.array(z.enum(PHASES)).min(1),
  website: z.string().url().optional(),
});
export type ToolEntry = z.infer<typeof ToolEntrySchema>;

export const ToolCatalogSchema = z.array(ToolEntrySchema);
export type ToolCatalog = z.infer<typeof ToolCatalogSchema>;

export const PDD_CATEGORY_LABELS: Record<PddCategory, { label: string; description: string }> = {
  game_engine: { label: "Game Engine", description: "Core engines for 2D/3D production." },
  ide: { label: "IDE", description: "Code editors and integrated development environments." },
  version_control: { label: "Version Control", description: "Source control and code collaboration." },
  art_asset_creation: { label: "Art & Asset Creation", description: "2D art, 3D modelling, animation, UI, and VFX." },
  audio: { label: "Audio", description: "Sound design, music, and audio middleware." },
  ai_coding_assistant: { label: "AI Coding Assistant", description: "AI tools that help write code." },
  deployment_publishing: { label: "Deployment & Publishing", description: "Stores and distribution platforms." },
};

// Retrieval-confidence weights (Sprint 3 uses these). Sum to 100.
// Locked decisions (2026-05-07 user spec):
// engine = core; art_assets next; deployment + ide = lowest impact.
export const PDD_CATEGORY_WEIGHTS: Record<PddCategory, number> = {
  game_engine: 30,
  art_asset_creation: 20,
  audio: 15,
  version_control: 12,
  ai_coding_assistant: 10,
  ide: 7,
  deployment_publishing: 6,
};
