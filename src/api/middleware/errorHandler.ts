import { Request, Response, NextFunction } from 'express';
import logger from '../../utils/logger';
import { ApiResponse } from '../../types';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, public originalError?: Error) {
    super(500, `Database error: ${message}`);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ProxyError extends AppError {
  constructor(message: string, public originalError?: Error) {
    super(503, `Proxy error: ${message}`);
    this.name = 'ProxyError';
    Object.setPrototypeOf(this, ProxyError.prototype);
  }
}

export class ScraperError extends AppError {
  constructor(message: string, public url?: string, public originalError?: Error) {
    super(500, `Scraping error: ${message}`);
    this.name = 'ScraperError';
    Object.setPrototypeOf(this, ScraperError.prototype);
  }
}

export class ErrorPageError extends AppError {
  constructor(message: string, public url?: string) {
    super(502, `Error page detected: ${message}`);
    this.name = 'ErrorPageError';
    Object.setPrototypeOf(this, ErrorPageError.prototype);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded') {
    super(429, message);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

export class ParfumoUIError extends AppError {
  constructor(message: string, public selector?: string, public pageUrl?: string) {
    super(502, `Parfumo UI error: ${message}`);
    this.name = 'ParfumoUIError';
    Object.setPrototypeOf(this, ParfumoUIError.prototype);
  }
}

export class SessionExpiredError extends AppError {
  constructor() {
    super(401, 'Parfumo session expired - call POST /api/auth/login to re-authenticate');
    this.name = 'SessionExpiredError';
    Object.setPrototypeOf(this, SessionExpiredError.prototype);
  }
}

export const errorHandler = (
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;

    if (!err.isOperational) {
      logger.error('Unexpected error:', err);
    }
  } else {
    logger.error('Unhandled error:', err);
  }

  const response: ApiResponse<null> = {
    success: false,
    error: message,
    timestamp: new Date(),
  };

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req: Request, res: Response) => {
  const response: ApiResponse<null> = {
    success: false,
    error: `Route ${req.originalUrl} not found`,
    timestamp: new Date(),
  };

  res.status(404).json(response);
};

export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};