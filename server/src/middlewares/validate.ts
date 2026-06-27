import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema, ZodError } from 'zod';

export const validate = (schema: ZodSchema): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (parsed && typeof parsed === 'object') {
        const result = parsed as { body?: unknown; query?: unknown; params?: unknown };
        if (result.body !== undefined) req.body = result.body;
        if (result.params !== undefined) req.params = result.params as Request['params'];
        if (result.query !== undefined) req.query = result.query as Request['query'];
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          message: 'שגיאת אימות נתונים - נא לבדוק את השדות שהוזנו.',
          errors: error.issues.map((e) => ({
            field: e.path[e.path.length - 1],
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };