import { Page } from 'puppeteer';
import logger from '../utils/logger';
import { ParfumoUIError } from '../api/middleware/errorHandler';
import { ParfumoCategory, ParfumoRating } from '../types/parfumo';
import { PARFUMO_SELECTORS } from '../constants/parfumoSelectors';
import config from '../config/config';

async function waitAndClick(page: Page, selector: string, description: string): Promise<void> {
  const timeout = config.parfumo.actionTimeoutMs;
  try {
    await page.waitForSelector(selector, { timeout });
    await page.click(selector);
    logger.debug(`Clicked: ${description}`);
  } catch {
    throw new ParfumoUIError(`Could not find or click: ${description}`, selector, page.url());
  }
}

async function waitForSelector(page: Page, selector: string, description: string): Promise<void> {
  const timeout = config.parfumo.actionTimeoutMs;
  try {
    await page.waitForSelector(selector, { timeout });
  } catch {
    throw new ParfumoUIError(`Element not found: ${description}`, selector, page.url());
  }
}

export async function addToCollection(page: Page, category: ParfumoCategory): Promise<void> {
  logger.info(`Adding to Parfumo collection: ${category}`);

  await waitAndClick(page, PARFUMO_SELECTORS.collection.button, 'collection button');

  await new Promise(resolve => setTimeout(resolve, 500));

  const categorySelector = PARFUMO_SELECTORS.collection.categories[category];
  await waitAndClick(page, categorySelector, `category: ${category}`);

  await new Promise(resolve => setTimeout(resolve, 1000));

  logger.info(`Successfully added to collection: ${category}`);
}

export async function removeFromCollection(page: Page, category: ParfumoCategory): Promise<void> {
  logger.info(`Removing from Parfumo collection: ${category}`);

  await waitAndClick(page, PARFUMO_SELECTORS.collection.button, 'collection button');

  await new Promise(resolve => setTimeout(resolve, 500));

  const categorySelector = PARFUMO_SELECTORS.collection.categories[category];
  const activeSelector = `${categorySelector}${PARFUMO_SELECTORS.collection.activeState}`;

  try {
    await page.waitForSelector(activeSelector, { timeout: 3000 });
    await page.click(activeSelector);
  } catch {
    await page.click(categorySelector);
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  logger.info(`Successfully removed from collection: ${category}`);
}

export async function submitRating(page: Page, ratings: ParfumoRating): Promise<ParfumoRating> {
  logger.info('Submitting ratings to Parfumo');

  await waitForSelector(page, PARFUMO_SELECTORS.rating.container, 'rating container');

  const ratingMap: Array<{ key: keyof ParfumoRating; selector: string }> = [
    { key: 'scent', selector: PARFUMO_SELECTORS.rating.scent },
    { key: 'longevity', selector: PARFUMO_SELECTORS.rating.longevity },
    { key: 'sillage', selector: PARFUMO_SELECTORS.rating.sillage },
    { key: 'bottle', selector: PARFUMO_SELECTORS.rating.bottle },
    { key: 'value', selector: PARFUMO_SELECTORS.rating.value },
  ];

  for (const { key, selector } of ratingMap) {
    const value = ratings[key];
    if (value === undefined) continue;

    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      await page.evaluate((sel, val) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) {
          el.value = String(val);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, selector, value);
      logger.debug(`Set ${key} rating to ${value}`);
    } catch {
      throw new ParfumoUIError(`Could not set ${key} rating`, selector, page.url());
    }
  }

  await new Promise(resolve => setTimeout(resolve, 2000));

  const confirmed = await readRatings(page);
  logger.info('Ratings submitted successfully');
  return confirmed;
}

export async function readRatings(page: Page): Promise<ParfumoRating> {
  const ratingMap: Array<{ key: keyof ParfumoRating; selector: string }> = [
    { key: 'scent', selector: PARFUMO_SELECTORS.rating.scent },
    { key: 'longevity', selector: PARFUMO_SELECTORS.rating.longevity },
    { key: 'sillage', selector: PARFUMO_SELECTORS.rating.sillage },
    { key: 'bottle', selector: PARFUMO_SELECTORS.rating.bottle },
    { key: 'value', selector: PARFUMO_SELECTORS.rating.value },
  ];

  const result: ParfumoRating = {};

  for (const { key, selector } of ratingMap) {
    try {
      const value = await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        return el ? parseFloat(el.value) : null;
      }, selector);

      if (value !== null && !isNaN(value)) {
        result[key] = value;
      }
    } catch {
      logger.debug(`Could not read ${key} rating`);
    }
  }

  return result;
}

export async function submitReview(page: Page, text: string): Promise<void> {
  logger.info('Submitting review to Parfumo');

  await waitForSelector(page, PARFUMO_SELECTORS.review.container, 'review container');

  const textAreaSelector = PARFUMO_SELECTORS.review.textArea;
  try {
    await page.waitForSelector(textAreaSelector, { timeout: 5000 });
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLTextAreaElement;
      if (el) el.value = '';
    }, textAreaSelector);
    await page.type(textAreaSelector, text);
  } catch {
    throw new ParfumoUIError('Could not find review text area', textAreaSelector, page.url());
  }

  try {
    const submitBtn = await page.$(PARFUMO_SELECTORS.review.submitButton);
    if (submitBtn) {
      await submitBtn.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch {
    logger.warn('No submit button found — review may auto-save');
  }

  logger.info('Review submitted successfully');
}

export async function readReview(page: Page): Promise<string | null> {
  try {
    const text = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent?.trim() || null : null;
    }, PARFUMO_SELECTORS.review.existingReviewText);
    return text;
  } catch {
    return null;
  }
}

export async function deleteReview(page: Page): Promise<void> {
  logger.info('Deleting review from Parfumo');

  const deleteBtn = await page.$(PARFUMO_SELECTORS.review.deleteButton);
  if (!deleteBtn) {
    throw new ParfumoUIError('Could not find review delete button', PARFUMO_SELECTORS.review.deleteButton, page.url());
  }

  await deleteBtn.click();
  await new Promise(resolve => setTimeout(resolve, 1000));

  logger.info('Review deleted successfully');
}
