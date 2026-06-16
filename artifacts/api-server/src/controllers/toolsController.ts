import type { Request, Response } from "express";
import {
  findTool,
  listCategoriesWithCounts,
  listTools,
  type CatalogFilters,
} from "../services/catalogService.js";

export function getCategories(_req: Request, res: Response): void {
  res.json(listCategoriesWithCounts());
}

export function getTools(req: Request, res: Response): void {
  const query = req.query as Partial<Record<keyof CatalogFilters, string>>;
  res.json(
    listTools({
      category: query.category,
      platform: query.platform,
      pricing: query.pricing,
      difficulty: query.difficulty,
      toolNature: query.toolNature,
    }),
  );
}

export function getToolById(req: Request, res: Response): void {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const tool = findTool(id);
  if (!tool) {
    res.status(404).json({ error: "Tool not found" });
    return;
  }
  res.json(tool);
}
