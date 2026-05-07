import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodSchema } from "zod/v4";

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    req.body = parsed.data;
    next();
  };
}
