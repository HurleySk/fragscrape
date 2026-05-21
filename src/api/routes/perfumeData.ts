import { Router, Request, Response } from 'express';
import database from '../../database/database';
import { getQueryDb } from '../../database/queries';
import logger from '../../utils/logger';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../../utils/apiResponse';
import {
  perfumeIdParamsSchema,
  addTagSchema,
  tagParamsSchema,
  userDataSchema,
  collectionQuerySchema,
} from '../validation/querySchemas';

const router = Router();

// --- Tags ---

router.post('/:id/tags', validate({ params: perfumeIdParamsSchema, body: addTagSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const { tag } = req.body as { tag: string };
  const queryDb = getQueryDb();

  const perfume = database.getPerfumeById(id);
  if (!perfume) throw new NotFoundError(`Perfume ${id} not found`);

  try {
    queryDb.addTag(id, tag);
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return res.status(409).json({ success: false, error: `Tag '${tag}' already exists on this perfume`, timestamp: new Date() });
    }
    throw error;
  }
  return sendSuccess(res, { perfumeId: id, tag }, 201);
}));

router.delete('/:id/tags/:tag', validate({ params: tagParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id, tag } = req.params as unknown as { id: number; tag: string };
  const queryDb = getQueryDb();

  queryDb.removeTag(id, tag);
  return sendSuccess(res, { message: `Tag '${tag}' removed` });
}));

router.get('/:id/tags', validate({ params: perfumeIdParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const queryDb = getQueryDb();

  const tags = queryDb.getTags(id);
  return sendSuccess(res, tags);
}));

// --- User Data ---

router.put('/:id/user-data', validate({ params: perfumeIdParamsSchema, body: userDataSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const data = req.body as { notes?: string; interest?: number };
  const queryDb = getQueryDb();

  const perfume = database.getPerfumeById(id);
  if (!perfume) throw new NotFoundError(`Perfume ${id} not found`);

  queryDb.upsertUserData(id, data);
  return sendSuccess(res, queryDb.getUserData(id));
}));

router.get('/:id/user-data', validate({ params: perfumeIdParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const queryDb = getQueryDb();

  const data = queryDb.getUserData(id);
  return sendSuccess(res, data);
}));

router.delete('/:id/user-data', validate({ params: perfumeIdParamsSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as unknown as { id: number };
  const queryDb = getQueryDb();

  queryDb.deleteUserData(id);
  return sendSuccess(res, { message: 'User data cleared' });
}));

export default router;

// --- Collection views ---

export const collectionRouter = Router();

collectionRouter.get('/', validate({ query: collectionQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { tag } = req.query as unknown as { tag: string };
  const queryDb = getQueryDb();

  const perfumeIds = queryDb.getPerfumesByTag(tag);
  const perfumes = perfumeIds.map(id => {
    const perfume = database.getPerfumeById(id);
    const tags = queryDb.getTags(id);
    const userData = queryDb.getUserData(id);
    return { perfume, tags, userData };
  }).filter(p => p.perfume !== null);

  return sendSuccess(res, perfumes);
}));

// --- Tags overview ---

export const tagsRouter = Router();

tagsRouter.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const queryDb = getQueryDb();
  const counts = queryDb.getTagCounts();
  return sendSuccess(res, counts);
}));

// --- Cleanup ---

export const cleanupRouter = Router();

cleanupRouter.delete('/', asyncHandler(async (_req: Request, res: Response) => {
  const queryDb = getQueryDb();
  const deleted = queryDb.cleanupPassedPerfumes();
  logger.info(`Cleanup: deleted ${deleted} perfumes tagged 'pass'`);
  return sendSuccess(res, { deleted });
}));
