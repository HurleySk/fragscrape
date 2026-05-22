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
  mens: '/Rankings/Best_Perfumes_of_All_Time/Men',
  womens: '/Rankings/Best_Perfumes_of_All_Time/Women',
  unisex: '/Rankings/Best_Perfumes_of_All_Time/Unisex',
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

    const url = `${this.baseUrl}${categoryPath}${page > 1 ? `?page=${page}` : ''}`;
    logger.info(`Scraping ranking page: ${url}`);

    await browserClient.delay(getRandomDelay(SCRAPING_DELAYS.RANKING_MIN, SCRAPING_DELAYS.RANKING_MAX));
    const html = await browserClient.getPageContent(url);
    const $ = cheerio.load(html);

    const items: RankedFragrance[] = [];
    const baseRank = (page - 1) * limit;

    const selectors = [
      '.ranking-item',
      '.perfume-ranking-row',
      '[class*="ranking"] .perfume-item',
      '#main .ranking_list .ranking_entry',
      '.ranking_entry',
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
      logger.debug(`Body classes: ${$('body').attr('class')}`);
      return { category, page, items: [] };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    $items.each((i: number, elem: any): false | void => {
      if (items.length >= limit) return false;

      const $elem = $(elem);
      const $link = $elem.find('a[href*="/Perfumes/"], a[href*="/perfumes/"]').first();
      if (!$link.length) return;

      const href = $link.attr('href') || '';
      const fullText = $link.text().trim();

      let brand = '';
      let name = '';
      const $brand = $elem.find('.brand, [class*="brand"]');
      const $name = $elem.find('.name, [class*="name"], .perfume_name');

      if ($brand.length && $name.length) {
        brand = $brand.text().trim();
        name = $name.text().trim();
      } else {
        const urlParts = href.split('/').filter(Boolean);
        const perfumeIdx = urlParts.findIndex(p => p.toLowerCase() === 'perfumes');
        if (perfumeIdx >= 0 && urlParts.length > perfumeIdx + 2) {
          brand = decodeURIComponent(urlParts[perfumeIdx + 1]).replace(/_/g, ' ');
          name = decodeURIComponent(urlParts[perfumeIdx + 2]).replace(/_/g, ' ');
        } else {
          name = fullText;
        }
      }

      const yearMatch = $elem.text().match(/\b(19|20)\d{2}\b/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : undefined;

      if (name) {
        items.push({
          rank: baseRank + i + 1,
          name,
          brand,
          url: href,
          year,
        });
      }
    });

    logger.info(`Extracted ${items.length} ranked fragrances from ${category} page ${page}`);
    return { category, page, items };
  }
}

export const rankingScraper = new RankingScraper();
