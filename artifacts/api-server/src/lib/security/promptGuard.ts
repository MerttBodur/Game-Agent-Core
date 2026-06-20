// Layer 1 (hardblock): regex + length validation for the one free-text field
// (projectIdea) BEFORE it reaches any LLM prompt. Pure, dependency-free, testable.
// Patterns adapted from rag-defense-layers-integration.md §8. Conservative on
// purpose: only clear prompt-injection / extraction attempts, no domain filtering.

export const MAX_PROJECT_IDEA_LENGTH = 1000;

const INJECTION_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/ignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|messages?)/i, "instruction_override"],
  [/disregard\s+(the\s+|all\s+)?(system|above|previous|prior)/i, "instruction_override"],
  [/forget\s+(everything|all|your)\b[\s\S]*\b(instructions?|rules?|training)/i, "instruction_override"],
  [/you\s+are\s+now\s+(a|an|the)\b/i, "role_hijack"],
  [/act\s+as\s+(if\s+you\s+are\s+)?(a|an|the)?\s*(dan|jailbroken|unrestricted|developer\s+mode)/i, "role_hijack"],
  [/pretend\s+(to\s+be|you('?re|\s+are))/i, "role_hijack"],
  [/(reveal|show|print|repeat|output|leak)\s+(me\s+)?(your|the)\s+(full\s+|entire\s+|original\s+)?(system\s+)?(prompt|instructions?)/i, "prompt_extraction"],
  [/new\s+instructions?\s*:/i, "instruction_injection"],
  [/<\/?\s*(system|instructions?|admin|developer)\s*>/i, "delimiter_injection"],
  [/\bbypass\b[\s\S]*\b(filter|guard|safety|rule)/i, "guard_bypass"],
];

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

export function validateProjectIdea(
  text: string,
  maxLength: number = MAX_PROJECT_IDEA_LENGTH,
): GuardResult {
  if (!text || !text.trim()) return { allowed: false, reason: "empty_query" };
  if (text.length > maxLength) return { allowed: false, reason: "query_too_long" };
  for (const [pattern, tag] of INJECTION_PATTERNS) {
    if (pattern.test(text)) return { allowed: false, reason: tag };
  }
  return { allowed: true };
}
