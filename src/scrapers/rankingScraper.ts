import * as cheerio from 'cheerio';
import browserClient from '../proxy/browserClient';
import { getRandomDelay, SCRAPING_DELAYS } from '../constants/scraping';
import logger from '../utils/logger';
import config from '../config/config';

export interface RankedFragrance {
  rank: number;
  name: string;
  brand: string;
  url: string;
  year?: number;
}

export interface RankingResult {
  category: string;
  page: number;
  items: RankedFragrance[];
}

const CATEGORY_URLS: Record<string, string> = {
  mens: '/Perfumes/Tops/Men',
  womens: '/Perfumes/Tops/Women',
  unisex: '/Perfumes/Tops/Unisex',
};

class RankingScraper {
  private get baseUrl(): string {
    return config.scraper.baseUrl;
  }

  async scrapeRankingPage(category: string, page: number, limit: number): Promise<RankingResult> {
    const categoryPath = CATEGORY_URLS[category];
    if (!categoryPath) {
      throw new Error(`Unknown category: ${category}`);
    }

    const url = `${this.baseUrl}${categoryPath}${page > 1 ? `?current_page=${page}` : ''}`;
    logger.info(`Scraping ranking page: ${url}`);

    await browserClient.delay(getRandomDelay(SCRAPING_DELAYS.RANKING_MIN, SCRAPING_DELAYS.RANKING_MAX));
    const html = await browserClient.getPageContent(url);
    const $ = cheerio.load(html);

    // Debug: dump HTML to inspect structure
    if (process.env.DEBUG_HTML === 'true') {
      const fs = await import('fs/promises');
      const path = await import('path');
      const debugPath = path.join('C:', 'Users', 'shurley', 'source', 'repos', 'HurleySk', 'fragscrape', `debug_ranking_${category}_p${page}.html`);
      await fs.writeFile(debugPath, html);
      logger.info(`DEBUG: Saved HTML (${html.length} bytes) to ${debugPath}`);
    }

    const items: RankedFragrance[] = [];
    const baseRank = (page - 1) * limit;

    // Parfumo uses .pgrid .col for perfume grid items, with .name a for links
    // Also try other known patterns as fallbacks
    const selectors = [
      '.pgrid .col',
      '.pgrid-small .col',
      '.col:has(.name a[href*="/Perfumes/"])',
      '.name:has(a[href*="/Perfumes/"])',
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let $items: any = null;
    for (const selector of selectors) {
      const found = $(selector);
      if (found.length > 0) {
        $items = found;
        logger.info(`Ranking items found with selector: ${selector} (${found.length} items)`);
        break;
      }
    }

    if (!$items || $items.length === 0) {
      logger.warn(`No ranking items found on ${url}. Selectors tried: ${selectors.join(', ')}`);
      logger.debug(`Page title: ${$('title').text()}`);
      return { category, page, items: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $items.each((i: number, elem: any): false | void => {
      if (items.length >= limit) return false;

      const $elem = $(elem);
      const $link = $elem.find('.name a[href*="/Perfumes/"]').first();
      if (!$link.length) {
        // Fallback: any link to a perfume page
        const $anyLink = $elem.find('a[href*="/Perfumes/"]').first();
        if (!$anyLink.length) return;
      }

      // Parfumo structure: .name > a (perfume link) + .brand > a (brand link)
      const $nameLink = $elem.find('.name > a[href*="/Perfumes/"]').first();
      if (!$nameLink.length) return;

      const href = $nameLink.attr('href') || '';
      if (!href) return;

      const name = $nameLink.text().trim();
      const $brandLink = $elem.find('.brand a[href*="/Perfumes/"]').first();
      const brand = $brandLink.length ? $brandLink.text().trim() : '';

      // Extract rank from .place element if available, otherwise use position
      const $place = $elem.find('.place');
      const rank = $place.length ? parseInt($place.text().trim(), 10) : baseRank + i + 1;

      if (name) {
        items.push({
          rank: isNaN(rank) ? baseRank + i + 1 : rank,
          name,
          brand,
          url: href,
        });
      }
    });

    logger.info(`Extracted ${items.length} ranked fragrances from ${category} page ${page}`);
    return { category, page, items };
  }
}

export const rankingScraper = new RankingScraper();
