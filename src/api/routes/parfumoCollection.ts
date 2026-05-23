import { Router, Request, Response } from 'express';
import database from '../../database/database';
import { getQueryDb } from '../../database/queries';
import { getParfumoDb } from '../../database/parfumoDb';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../../utils/apiResponse';
import { collectionActionSchema } from '../validation/parfumoSchemas';
import { getAuthClient } from '../../auth/getAuthClient';
import { addToCollection, removeFromCollection } from '../../auth/parfumoActions';
import { CATEGORY_TAG_MAP, ParfumoCategory } from '../../types/parfumo';

const router = Router();

router.post('/', validate({ body: collectionActionSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { perfumeId, category } = req.body as { perfumeId: number; category: ParfumoCategory };
  const parfumoDb = getParfumoDb();
  const queryDb = getQueryDb();

  const perfume = database.getPerfumeOrThrow(perfumeId);

  const authClient = getAuthClient();
  const { page } = await authClient.getAuthenticatedPage(perfume.url);

  try {
    await addToCollection(page, category);

    const tag = CATEGORY_TAG_MAP[category];
    try { queryDb.addTag(perfumeId, tag); } catch { /* tag may already exist */ }

    parfumoDb.logSync({
      direction: 'push',
      perfumeId,
      action: 'add_collection',
      category,
      status: 'success',
    });

    return sendSuccess(res, { perfumeId, category, tag, action: 'added' });
  } finally {
    await authClient.closeBrowser();
  }
}));

router.delete('/', validate({ body: collectionActionSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { perfumeId, category } = req.body as { perfumeId: number; category: ParfumoCategory };
  const parfumoDb = getParfumoDb();
  const queryDb = getQueryDb();

  const perfume = database.getPerfumeOrThrow(perfumeId);

  const authClient = getAuthClient();
  const { page } = await authClient.getAuthenticatedPage(perfume.url);

  try {
    await removeFromCollection(page, category);

    const tag = CATEGORY_TAG_MAP[category];
    queryDb.removeTag(perfumeId, tag);

    parfumoDb.logSync({
      direction: 'push',
      perfumeId,
      action: 'remove_collection',
      category,
      status: 'success',
    });

    return sendSuccess(res, { perfumeId, category, tag, action: 'removed' });
  } finally {
    await authClient.closeBrowser();
  }
}));

router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  return sendSuccess(res, {
    message: 'Collection pull available via POST /api/sync/pull?scope=collections. Use POST/DELETE to add/remove from collections.',
  });
}));

export default router;
