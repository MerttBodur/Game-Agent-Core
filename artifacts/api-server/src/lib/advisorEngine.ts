import { openai } from "@workspace/integrations-openai-ai-server";
import { GAME_DEV_TOOLS, TOOL_CATEGORIES, type GameDevTool } from "./gameDevTools.js";
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
  reasoning: string;
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

function scoreTool(tool: GameDevTool, input: ProjectInput): number {
  let score = 50;

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
    score += 15;
  } else {
    score -= 20;
  }

  // Skill fit
  const skillLevels = ["beginner", "intermediate", "advanced", "expert"];
  const userSkillIdx = skillLevels.indexOf(input.skillLevel);
  const toolSkillIdx = skillLevels.indexOf(tool.minSkillLevel);
  if (userSkillIdx >= toolSkillIdx) {
    score += 10;
    if (userSkillIdx - toolSkillIdx >= 2) score += 5; // Comfortable with tool
  } else {
    score -= 15 * (toolSkillIdx - userSkillIdx);
  }

  // Platform fit
  const userPlatforms = input.platformTarget.map((p) => p.toLowerCase());
  const toolPlatforms = tool.platforms.map((p) => p.toLowerCase());
  const overlap = userPlatforms.filter((p) => toolPlatforms.includes(p));
  if (overlap.length > 0) {
    score += 10 + (overlap.length - 1) * 3;
  } else if (userPlatforms.length > 0) {
    score -= 25;
  }

  // Time limit fit for MVPs (fast iteration tools preferred for jams)
  if (input.timeLimit === "jam") {
    if (tool.tags.includes("beginner-friendly") || tool.tags.includes("game-jam")) score += 15;
    if (tool.minSkillLevel === "expert" || tool.minSkillLevel === "advanced") score -= 10;
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
      score += 10;
    } else {
      score -= 15;
    }
  }

  // Clamp 0-100
  return Math.min(100, Math.max(0, score));
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

export async function analyzeProjectWithAI(input: ProjectInput): Promise<{
  projectSummary: string;
  detectedProjectType: string;
  categoryResults: Record<string, { topTool: GameDevTool & { score: number; reasoning: string }; alternatives: (GameDevTool & { score: number; reasoning: string })[] }>;
  finalSummary: string;
  stackOverview: string;
  overallConfidence: number;
}> {
  // Score all tools per category
  const categories = TOOL_CATEGORIES.map((cat) => cat.id);
  const categoryResults: Record<string, { topTool: GameDevTool & { score: number; reasoning: string }; alternatives: (GameDevTool & { score: number; reasoning: string })[] }> = {};

  for (const cat of categories) {
    const toolsInCat = GAME_DEV_TOOLS.filter((t) => t.category === cat);
    if (toolsInCat.length === 0) continue;

    const scored: ToolScore[] = toolsInCat.map((tool) => ({
      tool,
      score: scoreTool(tool, input),
      reasoning: generateReasoning(tool, input, scoreTool(tool, input)),
    }));
    scored.sort((a, b) => b.score - a.score);

    const top = scored[0];
    const alts = scored.slice(1, 3);

    categoryResults[cat] = {
      topTool: { ...top.tool, score: top.score, reasoning: top.reasoning },
      alternatives: alts.map((a) => ({ ...a.tool, score: a.score, reasoning: a.reasoning })),
    };
  }

  // Use AI to generate narrative summaries
  const topStackSummary = Object.entries(categoryResults)
    .map(([cat, res]) => `${cat}: ${res.topTool.name} (score: ${res.topTool.score})`)
    .join(", ");

  const retrievedKnowledge = await retrieveKnowledgeForAdvisor(input);
  const retrievedKnowledgeContext = formatRetrievedKnowledgeContext(retrievedKnowledge);

  const prompt = `You are a senior game development consultant. Analyze this game project and provide concise, expert analysis.

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
  "finalSummary": "3-4 sentences explaining why this stack is recommended for this specific project, covering the most important trade-offs",
  "stackOverview": "One crisp sentence listing the core recommended tools, e.g. 'Godot + GDScript + Aseprite + itch.io'",
  "overallConfidence": <number 0-100 representing how confident you are this stack fits the project>
}`;

  const response = await openai.chat.completions.create({
    model: "gpt-5-mini",
    max_completion_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content ?? "{}";
  let parsed: {
    projectSummary: string;
    detectedProjectType: string;
    finalSummary: string;
    stackOverview: string;
    overallConfidence: number;
  };

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {
      projectSummary: "A game development project with specific constraints and goals.",
      detectedProjectType: "Indie Game",
      finalSummary: "This stack has been selected based on your budget, skill level, and platform targets.",
      stackOverview: Object.values(categoryResults).map((r) => r.topTool.name).slice(0, 4).join(" + "),
      overallConfidence: 72,
    };
  }

  return {
    ...parsed,
    categoryResults,
  };
}
