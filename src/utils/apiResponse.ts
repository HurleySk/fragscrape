import { Response } from 'express';
import { ApiResponse } from '../types';

/**
 * Send a successful API response
 */
export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): Response {
  const response: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date(),
  };
  return res.status(statusCode).json(response);
}

/**
 * Send an error API response
 */
export function sendError(res: Response, error: string, statusCode: number = 500): Response {
  const response: ApiResponse<null> = {
    success: false,
    error,
    timestamp: new Date(),
  };
  return res.status(statusCode).json(response);
}
