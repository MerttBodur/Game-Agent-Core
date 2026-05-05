import OpenAI from "openai";
import { GAME_DEV_TOOLS, TOOL_CATEGORIES, type GameDevTool } from "./gameDevTools.js";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});
import { retrieveRelevantKnowledge } from "./rag/index.js";

export interface ProjectInput {
  projectIdea: string;
  budget: string;
  timeLimit: string;
  skillLevel: string;
  teamSize: string;
  platformTarget: string[];
  artCapability: string;
  otherConstraints?: string | null;
}

interface ToolScore {
  tool: GameDevTool;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reasoning: string;
}

export interface ScoreBreakdown {
  budget: number;
  skill: number;
  platform: number;
  timeLimit: number;
  artCapability: number;
  total: number;
}

interface RetrievedKnowledgeChunk {
  content?: string;
  text?: string;
  chunk?: string;
  pageContent?: string;
  score?: number;
  source?: string | Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

type RetrievedKnowledgeResponse =
  | RetrievedKnowledgeChunk[]
  | {
      chunks?: RetrievedKnowledgeChunk[];
      results?: RetrievedKnowledgeChunk[];
      items?: RetrievedKnowledgeChunk[];
      documents?: RetrievedKnowledgeChunk[];
    };

export interface CategoryResultTool extends GameDevTool {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  reasoning: string;
}

export type CategoryResults = Record<string, { topTool: CategoryResultTool; alternatives: CategoryResultTool[] }>;

export interface AnalysisMetadata {
  projectSummary: string;
  detectedProjectType: string;
  stackOverview: string;
  overallConfidence: number;
}

function scoreTool(tool: GameDevTool, input: ProjectInput): { total: number; breakdown: ScoreBreakdown } {
  const baseScore = 50;
  let budgetDelta = 0;
  let skillDelta = 0;
  let platformDelta = 0;
  let timeLimitDelta = 0;
  let artCapabilityDelta = 0;

  // Budget fit
  const budgetMap: Record<string, string[]> = {
    zero: ["open_source", "free"],
    low: ["open_source", "free", "freemium"],
    medium: ["open_source", "free", "freemium", "paid"],
    high: ["open_source", "free", "freemium", "paid", "subscription"],
    enterprise: ["open_source", "free", "freemium", "paid", "subscription"],
  };
  const allowedPricing = budgetMap[input.budget] || [];
  if (allowedPricing.includes(tool.pricing)) {
    budgetDelta += 15;
  } else {
    budgetDelta -= 20;
  }

  // Skill fit
  const skillLevels = ["beginner", "intermediate", "advanced", "expert"];
  const userSkillIdx = skillLevels.indexOf(input.skillLevel);
  const toolSkillIdx = skillLevels.indexOf(tool.minSkillLevel);
  if (userSkillIdx >= toolSkillIdx) {
    skillDelta += 10;
    if (userSkillIdx - toolSkillIdx >= 2) skillDelta += 5; // Comfortable with tool
  } else {
    skillDelta -= 15 * (toolSkillIdx - userSkillIdx);
  }

  // Platform fit
  const userPlatforms = input.platformTarget.map((p) => p.toLowerCase());
  const toolPlatforms = tool.platforms.map((p) => p.toLowerCase());
  const overlap = userPlatforms.filter((p) => toolPlatforms.includes(p));
  if (overlap.length > 0) {
    platformDelta += 10 + (overlap.length - 1) * 3;
  } else if (userPlatforms.length > 0) {
    platformDelta -= 25;
  }

  // Time limit fit for MVPs (fast iteration tools preferred for jams)
  if (input.timeLimit === "jam") {
    if (tool.tags.includes("beginner-friendly") || tool.tags.includes("game-jam")) timeLimitDelta += 15;
    if (tool.minSkillLevel === "expert" || tool.minSkillLevel === "advanced") timeLimitDelta -= 10;
  }

  // Art capability fit
  if (tool.category === "art" || tool.category === "animation") {
    const artMap: Record<string, string[]> = {
      none: ["ai_tooling"],
      basic: ["ai_tooling", "beginner"],
      intermediate: ["ai_tooling", "beginner", "intermediate"],
      advanced: ["ai_tooling", "beginner", "intermediate", "advanced"],
      professional: ["ai_tooling", "beginner", "intermediate", "advanced", "expert"],
    };
    const allowedArt = artMap[input.artCapability] || [];
    if (allowedArt.includes(tool.minSkillLevel) || allowedArt.includes("ai_tooling")) {
      artCapabilityDelta += 10;
    } else {
      artCapabilityDelta -= 15;
    }
  }

  const total = Math.min(100, Math.max(0, baseScore + budgetDelta + skillDelta + platformDelta + timeLimitDelta + artCapabilityDelta));
  return {
    total,
    breakdown: {
      budget: budgetDelta,
      skill: skillDelta,
      platform: platformDelta,
      timeLimit: timeLimitDelta,
      artCapability: artCapabilityDelta,
      total,
    },
  };
}

function generateReasoning(tool: GameDevTool, input: ProjectInput, score: number): string {
  const parts: string[] = [];
  if (score >= 80) {
    parts.push(`${tool.name} is an excellent fit for this project.`);
  } else if (score >= 60) {
    parts.push(`${tool.name} is a solid choice for this project.`);
  } else {
    parts.push(`${tool.name} can work but has some limitations for this project.`);
  }

  // Platform note
  const overlap = input.platformTarget.filter((p) => tool.platforms.includes(p));
  if (overlap.length > 0) parts.push(`It natively supports your target platform(s): ${overlap.join(", ")}.`);

  // Budget note
  if (["free", "open_source"].includes(tool.pricing)) {
    parts.push("Completely free to use, fitting your budget constraint.");
  } else if (tool.pricing === "freemium") {
    parts.push("Freemium model: free to get started, paid tiers for commercial/advanced use.");
  }

  return parts.join(" ");
}

async function retrieveKnowledgeForAdvisor(input: ProjectInput): Promise<RetrievedKnowledgeResponse | null> {
  try {
    return await retrieveRelevantKnowledge(input, { topK: 5 });
  } catch (error) {
    console.warn("RAG retrieval failed; continuing with scoring-only advisor flow.", error);
    return null;
  }
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength - 1).trimEnd()}...`;
}

function getRetrievedKnowledgeChunks(retrieved: RetrievedKnowledgeResponse | null): RetrievedKnowledgeChunk[] {
  if (!retrieved) return [];
  if (Array.isArray(retrieved)) return retrieved;

  return retrieved.chunks ?? retrieved.results ?? retrieved.items ?? retrieved.documents ?? [];
}

function getChunkText(chunk: RetrievedKnowledgeChunk): string {
  const text = chunk.content ?? chunk.text ?? chunk.chunk ?? chunk.pageContent;
  return typeof text === "string" ? text : "";
}

function getSourceMetadata(chunk: RetrievedKnowledgeChunk): string {
  const parts: string[] = [];

  if (typeof chunk.source === "string" && chunk.source.trim()) {
    parts.push(`source=${compactText(chunk.source, 120)}`);
  } else if (typeof chunk.source === "object" && chunk.source !== null) {
    for (const key of ["title", "name", "url", "path", "id"]) {
      const value = chunk.source[key];
      if (typeof value === "string" && value.trim()) parts.push(`${key}=${compactText(value, 120)}`);
    }
  }

  if (chunk.metadata) {
    for (const key of ["title", "source", "url", "path", "section", "tool", "category"]) {
      const value = chunk.metadata[key];
      if (typeof value === "string" && value.trim()) parts.push(`${key}=${compactText(value, 120)}`);
    }
  }

  if (typeof chunk.score === "number") parts.push(`score=${chunk.score.toFixed(3)}`);

  return parts.length > 0 ? parts.join("; ") : "source=unknown";
}

function formatRetrievedKnowledgeContext(retrieved: RetrievedKnowledgeResponse | null): string {
  const chunks = getRetrievedKnowledgeChunks(retrieved)
    .map((chunk) => ({
      text: compactText(getChunkText(chunk), 900),
      sourceMetadata: getSourceMetadata(chunk),
    }))
    .filter((chunk) => chunk.text.length > 0);

  if (chunks.length === 0) {
    return "No retrieved knowledge context was available.";
  }

  return chunks.map((chunk, index) => `${index + 1}. ${chunk.text}\n   Source metadata: ${chunk.sourceMetadata}`).join("\n");
}

export function buildCategoryResults(input: ProjectInput): CategoryResults {
  const categories = TOOL_CATEGORIES.map((cat) => cat.id);
  const categoryResults: CategoryResults = {};

  for (const cat of categories) {
    const toolsInCat = GAME_DEV_TOOLS.filter((t) => t.category === cat);
    if (toolsInCat.length === 0) continue;

    const scored: ToolScore[] = toolsInCat.map((tool) => {
      const scoredTool = scoreTool(tool, input);
      return {
        tool,
        score: scoredTool.total,
        scoreBreakdown: scoredTool.breakdown,
        reasoning: generateReasoning(tool, input, scoredTool.total),
      };
    });
    scored.sort((a, b) => b.score - a.score);

    const top = scored[0];
    const alts = scored.slice(1, 3);

    categoryResults[cat] = {
      topTool: { ...top.tool, score: top.score, scoreBreakdown: top.scoreBreakdown, reasoning: top.reasoning },
      alternatives: alts.map((a) => ({ ...a.tool, score: a.score, scoreBreakdown: a.scoreBreakdown, reasoning: a.reasoning })),
    };
  }

  return categoryResults;
}

export function buildTopStackSummary(categoryResults: CategoryResults): string {
  return Object.entries(categoryResults)
    .map(([cat, res]) => `${cat}: ${res.topTool.name} (score: ${res.topTool.score})`)
    .join(", ");
}

export async function retrieveAdvisorKnowledge(input: ProjectInput): Promise<{
  ragChunks: Array<{ text: string; source: string; score?: number | null }>;
  retrievedKnowledgeContext: string;
}> {
  const retrievedKnowledge = await retrieveKnowledgeForAdvisor(input);
  return {
    ragChunks: getRetrievedKnowledgeChunks(retrievedKnowledge)
    .map((chunk) => ({
      text: compactText(getChunkText(chunk), 280),
      source: getSourceMetadata(chunk),
      score: typeof chunk.score === "number" ? chunk.score : null,
    }))
    .filter((chunk) => chunk.text.length > 0),
    retrievedKnowledgeContext: formatRetrievedKnowledgeContext(retrievedKnowledge),
  };
}

function getMetadataPrompt(input: ProjectInput, topStackSummary: string, retrievedKnowledgeContext: string): string {
  return `You are a senior game development consultant. Analyze this game project and provide concise, expert analysis.

PROJECT DETAILS:
- Idea: ${input.projectIdea}
- Budget: ${input.budget}
- Timeline: ${input.timeLimit}
- Skill Level: ${input.skillLevel}
- Team: ${input.teamSize}
- Target Platforms: ${input.platformTarget.join(", ")}
- Art Capability: ${input.artCapability}
- Constraints: ${input.otherConstraints || "None"}

PRE-SCORED TOOL STACK:
${topStackSummary}

RETRIEVED KNOWLEDGE CONTEXT:
${retrievedKnowledgeContext}

Use the pre-scored tool stack as the base ranking. When retrieved knowledge context is available, ground explanations in it and use source metadata to understand where each fact came from. Do not invent unsupported details about tools, pricing, capabilities, performance, or platform support. If retrieved knowledge is unavailable, rely only on the project details and pre-scored stack.

Respond with a JSON object with these exact keys:
{
  "projectSummary": "2-3 sentence summary of what this game project is and what makes it interesting/challenging",
  "detectedProjectType": "Brief label like '2D Platformer', 'Mobile Puzzle Game', 'FPS Shooter', 'RPG', 'Game Jam Entry' etc.",
  "stackOverview": "One crisp sentence listing the core recommended tools, e.g. 'Godot + GDScript + Aseprite + itch.io'",
  "overallConfidence": <number 0-100 representing how confident you are this stack fits the project>
}`;
}

function getFinalSummaryPrompt(
  input: ProjectInput,
  metadata: AnalysisMetadata,
  topStackSummary: string,
  retrievedKnowledgeContext: string,
): string {
  return `You are a senior game development consultant.

Write only the final recommendation narrative for this project in 3-4 sentences.

PROJECT DETAILS:
- Idea: ${input.projectIdea}
- Budget: ${input.budget}
- Timeline: ${input.timeLimit}
- Skill Level: ${input.skillLevel}
- Team: ${input.teamSize}
- Target Platforms: ${input.platformTarget.join(", ")}
- Art Capability: ${input.artCapability}
- Constraints: ${input.otherConstraints || "None"}

PRE-SCORED TOOL STACK:
${topStackSummary}

METADATA:
- Project Summary: ${metadata.projectSummary}
- Project Type: ${metadata.detectedProjectType}
- Stack Overview: ${metadata.stackOverview}

RETRIEVED KNOWLEDGE CONTEXT:
${retrievedKnowledgeContext}

Ground your narrative in the stack and available retrieved context. Do not invent unsupported details.`;
}

export async function generateMetadataWithAI(
  input: ProjectInput,
  categoryResults: CategoryResults,
  retrievedKnowledgeContext: string,
): Promise<AnalysisMetadata> {
  const prompt = getMetadataPrompt(input, buildTopStackSummary(categoryResults), retrievedKnowledgeContext);

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  let parsed: AnalysisMetadata;

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {
      projectSummary: "A game development project with specific constraints and goals.",
      detectedProjectType: "Indie Game",
      stackOverview: Object.values(categoryResults)
        .map((r) => r.topTool.name)
        .slice(0, 4)
        .join(" + "),
      overallConfidence: 72,
    };
  }

  return {
    projectSummary: parsed.projectSummary,
    detectedProjectType: parsed.detectedProjectType,
    stackOverview: parsed.stackOverview,
    overallConfidence: parsed.overallConfidence,
  };
}

export async function streamFinalSummaryWithAI(
  input: ProjectInput,
  metadata: AnalysisMetadata,
  categoryResults: CategoryResults,
  retrievedKnowledgeContext: string,
  onToken: (token: string) => void,
): Promise<string> {
  const prompt = getFinalSummaryPrompt(input, metadata, buildTopStackSummary(categoryResults), retrievedKnowledgeContext);
  const stream = await openai.chat.completions.create({
    model: "gpt-5-mini",
    stream: true,
    messages: [{ role: "user", content: prompt }],
  });

  let finalSummary = "";
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    if (token) {
      finalSummary += token;
      onToken(token);
    }
  }
  return finalSummary.trim();
}

export async function generateFinalSummaryWithAI(
  input: ProjectInput,
  metadata: AnalysisMetadata,
  categoryResults: CategoryResults,
  retrievedKnowledgeContext: string,
): Promise<string> {
  const prompt = getFinalSummaryPrompt(input, metadata, buildTopStackSummary(categoryResults), retrievedKnowledgeContext);
  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });
  return (response.choices[0]?.message?.content ?? "").trim();
}

export async function analyzeProjectWithAI(input: ProjectInput): Promise<{
  projectSummary: string;
  detectedProjectType: string;
  categoryResults: CategoryResults;
  finalSummary: string;
  stackOverview: string;
  overallConfidence: number;
  ragChunks: Array<{ text: string; source: string; score?: number | null }>;
}> {
  const categoryResults = buildCategoryResults(input);
  const { ragChunks, retrievedKnowledgeContext } = await retrieveAdvisorKnowledge(input);
  const metadata = await generateMetadataWithAI(input, categoryResults, retrievedKnowledgeContext);
  const finalSummary = await generateFinalSummaryWithAI(input, metadata, categoryResults, retrievedKnowledgeContext);

  return {
    ...metadata,
    finalSummary:
      finalSummary ||
      "This stack has been selected based on your budget, skill level, and platform targets.",
    categoryResults,
    ragChunks,
  };
}
