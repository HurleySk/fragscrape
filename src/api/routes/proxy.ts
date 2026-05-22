import { Router, Request, Response } from 'express';
import httpClient from '../../proxy/httpClient';
import { isProxyConfigured } from '../../proxy/proxyConfig';
import logger from '../../utils/logger';
import { ApiResponse } from '../../types';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.get('/test', asyncHandler(async (_req: Request, res: Response) => {
  const proxyEnabled = isProxyConfigured();
  logger.info(`Testing proxy connection... (proxy configured: ${proxyEnabled})`);
  const success = await httpClient.testConnection();

  const response: ApiResponse<{ connected: boolean; proxyEnabled: boolean }> = {
    success: true,
    data: { connected: success, proxyEnabled },
    timestamp: new Date(),
  };

  return res.json(response);
}));

export default router;
