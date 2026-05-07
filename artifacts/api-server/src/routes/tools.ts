import { Router, type IRouter } from "express";
import { TOOL_CATALOG, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import type { ToolEntry } from "../types/pdd.js";

const router: IRouter = Router();

router.get("/tools/categories", (_req, res): void => {
  const counts = TOOL_CATEGORIES.map((cat) => ({
    ...cat,
    toolCount: TOOL_CATALOG.filter((t) => t.category === cat.id).length,
  }));
  res.json(counts);
});

router.get("/tools", (req, res): void => {
  const { category, platform, pricing, difficulty, teamSize, fit2d3d } = req.query;

  let result: ToolEntry[] = [...TOOL_CATALOG];
  if (typeof category === "string") result = result.filter((t) => t.category === category);
  if (typeof platform === "string") {
    result = result.filter((t) =>
      t.supportedPlatforms.includes(platform as ToolEntry["supportedPlatforms"][number]),
    );
  }
  if (typeof pricing === "string") result = result.filter((t) => t.pricing === pricing);
  if (typeof difficulty === "string") {
    result = result.filter((t) => t.difficultyLevel === difficulty);
  }
  if (typeof teamSize === "string") {
    result = result.filter((t) =>
      t.teamSizeFit.includes(teamSize as ToolEntry["teamSizeFit"][number]),
    );
  }
  if (typeof fit2d3d === "string") result = result.filter((t) => t.fit2d3d === fit2d3d);
  res.json(result);
});

router.get("/tools/:id", (req, res): void => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tool = TOOL_CATALOG.find((t) => t.id === id);
  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }
  res.json(tool);
});

export default router;
