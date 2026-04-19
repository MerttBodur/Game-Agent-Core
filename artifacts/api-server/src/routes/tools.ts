import { Router, type IRouter } from "express";
import { GAME_DEV_TOOLS, TOOL_CATEGORIES } from "../lib/gameDevTools.js";
import { db, toolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ListToolsQueryParams, GetToolParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/tools/categories", async (_req, res): Promise<void> => {
  const catCounts = TOOL_CATEGORIES.map((cat) => ({
    ...cat,
    toolCount: GAME_DEV_TOOLS.filter((t) => t.category === cat.id).length,
  }));
  res.json(catCounts);
});

router.get("/tools", async (req, res): Promise<void> => {
  const query = ListToolsQueryParams.safeParse(req.query);

  const tools = await db.select().from(toolsTable);

  let result = tools;
  if (query.success && query.data.category) {
    result = tools.filter((t) => t.category === query.data.category);
  }

  res.json(result);
});

router.get("/tools/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);

  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid tool ID" });
    return;
  }

  const [tool] = await db.select().from(toolsTable).where(eq(toolsTable.id, id));
  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }
  res.json(tool);
});

export default router;
