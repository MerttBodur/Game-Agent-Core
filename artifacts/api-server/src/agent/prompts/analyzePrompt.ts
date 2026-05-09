import { TOOL_TREE } from "../../lib/rag/treeNavigator.js";
import type { AdvisorFormInput } from "../../types/agent.js";
import type { ToolTree } from "../../types/tree.js";

export function buildAnalyzeMessages(input: AdvisorFormInput, tree: ToolTree = TOOL_TREE) {
  const availableCategoryIds = tree.nodes.map((category) => category.category);
  const treeBlock = tree.nodes
    .map((category) => {
      const leaves = category.nodes
        .map((leaf) => `    - ${leaf.node_id.replace(/^tool\./, "")}: ${leaf.title} - ${leaf.summary}`)
        .join("\n");
      return `[${category.category}] ${category.title}\n${leaves}`;
    })
    .join("\n\n");

  const system = [
    "You are Step 1 (ANALYZE) in a game-development tool recommendation agent.",
    "Read the user's form inputs and project idea, then select the toolTree category ids that should be retrieved later.",
    "Return only valid JSON matching the supplied schema.",
    "Rules:",
    "- multiplayer=true => include networking and backend categories when those leaves exist in the tree.",
    "- Never include programming_language or ui_framework; those are handled by deterministic constraints.",
    `- Available category ids: ${availableCategoryIds.join(", ")}.`,
    "- targetCategories must contain category ids from the bracket labels only, for example game_engine or version_control.",
    "- Do not emit tool ids such as unity, godot, fmod_studio, or git_github.",
    "- Do not emit networking or backend unless those exact ids are listed in Available category ids.",
    "- userMentionedEngine is non-null only when the user explicitly names Unity, Unreal, Godot, Custom, or an unknown engine in free text.",
    "- projectSummary must be 1-2 Turkish sentences.",
  ].join("\n");

  const user = `Project input:
\`\`\`json
${JSON.stringify(input, null, 2)}
\`\`\`

Tool tree:
${treeBlock}`;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}
