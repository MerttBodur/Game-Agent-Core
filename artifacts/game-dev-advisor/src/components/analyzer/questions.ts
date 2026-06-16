import type { ProjectInput } from "@workspace/api-client-react";

export type QuestionId =
  | "theme"
  | "mechanics"
  | "budget"
  | "skill"
  | "team"
  | "platforms"
  | "art"
  | "paid_priority"
  | "notes";

export type QuestionKind = "text" | "single" | "multi";

export interface QuestionOption {
  value: string;
  label: string;
  desc?: string;
}

export interface Question {
  id: QuestionId;
  kind: QuestionKind;
  title: string;
  subtitle?: string;
  placeholder?: string;
  optional?: boolean;
  /** Multi-select questions that still require at least one pick (API constraint). */
  requiresSelection?: boolean;
  options?: QuestionOption[];
}

export const QUESTIONS: Question[] = [
  {
    id: "theme",
    kind: "text",
    title: "What's your game theme?",
    subtitle:
      "Describe the world, vibe, or core fantasy. The more concrete, the sharper the recommendations.",
    placeholder:
      "e.g. A cozy underwater farm sim where you tend bioluminescent crops with a slow narrative arc.",
  },
  {
    id: "mechanics",
    kind: "text",
    title: "Core mechanics & gameplay",
    subtitle: "What does the player actually do, moment to moment?",
    placeholder:
      "e.g. Tile-based farming, dialog with NPCs, light puzzle-solving, ambient ocean exploration.",
  },
  {
    id: "budget",
    kind: "single",
    title: "What's your budget?",
    options: [
      { value: "low", label: "Low", desc: "< $500" },
      { value: "medium", label: "Medium", desc: "$500 - $5k" },
      { value: "high", label: "High", desc: "$5k - $50k" },
      { value: "enterprise", label: "Enterprise", desc: "$50k+" },
    ],
  },
  {
    id: "skill",
    kind: "single",
    title: "Your skill level",
    options: [
      { value: "beginner", label: "Beginner", desc: "New to game dev" },
      { value: "intermediate", label: "Intermediate", desc: "Some experience" },
      { value: "advanced", label: "Advanced", desc: "Experienced dev" },
      { value: "expert", label: "Expert", desc: "Industry veteran" },
    ],
  },
  {
    id: "team",
    kind: "single",
    title: "Team size",
    options: [
      { value: "solo", label: "Solo", desc: "Just me" },
      { value: "team", label: "Team", desc: "2+ people" },
    ],
  },
  {
    id: "platforms",
    kind: "multi",
    requiresSelection: true,
    title: "Target platforms",
    subtitle: "Pick all that apply.",
    options: [
      { value: "pc", label: "PC / Desktop" },
      { value: "mobile", label: "Mobile" },
      { value: "web", label: "Web / Browser" },
      { value: "console", label: "Console" },
      { value: "vr", label: "VR / AR" },
    ],
  },
  {
    id: "art",
    kind: "single",
    title: "Art & design capability",
    options: [
      { value: "none", label: "None", desc: "No art skills" },
      { value: "basic", label: "Basic", desc: "Simple graphics" },
      { value: "intermediate", label: "Intermediate", desc: "Decent visuals" },
      { value: "advanced", label: "Advanced", desc: "Strong art skills" },
      { value: "professional", label: "Professional", desc: "Expert artist" },
    ],
  },
  {
    id: "paid_priority",
    kind: "multi",
    optional: true,
    title: "Paid-priority categories",
    subtitle: "Categories where you accept paid tools. Empty = the advisor prefers free.",
    options: [
      { value: "art_asset", label: "Art & Assets" },
      { value: "vfx", label: "VFX" },
      { value: "animation", label: "Animation" },
      { value: "audio", label: "Audio" },
      { value: "ai_coding", label: "AI Coding" },
    ],
  },
  {
    id: "notes",
    kind: "text",
    optional: true,
    title: "Anything else to add?",
    subtitle:
      "Constraints, preferences, things you want to avoid — write whatever's on your mind.",
    placeholder:
      "e.g. I want to publish on itch.io, I dislike subscription tools, I have a Steam Deck.",
  },
];

export type Answers = Record<QuestionId, string | string[]>;

export function initialAnswers(): Answers {
  return Object.fromEntries(
    QUESTIONS.map((q) => [q.id, q.kind === "multi" ? [] : ""]),
  ) as Answers;
}

export function optionLabel(questionId: QuestionId, value: string): string {
  const question = QUESTIONS.find((q) => q.id === questionId);
  return question?.options?.find((o) => o.value === value)?.label ?? value;
}

export function isAnswered(question: Question, value: string | string[]): boolean {
  return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
}

export function canAdvance(question: Question, value: string | string[]): boolean {
  if (question.optional) return true;
  if (question.kind === "multi") {
    return question.requiresSelection ? (value as string[]).length > 0 : true;
  }
  return isAnswered(question, value);
}

// The API contract has no theme/mechanics fields, so the extra wizard answers
// are folded into the free-text field the LLM already reads.
export function buildProjectInput(answers: Answers): ProjectInput {
  const theme = (answers.theme as string).trim();
  const mechanics = (answers.mechanics as string).trim();
  const projectIdea = mechanics ? `${theme}\n\nCore mechanics: ${mechanics}` : theme;

  const notes = (answers.notes as string).trim();
  const paidPriority = answers.paid_priority as string[];

  return {
    projectIdea,
    budget: answers.budget as ProjectInput["budget"],
    skillLevel: answers.skill as ProjectInput["skillLevel"],
    teamSize: answers.team as ProjectInput["teamSize"],
    platformTarget: answers.platforms as string[],
    artCapability: answers.art as ProjectInput["artCapability"],
    paidPriorityCategories:
      paidPriority.length > 0
        ? (paidPriority as NonNullable<ProjectInput["paidPriorityCategories"]>)
        : undefined,
    notes: notes || null,
  };
}
