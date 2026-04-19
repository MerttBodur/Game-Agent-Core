import { Router, type IRouter } from "express";
import healthRouter from "./health";
import toolsRouter from "./tools.js";
import advisorRouter from "./advisor.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(toolsRouter);
router.use(advisorRouter);

export default router;
