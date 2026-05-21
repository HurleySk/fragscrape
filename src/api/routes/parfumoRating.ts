import { Router, Request, Response } from 'express';
import config from '../../config/config';
import database from '../../database/database';
import { getParfumoDb } from '../../database/parfumoDb';
import { asyncHandler, NotFoundError, SessionNotConfiguredError } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../../utils/apiResponse';
import { ratingSchema, perfumeIdParamSchema } from '../validation/parfumoSchemas';
import { SessionManager } from '../../auth/sessionManager';
import { AuthBrowserClient } from '../../auth/authBrowserClient';
import { submitRating, readRatings } from '../../auth/parfumoActions';
import { ParfumoRating } from '../../types/parfumo';

const router = Router();

function getAuthClient(): AuthBrowserClient {
  const key = config.parfumo.sessionKey;
  if (!key) throw new SessionNotConfiguredError();
  const sessionManager = new SessionManager(getParfumoDb(), key);
  return new AuthBrowserClient(sessionManager);
}

router.put('/', validate({ body: ratingSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { perfumeId, ...ratings } = req.body as { perfumeId: number } & ParfumoRating;
  const parfumoDb = getParfumoDb();

  const perfume = database.getPerfumeById(perfumeId);
  if (!perfume) throw new NotFoundError(`Perfume ${perfumeId}`);

  const authClient = getAuthClient();
  const { page } = await authClient.getAuthenticatedPage(perfume.url);

  try {
    const confirmed = await submitRating(page, ratings);

    parfumoDb.upsertParfumoRatings(perfumeId, confirmed);

    parfumoDb.logSync({
      direction: 'push',
      perfumeId,
      action: 'rate',
      category: null,
      status: 'success',
    });

    return sendSuccess(res, { perfumeId, ratings: confirmed });
  } finally {
    await authClient.closeBrowser();
  }
}));

router.get('/:perfumeId', validate({ params: perfumeIdParamSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { perfumeId } = req.params as unknown as { perfumeId: number };
  const parfumoDb = getParfumoDb();

  const perfume = database.getPerfumeById(perfumeId);
  if (!perfume) throw new NotFoundError(`Perfume ${perfumeId}`);

  const authClient = getAuthClient();
  const { page } = await authClient.getAuthenticatedPage(perfume.url);

  try {
    const ratings = await readRatings(page);

    parfumoDb.upsertParfumoRatings(perfumeId, ratings);

    return sendSuccess(res, { perfumeId, ratings });
  } finally {
    await authClient.closeBrowser();
  }
}));

export default router;
