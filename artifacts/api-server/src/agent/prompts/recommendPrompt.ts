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
    "Only use toolId values from the candidate pool. Do not invent tools.",
    "Locked categories must only appear in lockedExplanations, never in recommendations.",
    "Skipped categories must only appear in skippedExplanations, never in recommendations.",
    "Use deterministic scores supplied beside each tool; do not invent score numbers.",
    "Write projectSummary and finalSummary in Turkish.",
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
