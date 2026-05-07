import { Router, type IRouter } from "express";
import * as tools from "../controllers/toolsController.js";

const router: IRouter = Router();

router.get("/tools/categories", tools.getCategories);
router.get("/tools", tools.getTools);
router.get("/tools/:id", tools.getToolById);

export default router;
