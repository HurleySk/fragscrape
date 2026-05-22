import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { rankingsQuerySchema } from '../validation/schemas';
import { rankingScraper } from '../../scrapers/rankingScraper';
import { sendSuccess } from '../../utils/apiResponse';

const router = Router();

/**
 * Get top-ranked fragrances by category
 * GET /api/rankings?category=mens&page=1&limit=50
 */
router.get('/rankings', validate({ query: rankingsQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { category, page, limit } = req.query as unknown as { category: string; page: number; limit: number };

  const result = await rankingScraper.scrapeRankingPage(category, page, limit);
  return sendSuccess(res, result);
}));

export default router;
