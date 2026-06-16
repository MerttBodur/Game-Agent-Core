import "dotenv/config";
import { retrieveEngineDocs, retrieveForCategory } from "../lib/rag/retriever.js";

interface EvalCase {
  name: string;
  run: () => Promise<string[]>;
  expectIncludes: string;
}

const cases: EvalCase[] = [
  {
    name: "weak art + low budget surfaces Meshy in art_asset",
    run: async () =>
      (
        await retrieveForCategory(
          "weak art skills, low budget, wants good-looking 3D models",
          "art_asset",
          "Unity",
        )
      ).toolIds,
    expectIncludes: "meshy",
  },
  {
    name: "engine query surfaces Godot for a lightweight 2D game",
    run: async () =>
      (await retrieveEngineDocs("lightweight open-source 2D pixel game, beginner solo dev"))
        .toolIds,
    expectIncludes: "godot",
  },
];

async function main(): Promise<void> {
  let failed = 0;

  for (const c of cases) {
    const ids = await c.run();
    const ok = ids.includes(c.expectIncludes);
    if (!ok) failed += 1;

    console.log(
      `${ok ? "PASS" : "FAIL"} ${c.name} -> [${ids.join(", ")}] (expected ${c.expectIncludes})`,
    );
  }

  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
