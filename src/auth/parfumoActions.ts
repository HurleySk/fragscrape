import { Page } from 'puppeteer';
import logger from '../utils/logger';
import { ParfumoUIError } from '../api/middleware/errorHandler';
import { ParfumoCategory, ParfumoRating } from '../types/parfumo';
import config from '../config/config';

const ACTION_TIMEOUT = () => config.parfumo.actionTimeoutMs;

async function findActionLink(page: Page, linkText: string): Promise<void> {
  const timeout = ACTION_TIMEOUT();
  const found = await page.evaluate((text, timeoutMs) => {
    return new Promise<boolean>((resolve) => {
      const start = Date.now();
      const check = () => {
        const navs = document.querySelectorAll('.pd-nav a, .ptabs-container.pd-nav a');
        for (const a of navs) {
          if (a.textContent?.trim().includes(text)) {
            (a as HTMLElement).click();
            resolve(true);
            return;
          }
        }
        if (Date.now() - start < timeoutMs) {
          setTimeout(check, 200);
        } else {
          resolve(false);
        }
      };
      check();
    });
  }, linkText, timeout);

  if (!found) {
    throw new ParfumoUIError(`Could not find action link: ${linkText}`, '.pd-nav a', page.url());
  }

  await new Promise(r => setTimeout(r, 2000));
}

export async function addToCollection(page: Page, category: ParfumoCategory): Promise<void> {
  logger.info(`Adding to Parfumo collection: ${category}`);

  await findActionLink(page, 'Collection');

  const categoryLabels: Record<ParfumoCategory, string> = {
    i_have: 'I have it',
    i_had: 'I had it',
    wishlist: 'I want it',
    tested: 'I tested it',
  };
  const label = categoryLabels[category];

  const clicked = await page.evaluate((catLabel) => {
    const buttons = document.querySelectorAll('a, button, div, span');
    for (const btn of buttons) {
      const text = btn.textContent?.trim();
      if (text === catLabel || text?.includes(catLabel)) {
        (btn as HTMLElement).click();
        return true;
      }
    }
    return false;
  }, label);

  if (!clicked) {
    throw new ParfumoUIError(`Could not find collection category: ${label}`, 'collection panel', page.url());
  }

  await new Promise(r => setTimeout(r, 1500));
  logger.info(`Successfully added to collection: ${category}`);
}

export async function removeFromCollection(page: Page, category: ParfumoCategory): Promise<void> {
  logger.info(`Removing from Parfumo collection: ${category}`);

  await findActionLink(page, 'Collection');

  const clicked = await page.evaluate(() => {
    const activeItems = document.querySelectorAll('.active, .selected, [aria-pressed="true"]');
    for (const item of activeItems) {
      (item as HTMLElement).click();
      return true;
    }
    const removeBtn = document.querySelector('a[href*="remove"], button[class*="remove"], .remove-collection');
    if (removeBtn) {
      (removeBtn as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!clicked) {
    throw new ParfumoUIError('Could not find active collection item to remove', 'collection panel', page.url());
  }

  await new Promise(r => setTimeout(r, 1500));
  logger.info(`Successfully removed from collection: ${category}`);
}

export async function submitRating(page: Page, ratings: ParfumoRating): Promise<ParfumoRating> {
  logger.info('Submitting ratings to Parfumo');

  await findActionLink(page, 'Rate');

  const ratingTypeMap: Record<keyof ParfumoRating, string> = {
    scent: 'scent',
    longevity: 'durability',
    sillage: 'sillage',
    bottle: 'bottle',
    value: 'pricing',
  };

  for (const [key, dataType] of Object.entries(ratingTypeMap)) {
    const value = ratings[key as keyof ParfumoRating];
    if (value === undefined) continue;

    const set = await page.evaluate((dt, val) => {
      const bar = document.querySelector(`.barfiller_element[data-type="${dt}"]`);
      if (!bar) return false;

      const input = bar.querySelector('input[type="range"], input[type="hidden"], input');
      if (input) {
        (input as HTMLInputElement).value = String(val * 10);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      (bar as HTMLElement).click();
      return true;
    }, dataType, value);

    if (!set) {
      logger.warn(`Could not find rating element for ${key} (data-type=${dataType})`);
    }
  }

  await new Promise(r => setTimeout(r, 2000));

  const confirmed = await readRatings(page);
  logger.info('Ratings submitted');
  return confirmed;
}

export async function readRatings(page: Page): Promise<ParfumoRating> {
  const result: ParfumoRating = {};

  const ratingTypeMap: Array<{ key: keyof ParfumoRating; dataType: string }> = [
    { key: 'scent', dataType: 'scent' },
    { key: 'longevity', dataType: 'durability' },
    { key: 'sillage', dataType: 'sillage' },
    { key: 'bottle', dataType: 'bottle' },
    { key: 'value', dataType: 'pricing' },
  ];

  for (const { key, dataType } of ratingTypeMap) {
    const value = await page.evaluate((dt) => {
      const bar = document.querySelector(`.barfiller_element[data-type="${dt}"]`);
      if (!bar) return null;

      const fill = bar.querySelector('.fill[data-percentage]');
      if (fill) {
        const pct = parseFloat(fill.getAttribute('data-percentage') || '0');
        return Math.round(pct) / 10;
      }

      const boldVal = bar.querySelector('.bold');
      if (boldVal) {
        return parseFloat(boldVal.textContent?.trim() || '0');
      }

      return null;
    }, dataType);

    if (value !== null && !isNaN(value)) {
      result[key] = value;
    }
  }

  return result;
}

export async function submitReview(page: Page, text: string): Promise<void> {
  logger.info('Submitting review to Parfumo');

  const reviewTabClicked = await page.evaluate(() => {
    const tab = document.querySelector('.action_tab_reviews');
    if (tab) {
      (tab as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!reviewTabClicked) {
    throw new ParfumoUIError('Could not find Reviews tab', '.action_tab_reviews', page.url());
  }

  await new Promise(r => setTimeout(r, 2000));

  const submitted = await page.evaluate((reviewText) => {
    const textareas = document.querySelectorAll('textarea');
    for (const ta of textareas) {
      if (ta.offsetParent !== null) {
        ta.value = reviewText;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.dispatchEvent(new Event('change', { bubbles: true }));

        const form = ta.closest('form');
        if (form) {
          const submit = form.querySelector('button[type="submit"], input[type="submit"]');
          if (submit) {
            (submit as HTMLElement).click();
            return true;
          }
          form.submit();
          return true;
        }
        return true;
      }
    }
    return false;
  }, text);

  if (!submitted) {
    throw new ParfumoUIError('Could not find review textarea', 'textarea', page.url());
  }

  await new Promise(r => setTimeout(r, 2000));
  logger.info('Review submitted');
}

export async function readReview(page: Page): Promise<string | null> {
  const reviewTabClicked = await page.evaluate(() => {
    const tab = document.querySelector('.action_tab_reviews');
    if (tab) {
      (tab as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!reviewTabClicked) return null;

  await new Promise(r => setTimeout(r, 2000));

  return page.evaluate(() => {
    const holder = document.querySelector('#reviews_holder_reviews');
    if (!holder) return null;
    const firstReview = holder.querySelector('.review_text');
    return firstReview?.textContent?.trim() || null;
  });
}

export async function deleteReview(page: Page): Promise<void> {
  logger.info('Deleting review from Parfumo');

  const deleted = await page.evaluate(() => {
    const deleteBtn = document.querySelector('.review-delete, .delete-review, a[href*="delete_review"]');
    if (deleteBtn) {
      (deleteBtn as HTMLElement).click();
      return true;
    }
    return false;
  });

  if (!deleted) {
    throw new ParfumoUIError('Could not find review delete button', 'delete button', page.url());
  }

  await new Promise(r => setTimeout(r, 1500));
  logger.info('Review deleted');
}
