import * as cheerio from 'cheerio';
import browserClient from '../proxy/browserClient';
import { getRandomDelay, SCRAPING_DELAYS } from '../constants/scraping';
import logger from '../utils/logger';
import config from '../config/config';
import { saveDebugHtml } from '../utils/debugHtml';

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

export interface RankingFilters {
  production?: 'in-production' | 'discontinued' | 'all';
  edition?: 'regular' | 'limited' | 'collectors' | 'all';
}

const ITEMS_PER_PAGE = 20;

const GENDER_PARAMS: Record<string, string> = {
  mens: 'g_m',
  womens: 'g_f',
  unisex: 'g_u',
};

class RankingScraper {
  private get baseUrl(): string {
    return config.scraper.baseUrl;
  }

  private buildSearchUrl(category: string, page: number, filters: RankingFilters = {}): string {
    const params = new URLSearchParams();
    params.set('in', '1');

    const genderParam = GENDER_PARAMS[category];
    if (genderParam) params.set(genderParam, '1');

    if (filters.production === 'in-production') params.set('s_0', '1');
    else if (filters.production === 'discontinued') params.set('s_1', '1');

    if (filters.edition === 'regular') params.set('e_0', '1');
    else if (filters.edition === 'limited') params.set('e_1', '1');
    else if (filters.edition === 'collectors') params.set('e_2', '1');

    params.set('o', 'nr_desc');

    if (page > 1) params.set('current_page', page.toString());

    return `${this.baseUrl}/s_perfumes_x.php?${params.toString()}`;
  }

  async scrapeRankingPage(category: string, page: number, limit: number, filters: RankingFilters = {}): Promise<RankingResult> {
    if (!GENDER_PARAMS[category]) {
      throw new Error(`Unknown category: ${category}`);
    }

    const url = this.buildSearchUrl(category, page, filters);
    logger.info(`Scraping ranking page: ${url}`);

    await browserClient.delay(getRandomDelay(SCRAPING_DELAYS.RANKING_MIN, SCRAPING_DELAYS.RANKING_MAX));
    const html = await browserClient.getPageContent(url);
    const $ = cheerio.load(html);

    await saveDebugHtml(`ranking_${category}_p${page}`, html);

    const items: RankedFragrance[] = [];
    const baseRank = (page - 1) * ITEMS_PER_PAGE;

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

      let $link = $elem.find('.name > a[href*="/Perfumes/"]').first();
      if (!$link.length) $link = $elem.find('a[href*="/Perfumes/"]').first();
      if (!$link.length) return;

      const href = $link.attr('href') || '';
      if (!href) return;

      const name = $link.text().trim();
      const $brandLink = $elem.find('.brand a[href*="/Perfumes/"]').first();
      const brand = $brandLink.length ? $brandLink.text().trim() : '';

      const rank = baseRank + i + 1;

      if (name) {
        items.push({
          rank,
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
