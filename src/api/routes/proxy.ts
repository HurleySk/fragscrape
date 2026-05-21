import { Router, Request, Response } from 'express';
import httpClient from '../../proxy/httpClient';
import logger from '../../utils/logger';
import { ApiResponse } from '../../types';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.get('/test', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('Testing proxy connection...');
  const success = await httpClient.testConnection();

  const response: ApiResponse<{ connected: boolean }> = {
    success: true,
    data: { connected: success },
    timestamp: new Date(),
  };

  return res.json(response);
}));

export default router;
