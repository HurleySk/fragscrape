import { Router, Request, Response } from 'express';
import parfumoScraper from '../../scrapers/parfumoScraper';
import database from '../../database/database';
import logger from '../../utils/logger';
import { SearchResult } from '../../types';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../../utils/apiResponse';
import {
  searchQuerySchema,
  perfumeParamsSchema,
  perfumeQuerySchema,
  perfumeByUrlSchema,
  perfumeByUrlQuerySchema,
  brandParamsSchema,
  brandQuerySchema,
  clearCacheQuerySchema,
} from '../validation/schemas';

const router = Router();

/**
 * Search for perfumes
 * GET /api/search?q=query&limit=20&cache=true
 */
router.get('/search', validate({ query: searchQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { q: query, limit, cache: useCache } = req.query as unknown as { q: string; limit: number; cache: boolean };

  // Check cache first
  if (useCache) {
    const cached = database.getCachedSearch(query);
    // Only use cache if it has valid results
    if (Array.isArray(cached) && cached.length > 0) {
      logger.info(`Returning ${cached.length} cached results for query: ${query}`);
      return sendSuccess(res, cached as SearchResult[]);
    } else if (cached) {
      logger.warn(`Found empty cached results for query: ${query}, will re-scrape`);
    }
  }

  // Scrape from Parfumo
  logger.info(`Searching Parfumo for: ${query}`);
  const results = await parfumoScraper.search(query, limit);

  // Only cache results if we found valid matches
  if (results && results.length > 0) {
    database.saveSearchCache(query, results);
    logger.info(`Cached ${results.length} search results for: ${query}`);
  } else {
    logger.warn(`No valid results to cache for query: ${query}`);
  }

  return sendSuccess(res, results);
}));

/**
 * Get perfume details by brand and name
 * GET /api/perfume/:brand/:name?year=2020&cache=true
 */
router.get('/perfume/:brand/:name', validate({ params: perfumeParamsSchema, query: perfumeQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { brand, name } = req.params;
  const { year, cache: useCache } = req.query as unknown as { year?: number; cache: boolean };

  // Normalize brand/name for cache lookup (URL has underscores, DB has spaces)
  const brandNormalized = brand.replace(/_/g, ' ');
  const nameNormalized = name.replace(/_/g, ' ');

  // Check cache first if enabled
  let perfume = useCache ? database.getPerfume(brandNormalized, nameNormalized, year) : null;

  if (!perfume) {
    // Build URL with proper Parfumo format (replace spaces with underscores)
    const brandSlug = brand.replace(/\s+/g, '_');
    const nameSlug = name.replace(/\s+/g, '_');
    const url = `/Perfumes/${encodeURIComponent(brandSlug)}/${encodeURIComponent(nameSlug)}`;

    logger.info(`Fetching perfume: ${brandNormalized} - ${nameNormalized}`);
    perfume = await parfumoScraper.getPerfumeDetails(url);

    // Save to cache
    database.savePerfume(perfume);
  } else {
    logger.info(`Returning cached perfume: ${brandNormalized} - ${nameNormalized}`);
  }

  return sendSuccess(res, perfume);
}));

/**
 * Get perfume details by URL
 * POST /api/perfume/by-url?cache=true
 * Body: { "url": "https://www.parfumo.com/Perfumes/Brand/Name" }
 */
router.post('/perfume/by-url', validate({ body: perfumeByUrlSchema, query: perfumeByUrlQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { url } = req.body;
  const { cache: useCache } = req.query as unknown as { cache: boolean };

  // Check cache first if enabled
  let perfume = useCache ? database.getPerfumeByUrl(url) : null;

  if (!perfume) {
    // Scrape the URL
    logger.info(`Fetching perfume from URL: ${url}`);
    perfume = await parfumoScraper.getPerfumeDetails(url);

    // Save to cache
    database.savePerfume(perfume);
  } else {
    logger.info(`Returning cached perfume from URL: ${url}`);
  }

  return sendSuccess(res, perfume);
}));

/**
 * Get perfumes by brand
 * GET /api/brand/:brand?page=1
 */
router.get('/brand/:brand', validate({ params: brandParamsSchema, query: brandQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { brand } = req.params;
  const { page } = req.query as unknown as { page: number };

  const results = await parfumoScraper.getPerfumesByBrand(brand, page);

  return sendSuccess(res, results);
}));

/**
 * Clear cache manually
 * DELETE /api/cache?type=all|perfumes|search|expired
 */
router.delete('/cache', validate({ query: clearCacheQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.query as unknown as { type: 'all' | 'perfumes' | 'search' | 'expired' };

  logger.info(`Clearing cache: type=${type}`);
  const result = database.clearCache(type);

  return sendSuccess(res, {
    message: `Cache cleared successfully`,
    type,
    perfumesCleared: result.perfumesCleared,
    searchesCleared: result.searchesCleared,
    totalCleared: result.perfumesCleared + result.searchesCleared,
  });
}));

export default router;