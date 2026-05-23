import { Router, Request, Response } from 'express';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/errorHandler';
import { rankingsQuerySchema } from '../validation/schemas';
import { rankingScraper, RankingFilters } from '../../scrapers/rankingScraper';
import { sendSuccess } from '../../utils/apiResponse';

const router = Router();

/**
 * Get top-ranked fragrances by category
 * GET /api/rankings?category=mens&page=1&limit=20&production=in-production&edition=regular
 */
router.get('/rankings', validate({ query: rankingsQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { category, page, limit, production, edition } = req.query as unknown as {
    category: string;
    page: number;
    limit: number;
    production: string;
    edition: string;
  };

  const filters: RankingFilters = {};
  if (production && production !== 'all') filters.production = production as RankingFilters['production'];
  if (edition && edition !== 'all') filters.edition = edition as RankingFilters['edition'];

  const result = await rankingScraper.scrapeRankingPage(category, page, limit, filters);
  return sendSuccess(res, result);
}));

export default router;
