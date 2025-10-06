import { Router, Request, Response } from 'express';
import proxyManager from '../../proxy/proxyManager';
import database from '../../database/database';
import httpClient from '../../proxy/httpClient';
import logger from '../../utils/logger';
import { ApiResponse } from '../../types';

const router = Router();

/**
 * Get proxy status and statistics
 * GET /api/proxy/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const stats = proxyManager.getStatistics();
    const subUsers = await database.getSubUsers();

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

    res.json(response);
  } catch (error: any) {
    logger.error('Proxy status endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'Failed to get proxy status',
      timestamp: new Date(),
    };

    res.status(500).json(response);
  }
});

/**
 * Create a new sub-user
 * POST /api/proxy/create-subuser
 */
router.post('/create-subuser', async (_req: Request, res: Response) => {
  try {
    logger.info('Creating new sub-user...');
    const subUser = await proxyManager.createSubUser();

    // Save to database
    await database.saveSubUser(subUser);

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

    res.json(response);
  } catch (error: any) {
    logger.error('Create sub-user endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'Failed to create sub-user',
      timestamp: new Date(),
    };

    res.status(500).json(response);
  }
});

/**
 * Test proxy connection
 * GET /api/proxy/test
 */
router.get('/test', async (_req: Request, res: Response) => {
  try {
    logger.info('Testing proxy connection...');
    const success = await httpClient.testConnection();

    const response: ApiResponse<{ connected: boolean }> = {
      success: true,
      data: { connected: success },
      timestamp: new Date(),
    };

    res.json(response);
  } catch (error: any) {
    logger.error('Proxy test endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'Failed to test proxy',
      timestamp: new Date(),
    };

    res.status(500).json(response);
  }
});

/**
 * Force rotate to a new sub-user
 * POST /api/proxy/rotate
 */
router.post('/rotate', async (_req: Request, res: Response) => {
  try {
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

    res.json(response);
  } catch (error: any) {
    logger.error('Proxy rotate endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'Failed to rotate proxy',
      timestamp: new Date(),
    };

    res.status(500).json(response);
  }
});

/**
 * Get sub-user list
 * GET /api/proxy/subusers
 */
router.get('/subusers', async (_req: Request, res: Response) => {
  try {
    const subUsers = await database.getSubUsers();

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

    res.json(response);
  } catch (error: any) {
    logger.error('Get sub-users endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'Failed to get sub-users',
      timestamp: new Date(),
    };

    res.status(500).json(response);
  }
});

export default router;