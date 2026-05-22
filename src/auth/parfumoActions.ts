import { Page } from 'puppeteer';
import logger from '../utils/logger';
import { ParfumoUIError } from '../api/middleware/errorHandler';
import { ParfumoCategory, ParfumoRating } from '../types/parfumo';
import config from '../config/config';

const ACTION_TIMEOUT = () => config.parfumo.actionTimeoutMs;

async function clickActionTab(page: Page, linkText: string): Promise<void> {
  const timeout = ACTION_TIMEOUT();
  const found = await page.evaluate(`
    new Promise((resolve) => {
      const text = ${JSON.stringify(linkText)};
      const timeoutMs = ${timeout};
      const start = Date.now();
      const poll = () => {
        const items = document.querySelectorAll('.pd-nav div, .pd-nav a, .pd-nav span');
        for (const el of items) {
          const elText = el.textContent?.trim();
          if (elText && elText.includes(text) && el.offsetParent !== null) {
            el.click();
            resolve(true);
            return;
          }
        }
        if (Date.now() - start < timeoutMs) {
          setTimeout(poll, 200);
        } else {
          resolve(false);
        }
      };
      poll();
    })
  `);

  if (!found) {
    throw new ParfumoUIError(`Could not find action tab: ${linkText}`, '.pd-nav', page.url());
  }

  await new Promise(r => setTimeout(r, 2000));
}

export async function addToCollection(page: Page, category: ParfumoCategory): Promise<void> {
  logger.info(`Adding to Parfumo collection: ${category}`);

  await clickActionTab(page, 'Collection');

  const categoryDataType: Record<ParfumoCategory, string> = {
    i_have: '1',
    i_had: '2',
    wishlist: '3',
    tested: '5',
  };
  const dataType = categoryDataType[category];

  const clicked = await page.evaluate(`
    (() => {
      const row = document.querySelector('.wr_panel_toggle[data-type="${dataType}"]');
      if (row) { row.click(); return true; }
      return false;
    })()
  `);

  if (!clicked) {
    throw new ParfumoUIError(`Could not find collection category: ${category}`, '.wr_panel_toggle', page.url());
  }

  await new Promise(r => setTimeout(r, 1500));
  logger.info(`Successfully added to collection: ${category}`);
}

export async function removeFromCollection(page: Page, category: ParfumoCategory): Promise<void> {
  logger.info(`Removing from Parfumo collection: ${category}`);

  await clickActionTab(page, 'Collection');

  const categoryDataType: Record<ParfumoCategory, string> = {
    i_have: '1',
    i_had: '2',
    wishlist: '3',
    tested: '5',
  };
  const dataType = categoryDataType[category];

  const clicked = await page.evaluate(`
    (() => {
      const row = document.querySelector('.wr_panel_toggle[data-type="${dataType}"]');
      if (row) { row.click(); return true; }
      return false;
    })()
  `);

  if (!clicked) {
    throw new ParfumoUIError(`Could not find collection category to remove: ${category}`, '.wr_panel_toggle', page.url());
  }

  await new Promise(r => setTimeout(r, 1500));
  logger.info(`Successfully removed from collection: ${category}`);
}

export async function submitRating(page: Page, ratings: ParfumoRating): Promise<ParfumoRating> {
  logger.info('Submitting ratings to Parfumo');

  await clickActionTab(page, 'Rate');

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

    const set = await page.evaluate(`
      (() => {
        const bar = document.querySelector('.barfiller_element[data-type="${dataType}"]');
        if (!bar) return false;
        const input = bar.querySelector('input[type="range"], input[type="hidden"], input');
        if (input) {
          input.value = String(${value} * 10);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }
        bar.click();
        return true;
      })()
    `);

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
    const value = await page.evaluate(`
      (() => {
        const bar = document.querySelector('.barfiller_element[data-type="${dataType}"]');
        if (!bar) return null;
        const fill = bar.querySelector('.fill[data-percentage]');
        if (fill) {
          const pct = parseFloat(fill.getAttribute('data-percentage') || '0');
          return Math.round(pct) / 10;
        }
        const boldVal = bar.querySelector('.bold');
        if (boldVal) return parseFloat(boldVal.textContent?.trim() || '0');
        return null;
      })()
    `) as number | null;

    if (value !== null && !isNaN(value)) {
      result[key] = value;
    }
  }

  return result;
}

export async function submitReview(page: Page, text: string): Promise<void> {
  logger.info('Submitting review to Parfumo');

  const reviewTabClicked = await page.evaluate(`
    (() => {
      const tab = document.querySelector('.action_tab_reviews');
      if (tab) { tab.click(); return true; }
      return false;
    })()
  `);

  if (!reviewTabClicked) {
    throw new ParfumoUIError('Could not find Reviews tab', '.action_tab_reviews', page.url());
  }

  await new Promise(r => setTimeout(r, 2000));

  const escapedText = JSON.stringify(text);
  const submitted = await page.evaluate(`
    (() => {
      const textareas = document.querySelectorAll('textarea');
      for (const ta of textareas) {
        if (ta.offsetParent !== null) {
          ta.value = ${escapedText};
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          const form = ta.closest('form');
          if (form) {
            const submit = form.querySelector('button[type="submit"], input[type="submit"]');
            if (submit) { submit.click(); return true; }
            form.submit();
            return true;
          }
          return true;
        }
      }
      return false;
    })()
  `);

  if (!submitted) {
    throw new ParfumoUIError('Could not find review textarea', 'textarea', page.url());
  }

  await new Promise(r => setTimeout(r, 2000));
  logger.info('Review submitted');
}

export async function readReview(page: Page): Promise<string | null> {
  const reviewTabClicked = await page.evaluate(`
    (() => {
      const tab = document.querySelector('.action_tab_reviews');
      if (tab) { tab.click(); return true; }
      return false;
    })()
  `);

  if (!reviewTabClicked) return null;

  await new Promise(r => setTimeout(r, 2000));

  return await page.evaluate(`
    (() => {
      const holder = document.querySelector('#reviews_holder_reviews');
      if (!holder) return null;
      const firstReview = holder.querySelector('.review_text');
      return firstReview?.textContent?.trim() || null;
    })()
  `) as string | null;
}

export async function deleteReview(page: Page): Promise<void> {
  logger.info('Deleting review from Parfumo');

  const deleted = await page.evaluate(`
    (() => {
      const deleteBtn = document.querySelector('.review-delete, .delete-review, a[href*="delete_review"]');
      if (deleteBtn) { deleteBtn.click(); return true; }
      return false;
    })()
  `);

  if (!deleted) {
    throw new ParfumoUIError('Could not find review delete button', 'delete button', page.url());
  }

  await new Promise(r => setTimeout(r, 1500));
  logger.info('Review deleted');
}
