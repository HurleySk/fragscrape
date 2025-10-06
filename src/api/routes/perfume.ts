import { Router, Request, Response } from 'express';
import parfumoScraper from '../../scrapers/parfumoScraper';
import database from '../../database/database';
import logger from '../../utils/logger';
import { ApiResponse, SearchResult, Perfume } from '../../types';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import {
  searchQuerySchema,
  perfumeParamsSchema,
  perfumeQuerySchema,
  perfumeByUrlSchema,
  perfumeByUrlQuerySchema,
  brandParamsSchema,
  brandQuerySchema,
} from '../validation/schemas';

const router = Router();

/**
 * Search for perfumes
 * GET /api/search?q=query&limit=20&cache=true
 */
router.get('/search', validate({ query: searchQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as unknown as string;
  const limit = req.query.limit as unknown as number;
  const useCache = req.query.cache as unknown as boolean;

  // Check cache first
  if (useCache) {
    const cached = database.getCachedSearch(query);
    // Only use cache if it has valid results
    if (Array.isArray(cached) && cached.length > 0) {
      logger.info(`Returning ${cached.length} cached results for query: ${query}`);
      const response: ApiResponse<SearchResult[]> = {
        success: true,
        data: cached as SearchResult[],
        timestamp: new Date(),
      };
      return res.json(response);
    } else if (cached) {
      logger.warn(`Found empty cached results for query: ${query}, will re-scrape`);
    }
  }

  // Scrape from Parfumo
  logger.info(`Searching Parfumo for: ${query}`);
  const results = await parfumoScraper.search(query, limit);

  // Only cache results if we found valid matches
  // Don't cache empty results or scraping failures
  if (results && results.length > 0) {
    database.saveSearchCache(query, results);
    logger.info(`Cached ${results.length} search results for: ${query}`);
  } else {
    logger.warn(`No valid results to cache for query: ${query}`);
  }

  const response: ApiResponse<SearchResult[]> = {
    success: true,
    data: results,
    timestamp: new Date(),
  };

  return res.json(response);
}));

/**
 * Get perfume details by brand and name
 * GET /api/perfume/:brand/:name?year=2020&cache=true
 */
router.get('/perfume/:brand/:name', validate({ params: perfumeParamsSchema, query: perfumeQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { brand, name } = req.params;
  const year = req.query.year as unknown as number | undefined;
  const useCache = req.query.cache as unknown as boolean;

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

  const response: ApiResponse<Perfume> = {
    success: true,
    data: perfume,
    timestamp: new Date(),
  };

  return res.json(response);
}));

/**
 * Get perfume details by URL
 * POST /api/perfume/by-url?cache=true
 * Body: { "url": "https://www.parfumo.com/Perfumes/Brand/Name" }
 */
router.post('/perfume/by-url', validate({ body: perfumeByUrlSchema, query: perfumeByUrlQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { url } = req.body;
  const useCache = req.query.cache as unknown as boolean;

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

  const response: ApiResponse<Perfume> = {
    success: true,
    data: perfume,
    timestamp: new Date(),
  };

  return res.json(response);
}));

/**
 * Get perfumes by brand
 * GET /api/brand/:brand?page=1
 */
router.get('/brand/:brand', validate({ params: brandParamsSchema, query: brandQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { brand } = req.params;
  const page = req.query.page as unknown as number;

  const results = await parfumoScraper.getPerfumesByBrand(brand, page);

  const response: ApiResponse<SearchResult[]> = {
    success: true,
    data: results,
    timestamp: new Date(),
  };

  return res.json(response);
}));

export default router;