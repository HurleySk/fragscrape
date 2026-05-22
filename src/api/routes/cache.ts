import { Router, Request, Response } from 'express';
import database from '../../database/database';
import logger from '../../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../../utils/apiResponse';

const router = Router();

/**
 * Clear cache
 * DELETE /api/cache?type=all|perfumes|search|expired
 */
router.delete('/', asyncHandler(async (req: Request, res: Response) => {
  const type = (req.query.type as string) || 'all';
  const validTypes = ['all', 'perfumes', 'search', 'expired'];

  if (!validTypes.includes(type)) {
    return res.status(400).json({
      success: false,
      error: `Invalid cache type: ${type}. Must be one of: ${validTypes.join(', ')}`,
    });
  }

  logger.info(`Clearing cache: type=${type}`);
  const result = database.clearCache(type as 'all' | 'perfumes' | 'search' | 'expired');

  return sendSuccess(res, {
    message: 'Cache cleared successfully',
    type,
    ...result,
  });
}));

export default router;
