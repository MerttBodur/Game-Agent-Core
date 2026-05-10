import type { AgentState } from "../../types/agent.js";
import type { AgentScoredTool } from "../../services/scoringService.js";

export function buildRecommendMessages(
  state: AgentState,
  scored: Record<string, AgentScoredTool[]>,
) {
  if (!state.analyze || !state.engineDecision || !state.retrieval) {
    throw new Error("Recommend prompt requires analyze, engine decision, and retrieval");
  }

  const candidateBlock = Object.entries(scored)
    .map(([category, tools]) => {
      const lines = tools
        .map(
          ({ tool, score }) =>
            `    - ${tool.id} (${score}) ${tool.name}: ${tool.description ?? "No description"} | price=${tool.priceModel} | platforms=${tool.platforms.join(",")}`,
        )
        .join("\n");
      return `[${category}]\n${lines || "    (no candidates)"}`;
    })
    .join("\n\n");

  const locked = Object.entries(state.retrieval.candidatesByCategory)
    .filter(([, entry]) => entry.type === "locked")
    .map(([category, entry]) => ({ category, ...entry }));
  const skipped = Object.entries(state.retrieval.candidatesByCategory)
    .filter(([, entry]) => entry.type === "skipped")
    .map(([category, entry]) => ({ category, ...entry }));

  const system = [
    "You are Step 3 (RECOMMEND) in a game-development tool recommendation agent.",
    "Produce the user-facing recommendation as strict JSON.",
    `PICKED ENGINE: ${state.engineDecision.picked}. The candidate pool below is the COMPLETE set of tools available for this engine and project. Tools tied to other engines are NOT available even if you know they exist (e.g. do not suggest Unity-only tools when picked engine is Unreal).`,
    "ABSOLUTE RULE: Every toolId you emit (primary AND alternatives) must appear verbatim in the candidate pool listing for that category. Never write a toolId that is not in the pool, even as an alternative. If a category has only one candidate, leave alternatives empty.",
    "For every category in the candidate pool that has at least one tool, you MUST emit exactly one recommendations entry whose primary.toolId is the highest-scoring candidate; never return an empty recommendations array when candidates exist.",
    "Locked categories must only appear in lockedExplanations, never in recommendations.",
    "Skipped categories must only appear in skippedExplanations, never in recommendations.",
    "Use deterministic scores supplied beside each tool; do not invent score numbers.",
    "Write ALL user-facing strings in English: projectSummary, engineExplanation, finalSummary, trustRationale, and every reasoning / pros / cons / compatibility / useCaseJustification entry, plus every lockedExplanations.note and skippedExplanations.reason. Do not switch to Turkish or any other language.",
    "Keep every narrative field concise: reasoning <= 2 short sentences, useCaseJustification <= 1 sentence, pros/cons up to 3 items each.",
    "finalSummary must be markdown with a short starting point and ordered action plan.",
  ].join("\n");

  const user = `Project input:
\`\`\`json
${JSON.stringify(state.input, null, 2)}
\`\`\`

Analyze result:
\`\`\`json
${JSON.stringify(state.analyze, null, 2)}
\`\`\`

Engine decision:
\`\`\`json
${JSON.stringify(state.engineDecision, null, 2)}
\`\`\`

Retry history:
\`\`\`json
${JSON.stringify(state.retrieval.retryHistory, null, 2)}
\`\`\`

Locked categories:
\`\`\`json
${JSON.stringify(locked, null, 2)}
\`\`\`

Skipped categories:
\`\`\`json
${JSON.stringify(skipped, null, 2)}
\`\`\`

Candidate pool by category (toolId, deterministic score, name, notes):
${candidateBlock}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}
