import { Router, Request, Response } from 'express';
import parfumoScraper from '../../scrapers/parfumoScraper';
import database from '../../database/database';
import { getQueryDb } from '../../database/queries';
import logger from '../../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../../utils/apiResponse';
import {
  createQuerySchema,
  updateQuerySchema,
  queryIdParamsSchema,
  queryItemParamsSchema,
  updateQueryItemSchema,
} from '../validation/querySchemas';

const router = Router();

router.post('/', validate({ body: createQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { query, name } = req.body as { query: string; name?: string };
  const queryDb = getQueryDb();

  logger.info(`Saving query: ${query}`);
  const results = await parfumoScraper.search(query, 20);

  if (!results || results.length === 0) {
    throw new ValidationError('Search returned no results - cannot save an empty query');
  }

  const perfumeIds: number[] = [];
  for (const result of results) {
    database.savePerfume({
      brand: result.brand,
      name: result.name,
      year: result.year,
      url: result.url,
      imageUrl: result.imageUrl,
      rating: result.rating,
      scrapedAt: new Date(),
    });
    const perfume = database.getPerfumeByUrl(result.url) ?? database.getPerfume(result.brand, result.name, result.year);
    if (perfume?.id) {
      perfumeIds.push(parseInt(perfume.id, 10));
    }
  }

  if (perfumeIds.length === 0) {
    throw new ValidationError('Failed to persist search results');
  }

  const saved = queryDb.createSavedQuery(query, name ?? null, perfumeIds);
  return sendSuccess(res, saved, 201);
}));

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const queryDb = getQueryDb();
  const queries = queryDb.listSavedQueries();
  return sendSuccess(res, queries);
}));

router.get('/:id', validate({ params: queryIdParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const queryDb = getQueryDb();

  const saved = queryDb.getSavedQuery(id);
  if (!saved) throw new NotFoundError(`Saved query ${id} not found`);

  const items = queryDb.getQueryItems(id);
  const itemsWithData = items.map(item => {
    const perfume = database.getPerfumeById(item.perfumeId);
    const tags = queryDb.getTags(item.perfumeId);
    const userData = queryDb.getUserData(item.perfumeId);
    return { ...item, perfume, tags, userData };
  });

  return sendSuccess(res, { ...saved, items: itemsWithData });
}));

router.patch('/:id', validate({ params: queryIdParamsSchema, body: updateQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const { name } = req.body as { name: string };
  const queryDb = getQueryDb();

  const saved = queryDb.getSavedQuery(id);
  if (!saved) throw new NotFoundError(`Saved query ${id} not found`);

  queryDb.updateSavedQuery(id, { name });
  return sendSuccess(res, queryDb.getSavedQuery(id));
}));

router.delete('/:id', validate({ params: queryIdParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const queryDb = getQueryDb();

  const saved = queryDb.getSavedQuery(id);
  if (!saved) throw new NotFoundError(`Saved query ${id} not found`);

  queryDb.deleteSavedQuery(id);
  return sendSuccess(res, { message: 'Query deleted' });
}));

router.post('/:id/refresh', validate({ params: queryIdParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const queryDb = getQueryDb();

  const saved = queryDb.getSavedQuery(id);
  if (!saved) throw new NotFoundError(`Saved query ${id} not found`);

  logger.info(`Refreshing query ${id}: ${saved.query}`);
  const results = await parfumoScraper.search(saved.query, 20);

  const perfumeIds: number[] = [];
  for (const result of results) {
    database.savePerfume({
      brand: result.brand,
      name: result.name,
      year: result.year,
      url: result.url,
      imageUrl: result.imageUrl,
      rating: result.rating,
      scrapedAt: new Date(),
    });
    const perfume = database.getPerfumeByUrl(result.url) ?? database.getPerfume(result.brand, result.name, result.year);
    if (perfume?.id) {
      perfumeIds.push(parseInt(perfume.id, 10));
    }
  }

  if (perfumeIds.length === 0) {
    throw new ValidationError('Refresh returned no results - items unchanged');
  }

  queryDb.refreshQueryItems(id, perfumeIds);
  return sendSuccess(res, queryDb.getSavedQuery(id));
}));

router.patch('/:id/items/:itemId', validate({ params: queryItemParamsSchema, body: updateQueryItemSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id, itemId } = req.params as unknown as { id: number; itemId: number };
  const { reviewed, skipped } = req.body as { reviewed?: boolean; skipped?: boolean };
  const queryDb = getQueryDb();

  const saved = queryDb.getSavedQuery(id);
  if (!saved) throw new NotFoundError(`Saved query ${id} not found`);

  const items = queryDb.getQueryItems(id);
  const item = items.find(i => i.id === itemId);
  if (!item) throw new NotFoundError(`Item ${itemId} not found in query ${id}`);

  queryDb.updateQueryItem(id, item.perfumeId, { reviewed, skipped });
  return sendSuccess(res, { ...item, reviewed: reviewed ?? item.reviewed, skipped: skipped ?? item.skipped });
}));

router.get('/:id/next', validate({ params: queryIdParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const queryDb = getQueryDb();

  const saved = queryDb.getSavedQuery(id);
  if (!saved) throw new NotFoundError(`Saved query ${id} not found`);

  const next = queryDb.getNextItem(id);
  if (!next) {
    return res.status(204).send();
  }

  const perfume = database.getPerfumeById(next.perfumeId);
  const tags = queryDb.getTags(next.perfumeId);
  const userData = queryDb.getUserData(next.perfumeId);

  return sendSuccess(res, { ...next, perfume, tags, userData });
}));

export default router;
