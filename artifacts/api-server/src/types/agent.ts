import type { AnalysisResult } from "./recommendation.js";

export type Engine = "Unity" | "Unreal" | "Godot" | "Custom" | "unknown";
export type Agreement = "agreed" | "challenged" | "user_silent";
export type RetryMode = "broaden" | "pre_filter";

export interface AdvisorFormInput {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: "solo" | "team";
  platformTarget: string[];
  artCapability: string;
  multiplayer: boolean;
  otherConstraints?: string | null;
  pinnedToolIds?: string[];
}

export interface AnalyzeResult {
  targetCategories: string[];
  projectSummary: string;
  userMentionedEngine: Engine | null;
  signals: {
    is2D: boolean;
    is3D: boolean;
    targetPlatformPrimary: string;
    complexitySignals: string[];
  };
}

export interface EngineDecision {
  picked: Exclude<Engine, "unknown">;
  userPreferred: Engine | null;
  agreement: Agreement;
  reasoning: string;
  alternativesConsidered: Array<{ engine: Engine; reasonRejected: string }>;
}

export type CandidateEntry =
  | { type: "fetched"; tools: ToolRow[] }
  | { type: "locked"; lockedTo: string[]; note: string }
  | { type: "skipped"; reason: string }
  | { type: "context"; tools: ToolRow[]; note: string };

export interface RetrievalResult {
  candidatesByCategory: Record<string, CandidateEntry>;
  totalToolCount: number;
  retryHistory: Array<{ attempt: number; mode: RetryMode; countBefore: number }>;
}

export interface AgentState {
  input: AdvisorFormInput;
  analyze?: AnalyzeResult;
  engineDecision?: EngineDecision;
  retrieval?: RetrievalResult;
  retryCount: number;
  finalResult?: AnalysisResult;
}

export interface ToolRow {
  id: string;
  name: string;
  leafCategory: string;
  description: string | null;
  priceModel: "free" | "freemium" | "paid" | "subscription";
  compatibleEngines: Engine[];
  toolType: "builtin" | "plugin" | "asset" | "external" | "service";
  platforms: string[];
  pros: string[];
  cons: string[];
  url: string | null;
  rating: number;
  lastUpdated: string | null;
}
