import { Router, Request, Response } from 'express';
import config from '../../config/config';
import database from '../../database/database';
import { getParfumoDb } from '../../database/parfumoDb';
import logger from '../../utils/logger';
import { asyncHandler, NotFoundError, SessionNotConfiguredError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../../utils/apiResponse';
import { reviewSchema, perfumeIdParamSchema } from '../validation/parfumoSchemas';
import { SessionManager } from '../../auth/sessionManager';
import { AuthBrowserClient } from '../../auth/authBrowserClient';
import { submitReview, readReview, deleteReview } from '../../auth/parfumoActions';

const router = Router();

function getAuthClient(): AuthBrowserClient {
  const key = config.parfumo.sessionKey;
  if (!key) throw new SessionNotConfiguredError();
  const sessionManager = new SessionManager(getParfumoDb(), key);
  return new AuthBrowserClient(sessionManager, getParfumoDb());
}

router.get('/:perfumeId', validate({ params: perfumeIdParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { perfumeId } = req.params as unknown as { perfumeId: number };
  const parfumoDb = getParfumoDb();

  const perfume = database.getPerfumeById(perfumeId);
  if (!perfume) throw new NotFoundError(`Perfume ${perfumeId}`);

  const authClient = getAuthClient();
  const { page } = await authClient.getAuthenticatedPage(perfume.url);

  try {
    const text = await readReview(page);

    if (text) {
      parfumoDb.upsertParfumoReview(perfumeId, text);
    }

    return sendSuccess(res, { perfumeId, review: text });
  } finally {
    await authClient.closeBrowser();
  }
}));

router.put('/', validate({ body: reviewSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { perfumeId, text } = req.body as { perfumeId: number; text: string };
  const parfumoDb = getParfumoDb();

  const perfume = database.getPerfumeById(perfumeId);
  if (!perfume) throw new NotFoundError(`Perfume ${perfumeId}`);

  const authClient = getAuthClient();
  const { page } = await authClient.getAuthenticatedPage(perfume.url);

  try {
    await submitReview(page, text);

    parfumoDb.upsertParfumoReview(perfumeId, text);

    parfumoDb.logSync({
      direction: 'push',
      perfumeId,
      action: 'review',
      category: null,
      status: 'success',
    });

    return sendSuccess(res, { perfumeId, review: text });
  } finally {
    await authClient.closeBrowser();
  }
}));

router.delete('/:perfumeId', validate({ params: perfumeIdParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { perfumeId } = req.params as unknown as { perfumeId: number };
  const parfumoDb = getParfumoDb();

  const perfume = database.getPerfumeById(perfumeId);
  if (!perfume) throw new NotFoundError(`Perfume ${perfumeId}`);

  const authClient = getAuthClient();
  const { page } = await authClient.getAuthenticatedPage(perfume.url);

  try {
    await deleteReview(page);

    parfumoDb.upsertParfumoReview(perfumeId, '');

    parfumoDb.logSync({
      direction: 'push',
      perfumeId,
      action: 'delete_review',
      category: null,
      status: 'success',
    });

    return sendSuccess(res, { perfumeId, action: 'deleted' });
  } finally {
    await authClient.closeBrowser();
  }
}));

export default router;
