import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError } from './errorHandler';

/**
 * Middleware to validate request data against a Zod schema
 */
export function validate(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      // Validate body if schema provided
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      // Validate query if schema provided
      if (schema.query) {
        req.query = schema.query.parse(req.query) as any;
      }

      // Validate params if schema provided
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
        return next(new ValidationError(messages.join(', ')));
      }
      if (error instanceof Error) {
        return next(new ValidationError(error.message));
      }
      next(error);
    }
  };
}
