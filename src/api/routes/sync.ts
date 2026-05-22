import { Router, Request, Response } from 'express';
import database from '../../database/database';
import { getQueryDb } from '../../database/queries';
import { getParfumoDb } from '../../database/parfumoDb';
import logger from '../../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { validate } from '../middleware/validate';
import { sendSuccess } from '../../utils/apiResponse';
import { syncScopeSchema } from '../validation/parfumoSchemas';

import { AuthBrowserClient } from '../../auth/authBrowserClient';
import { addToCollection, submitRating } from '../../auth/parfumoActions';
import { TAG_CATEGORY_MAP, SyncDiff, SyncDiffItem, SyncResult, ParfumoCategory } from '../../types/parfumo';

const router = Router();

function getAuthClient(): AuthBrowserClient {
  return new AuthBrowserClient();
}

function buildCollectionPushDiff(): SyncDiffItem[] {
  const queryDb = getQueryDb();
  const items: SyncDiffItem[] = [];

  for (const [tag, category] of Object.entries(TAG_CATEGORY_MAP)) {
    const perfumeIds = queryDb.getPerfumesByTag(tag);
    for (const id of perfumeIds) {
      const perfume = database.getPerfumeById(id);
      if (!perfume) continue;

      items.push({
        perfumeId: id,
        name: `${perfume.brand} - ${perfume.name}`,
        localTag: tag,
        parfumoCategory: null,
        action: `add to ${category}`,
      });
    }
  }

  return items;
}

function buildRatingPushDiff(): SyncDiffItem[] {
  const parfumoDb = getParfumoDb();
  const queryDb = getQueryDb();
  const items: SyncDiffItem[] = [];

  const allTags = queryDb.getTagCounts();
  const allPerfumeIds = new Set<number>();
  for (const { tag } of allTags) {
    for (const id of queryDb.getPerfumesByTag(tag)) {
      allPerfumeIds.add(id);
    }
  }

  for (const id of allPerfumeIds) {
    const data = parfumoDb.getParfumoUserData(id);
    if (!data) continue;
    if (data.parfumoScentRating || data.parfumoLongevityRating || data.parfumoSillageRating ||
        data.parfumoBottleRating || data.parfumoValueRating) {
      const perfume = database.getPerfumeById(id);
      if (!perfume) continue;

      items.push({
        perfumeId: id,
        name: `${perfume.brand} - ${perfume.name}`,
        action: 'push ratings',
      });
    }
  }

  return items;
}

router.get('/diff', asyncHandler(async (_req: Request, res: Response) => {
  const diff: SyncDiff = {
    push: {
      collections: buildCollectionPushDiff(),
      ratings: buildRatingPushDiff(),
      reviews: [],
    },
    pull: {
      collections: [],
      ratings: [],
      reviews: [],
    },
  };

  return sendSuccess(res, diff);
}));

router.post('/push', validate({ body: syncScopeSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { scope } = req.body as { scope: string };
  const queryDb = getQueryDb();
  const parfumoDb = getParfumoDb();
  const authClient = getAuthClient();

  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0, skipped: 0, errors: [] };

  if (scope === 'all' || scope === 'collections') {
    for (const [tag, category] of Object.entries(TAG_CATEGORY_MAP)) {
      const perfumeIds = queryDb.getPerfumesByTag(tag);
      for (const id of perfumeIds) {
        const perfume = database.getPerfumeById(id);
        if (!perfume) { result.skipped++; continue; }

        try {
          const { page } = await authClient.getAuthenticatedPage(perfume.url);
          try {
            await addToCollection(page, category as ParfumoCategory);
            parfumoDb.logSync({ direction: 'push', perfumeId: id, action: 'add_collection', category, status: 'success' });
            result.pushed++;
          } finally {
            await authClient.closeBrowser();
          }
        } catch (error: any) {
          parfumoDb.logSync({ direction: 'push', perfumeId: id, action: 'add_collection', category, status: 'failed', errorMessage: error.message });
          result.failed++;
          result.errors.push({ perfumeId: id, error: error.message });
        }
      }
    }
  }

  if (scope === 'all' || scope === 'ratings') {
    const diff = buildRatingPushDiff();
    for (const item of diff) {
      const perfume = database.getPerfumeById(item.perfumeId);
      if (!perfume) { result.skipped++; continue; }

      const data = parfumoDb.getParfumoUserData(item.perfumeId);
      if (!data) { result.skipped++; continue; }

      try {
        const { page } = await authClient.getAuthenticatedPage(perfume.url);
        try {
          const ratings = {
            scent: data.parfumoScentRating ?? undefined,
            longevity: data.parfumoLongevityRating ?? undefined,
            sillage: data.parfumoSillageRating ?? undefined,
            bottle: data.parfumoBottleRating ?? undefined,
            value: data.parfumoValueRating ?? undefined,
          };
          await submitRating(page, ratings);
          parfumoDb.logSync({ direction: 'push', perfumeId: item.perfumeId, action: 'rate', category: null, status: 'success' });
          result.pushed++;
        } finally {
          await authClient.closeBrowser();
        }
      } catch (error: any) {
        parfumoDb.logSync({ direction: 'push', perfumeId: item.perfumeId, action: 'rate', category: null, status: 'failed', errorMessage: error.message });
        result.failed++;
        result.errors.push({ perfumeId: item.perfumeId, error: error.message });
      }
    }
  }

  logger.info(`Sync push complete: ${result.pushed} pushed, ${result.failed} failed, ${result.skipped} skipped`);
  return sendSuccess(res, result);
}));

router.post('/pull', validate({ body: syncScopeSchema }), asyncHandler(async (req: Request, res: Response) => {
  const { scope } = req.body as { scope: string };

  const result: SyncResult = { pushed: 0, pulled: 0, failed: 0, skipped: 0, errors: [] };

  logger.info(`Sync pull started (scope: ${scope})`);

  return sendSuccess(res, {
    ...result,
    message: 'Pull requires scraping your Parfumo profile - this is a long-running operation. Collection pull will be implemented when profile page selectors are verified.',
  });
}));

export default router;
