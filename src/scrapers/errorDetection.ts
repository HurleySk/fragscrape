import * as cheerio from 'cheerio';
import logger from '../utils/logger';
import { ErrorPageError } from '../api/middleware/errorHandler';

const ERROR_TITLE_PATTERNS = [
  /this page isn['‘’'`]?t working/i,
  /page not found/i,
  /error \d{3}/i,
  /http error/i,
  /access denied/i,
  /service unavailable/i,
];

const ERROR_BODY_PATTERNS = [
  /HTTP\s*ERROR\s*\d{3}/i,
  /ERR_CONNECTION/i,
  /ERR_TIMED_OUT/i,
];

export function detectErrorPage($: cheerio.CheerioAPI, url: string): void {
  const title = $('title').first().text().trim();
  for (const pattern of ERROR_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      logger.warn(`Error page detected via title: "${title}" at ${url}`);
      throw new ErrorPageError(title, url);
    }
  }

  const h1Text = $('h1').first().text().trim();
  for (const pattern of ERROR_TITLE_PATTERNS) {
    if (pattern.test(h1Text)) {
      logger.warn(`Error page detected via h1: "${h1Text}" at ${url}`);
      throw new ErrorPageError(h1Text, url);
    }
  }

  const bodyText = $('body').text();
  for (const pattern of ERROR_BODY_PATTERNS) {
    if (pattern.test(bodyText)) {
      const match = bodyText.match(pattern);
      logger.warn(`Error page detected via body pattern: "${match?.[0]}" at ${url}`);
      throw new ErrorPageError(match?.[0] || 'HTTP error pattern', url);
    }
  }

  const hasProduct = $('[itemtype="https://schema.org/Product"]').length > 0;
  const hasRating = $('[itemtype="https://schema.org/AggregateRating"]').length > 0;
  const hasNotes = $('.notes_list').length > 0;
  const hasAccords = $('.s-circle-container').length > 0;

  if (!hasProduct && !hasRating && !hasNotes && !hasAccords) {
    logger.warn(`No Parfumo content markers found at ${url} — likely an error or empty page`);
    throw new ErrorPageError('No Parfumo content markers found (no product, rating, notes, or accords)', url);
  }
}
