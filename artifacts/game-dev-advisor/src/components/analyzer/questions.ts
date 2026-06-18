import type { ProjectInput } from "@workspace/api-client-react";

export type QuestionId =
  | "theme"
  | "budget"
  | "skill"
  | "platforms"
  | "art";

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
    title: "Describe your game",
    subtitle:
      "Cover the theme or core fantasy AND what the player actually does, moment to moment. The more concrete, the sharper the recommendations.",
    placeholder:
      "e.g. A cozy underwater farm sim with a slow narrative arc — tile-based farming, dialog with NPCs, light puzzle-solving, and ambient ocean exploration.",
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

export function buildProjectInput(answers: Answers): ProjectInput {
  return {
    projectIdea: (answers.theme as string).trim(),
    budget: answers.budget as ProjectInput["budget"],
    skillLevel: answers.skill as ProjectInput["skillLevel"],
    platformTarget: answers.platforms as string[],
    artCapability: answers.art as ProjectInput["artCapability"],
  };
}
