import { Router, Request, Response } from 'express';
import parfumoScraper from '../../scrapers/parfumoScraper';
import database from '../../database/database';
import logger from '../../utils/logger';
import { ApiResponse, SearchResult, Perfume } from '../../types';

const router = Router();

/**
 * Search for perfumes
 * GET /api/search?q=query&limit=20&cache=true
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const useCache = req.query.cache !== 'false';

    if (!query) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'Search query is required',
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Check cache first
    if (useCache) {
      const cached = await database.getCachedSearch(query);
      if (cached) {
        logger.info(`Returning cached results for query: ${query}`);
        const response: ApiResponse<SearchResult[]> = {
          success: true,
          data: cached,
          timestamp: new Date(),
        };
        return res.json(response);
      }
    }

    // Scrape from Parfumo
    logger.info(`Searching Parfumo for: ${query}`);
    const results = await parfumoScraper.search(query, limit);

    // Cache the results
    await database.saveSearchCache(query, results);

    const response: ApiResponse<SearchResult[]> = {
      success: true,
      data: results,
      timestamp: new Date(),
    };

    return res.json(response);
  } catch (error: any) {
    logger.error('Search endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'An error occurred during search',
      timestamp: new Date(),
    };

    return res.status(500).json(response);
  }
});

/**
 * Get perfume details by brand and name
 * GET /api/perfume/:brand/:name?year=2020&cache=true
 */
router.get('/perfume/:brand/:name', async (req: Request, res: Response) => {
  try {
    const { brand, name } = req.params;
    const year = req.query.year ? parseInt(req.query.year as string) : undefined;
    const useCache = req.query.cache !== 'false';

    // Check cache first if enabled
    let perfume = useCache ? await database.getPerfume(brand, name, year) : null;

    if (!perfume) {
      // Build URL with proper Parfumo format (replace spaces with underscores)
      const brandSlug = brand.replace(/\s+/g, '_');
      const nameSlug = name.replace(/\s+/g, '_');
      const url = `/Perfumes/${encodeURIComponent(brandSlug)}/${encodeURIComponent(nameSlug)}`;

      logger.info(`Fetching perfume: ${brand} - ${name}`);
      perfume = await parfumoScraper.getPerfumeDetails(url);

      // Save to cache
      await database.savePerfume(perfume);
    } else {
      logger.info(`Returning cached perfume: ${brand} - ${name}`);
    }

    const response: ApiResponse<Perfume> = {
      success: true,
      data: perfume,
      timestamp: new Date(),
    };

    return res.json(response);
  } catch (error: any) {
    logger.error('Perfume details endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'An error occurred while fetching perfume details',
      timestamp: new Date(),
    };

    return res.status(500).json(response);
  }
});

/**
 * Get perfume details by URL
 * POST /api/perfume/by-url?cache=true
 * Body: { "url": "https://www.parfumo.com/Perfumes/Brand/Name" }
 */
router.post('/perfume/by-url', async (req: Request, res: Response) => {
  try {
    const { url } = req.body;
    const useCache = req.query.cache !== 'false';

    if (!url) {
      const response: ApiResponse<null> = {
        success: false,
        error: 'URL is required',
        timestamp: new Date(),
      };
      return res.status(400).json(response);
    }

    // Check cache first if enabled
    let perfume = useCache ? await database.getPerfumeByUrl(url) : null;

    if (!perfume) {
      // Scrape the URL
      logger.info(`Fetching perfume from URL: ${url}`);
      perfume = await parfumoScraper.getPerfumeDetails(url);

      // Save to cache
      await database.savePerfume(perfume);
    } else {
      logger.info(`Returning cached perfume from URL: ${url}`);
    }

    const response: ApiResponse<Perfume> = {
      success: true,
      data: perfume,
      timestamp: new Date(),
    };

    return res.json(response);
  } catch (error: any) {
    logger.error('Perfume by URL endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'An error occurred while fetching perfume details',
      timestamp: new Date(),
    };

    return res.status(500).json(response);
  }
});

/**
 * Get perfumes by brand
 * GET /api/brand/:brand?page=1
 */
router.get('/brand/:brand', async (req: Request, res: Response) => {
  try {
    const { brand } = req.params;
    const page = parseInt(req.query.page as string) || 1;

    const results = await parfumoScraper.getPerfumesByBrand(brand, page);

    const response: ApiResponse<SearchResult[]> = {
      success: true,
      data: results,
      timestamp: new Date(),
    };

    return res.json(response);
  } catch (error: any) {
    logger.error('Brand perfumes endpoint error:', error);

    const response: ApiResponse<null> = {
      success: false,
      error: error.message || 'An error occurred while fetching brand perfumes',
      timestamp: new Date(),
    };

    return res.status(500).json(response);
  }
});

export default router;