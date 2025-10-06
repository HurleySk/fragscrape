import { Router, Request, Response } from 'express';
import proxyManager from '../../proxy/proxyManager';
import database from '../../database/database';
import httpClient from '../../proxy/httpClient';
import logger from '../../utils/logger';
import { ApiResponse } from '../../types';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { addSubUserSchema } from '../validation/schemas';

const router = Router();

/**
 * Get proxy status and statistics
 * GET /api/proxy/status
 */
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  const stats = proxyManager.getStatistics();
  const subUsers = database.getSubUsers();

  const response: ApiResponse<any> = {
    success: true,
    data: {
      ...stats,
      subUsers: subUsers.map(su => ({
        id: su.id,
        username: su.username,
        status: su.status,
        trafficUsedMB: su.trafficUsed / (1024 * 1024),
        trafficLimitMB: su.trafficLimit / (1024 * 1024),
        createdAt: su.createdAt,
        lastChecked: su.lastChecked,
      })),
    },
    timestamp: new Date(),
  };

  return res.json(response);
}));

/**
 * Create a new sub-user
 * POST /api/proxy/create-subuser
 */
router.post('/create-subuser', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('Creating new sub-user...');
  const subUser = await proxyManager.createSubUser();

  // Save to database
  database.saveSubUser(subUser);

  const response: ApiResponse<any> = {
    success: true,
    data: {
      id: subUser.id,
      username: subUser.username,
      status: subUser.status,
      trafficLimitMB: subUser.trafficLimit / (1024 * 1024),
      createdAt: subUser.createdAt,
    },
    timestamp: new Date(),
  };

  return res.json(response);
}));

/**
 * Add an existing sub-user to the database
 * POST /api/proxy/add-subuser
 * Body: { "username": "existing_user", "password": "their_password" }
 */
router.post('/add-subuser', validate({ body: addSubUserSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { username, password } = req.body;

  logger.info(`Adding existing sub-user: ${username}`);
  const subUser = await proxyManager.addExistingSubUser(username, password);

  const response: ApiResponse<any> = {
    success: true,
    data: {
      id: subUser.id,
      username: subUser.username,
      status: subUser.status,
      trafficUsedMB: (subUser.trafficUsed / (1024 * 1024)).toFixed(2),
      trafficLimitMB: (subUser.trafficLimit / (1024 * 1024)).toFixed(2),
      usagePercent: ((subUser.trafficUsed / subUser.trafficLimit) * 100).toFixed(1),
      serviceType: subUser.serviceType,
      createdAt: subUser.createdAt,
      lastChecked: subUser.lastChecked,
    },
    timestamp: new Date(),
  };

  return res.json(response);
}));

/**
 * Test proxy connection
 * GET /api/proxy/test
 */
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

/**
 * Force rotate to a new sub-user
 * POST /api/proxy/rotate
 */
router.post('/rotate', asyncHandler(async (_req: Request, res: Response) => {
  logger.info('Rotating proxy sub-user...');

  // Reset HTTP client to force new proxy
  await httpClient.reset();

  const response: ApiResponse<{ message: string }> = {
    success: true,
    data: {
      message: 'Proxy rotation initiated. Next request will use a different sub-user if available.',
    },
    timestamp: new Date(),
  };

  return res.json(response);
}));

/**
 * Get sub-user list
 * GET /api/proxy/subusers
 */
router.get('/subusers', asyncHandler(async (_req: Request, res: Response) => {
  const subUsers = database.getSubUsers();

  const response: ApiResponse<any[]> = {
    success: true,
    data: subUsers.map(su => ({
      id: su.id,
      username: su.username,
      status: su.status,
      trafficUsedMB: (su.trafficUsed / (1024 * 1024)).toFixed(2),
      trafficLimitMB: (su.trafficLimit / (1024 * 1024)).toFixed(2),
      usagePercent: ((su.trafficUsed / su.trafficLimit) * 100).toFixed(1),
      createdAt: su.createdAt,
      lastChecked: su.lastChecked,
    })),
    timestamp: new Date(),
  };

  return res.json(response);
}));

export default router;