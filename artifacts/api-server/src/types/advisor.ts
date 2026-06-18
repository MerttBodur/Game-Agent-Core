import type { Category, EngineName, NonEngineCategory } from "./catalog.js";

export interface AdvisorInput {
  projectIdea: string;
  budget: "low" | "medium" | "high" | "enterprise";
  skillLevel: "beginner" | "intermediate" | "advanced" | "expert";
  platformTarget: string[];
  artCapability: "none" | "basic" | "intermediate" | "advanced" | "professional";
}

export interface FeasibilityDecision {
  feasible: boolean;
  reason: string;
  targetCategories: NonEngineCategory[];
}

export interface EngineDecision {
  picked: EngineName;
  userPreferred: EngineName | null;
  agreement: "agreed" | "challenged" | "user_silent";
  reasoning: string;
  alternativesConsidered: Array<{ engine: EngineName; reasonRejected: string }>;
}

export interface RecommendedTool {
  toolId: string;
  score: number; // 0-10, one decimal
  scoreReason: string;
  reasoning: string;
  pros: string[];
  cons: string[];
}

export interface CategoryRecommendation {
  category: Category;
  primary: RecommendedTool;
  alternatives: RecommendedTool[]; // <= 2
  reasoning: string;
}

export interface AnalysisResult {
  sessionId: string; // "" when terminated
  feasible: boolean;
  reason: string;
  terminated: boolean;
  projectSummary: string;
  engineDecision?: EngineDecision;
  recommendations: CategoryRecommendation[]; // [] when terminated
  finalSummary: string;
}
