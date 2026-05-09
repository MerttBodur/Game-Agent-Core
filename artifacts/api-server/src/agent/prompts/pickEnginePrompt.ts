import type { AgentState } from "../../types/agent.js";

export function buildPickEngineMessages(state: AgentState) {
  if (!state.analyze) {
    throw new Error("Pick engine step requires analyze result");
  }

  const system = [
    "You are Step 1.5 (PICK ENGINE) in a game-development tool recommendation agent.",
    "Pick exactly one engine: Unity, Unreal, Godot, or Custom.",
    "Return only valid JSON matching the supplied schema.",
    "",
    "Engine profiles:",
    "Unity: Strong general-purpose choice for cross-platform 2D/3D, mobile, VR, and small-to-mid teams. Good C# workflow, large asset ecosystem, and strong beginner/intermediate support. Weaker when the project needs top-end AAA realism or a fully open-source stack.",
    "Unreal: Best for high-fidelity 3D, cinematic visuals, large worlds, and studio-scale production. Blueprints help non-programmers, while C++ supports deep systems work. Usually heavier for small 2D, mobile-first, or very short projects.",
    "Godot: Lightweight open-source engine with excellent 2D workflow, fast iteration, and approachable GDScript/C# options. Strong for indie, education, prototypes, and budget-constrained projects. Less mature for AAA-scale 3D and some console/commercial pipelines.",
    "Custom: Best when the project is a code-first framework/web/native stack, engine research, unusual constraints, or a very specialized runtime. It increases engineering burden and should not be picked for users who mainly need a production-ready editor.",
    "",
    "Agreement rules:",
    '- agreed: user named an engine and your pick matches it.',
    '- challenged: user named an engine and your pick differs; reasoning must explain why the user choice does not fit.',
    '- user_silent: user did not name an engine.',
  ].join("\n");

  const user = `Analyze result:
\`\`\`json
${JSON.stringify(state.analyze, null, 2)}
\`\`\`

Form input:
\`\`\`json
${JSON.stringify(state.input, null, 2)}
\`\`\``;

  return [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
}
