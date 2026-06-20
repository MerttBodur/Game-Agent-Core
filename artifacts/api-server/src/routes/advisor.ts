import { Router, type IRouter } from "express";
import { AnalyzeProjectBody } from "@workspace/api-zod";
import * as advisor from "../controllers/advisorController.js";
import { rateLimit } from "../middleware/rateLimit.js";
import { validateBody } from "../middleware/validate.js";
import { inputGuard } from "../middleware/inputGuard.js";

const router: IRouter = Router();
const analyzeBodySchema = AnalyzeProjectBody as unknown as Parameters<typeof validateBody>[0];

router.post("/advisor/analyze", rateLimit, validateBody(analyzeBodySchema), inputGuard, advisor.analyze);
router.get("/advisor/sessions", advisor.listSessions);
router.get("/advisor/sessions/:id", advisor.getSession);
router.get("/advisor/stats", advisor.getStats);

export default router;
