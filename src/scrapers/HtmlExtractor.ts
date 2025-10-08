import * as cheerio from 'cheerio';
import logger from '../utils/logger';

/**
 * Extracts structured data from Parfumo HTML pages
 */
export class HtmlExtractor {
  /**
   * Extract text from a selector
   */
  extractText($: cheerio.CheerioAPI | cheerio.Cheerio<any>, selector: string): string {
    const elem = typeof ($ as any).find === 'function' && !('root' in $)
      ? ($ as cheerio.Cheerio<any>).find(selector)
      : ($ as cheerio.CheerioAPI)(selector);
    return elem.first().text().trim();
  }

  /**
   * Extract gender from page content
   */
  extractGender($: cheerio.CheerioAPI): 'male' | 'female' | 'unisex' | undefined {
    // Strategy 1: Check description text first
    const description = this.extractText($, 'p, .description, .perfume-description, .main-description, p.desc');

    if (description) {
      // Prioritize "for women and men" (unisex) to avoid false positives
      if (/for (women and men|men and women|both|everyone)/i.test(description)) {
        return 'unisex';
      }
      if (/for women|for her|women's perfume/i.test(description)) {
        return 'female';
      }
      if (/for men|for him|men's perfume/i.test(description)) {
        return 'male';
      }
    }

    // Strategy 2: Check ranking/link text
    const pageText = $('body').text();
    if (/ranked \d+ in unisex perfume/i.test(pageText)) {
      return 'unisex';
    }
    if (/ranked \d+ in (women's|women) perfume/i.test(pageText)) {
      return 'female';
    }
    if (/ranked \d+ in (men's|men) perfume/i.test(pageText)) {
      return 'male';
    }

    // Strategy 3: Legacy selector support
    const genderText = this.extractText($, '.gender, .perfume-gender').toLowerCase();
    if (genderText) {
      if (genderText.includes('women') || genderText.includes('femme') || genderText.includes('her')) {
        return 'female';
      }
      if (genderText.includes('men') || genderText.includes('homme') || genderText.includes('him')) {
        return 'male';
      }
      if (genderText.includes('unisex') || genderText.includes('shared')) {
        return 'unisex';
      }
    }

    return undefined;
  }

  /**
   * Extract fragrance notes
   */
  extractNotes($: cheerio.CheerioAPI): { top: string[], heart: string[], base: string[] } | undefined {
    const notes = {
      top: [] as string[],
      heart: [] as string[],
      base: [] as string[],
    };

    $('.notes_list').each((_, section) => {
      $(section).find('.clickable_note_img').each((_, elem) => {
        const $elem = $(elem);
        const note = $elem.text().trim();
        const category = $elem.attr('data-nt');

        if (!note) return;

        if (category === 't') {
          notes.top.push(note);
        } else if (category === 'm' || category === 'h') {
          notes.heart.push(note);
        } else if (category === 'b') {
          notes.base.push(note);
        }
      });
    });

    if (notes.top.length === 0 && notes.heart.length === 0 && notes.base.length === 0) {
      return undefined;
    }

    return notes;
  }

  /**
   * Extract accords
   */
  extractAccords($: cheerio.CheerioAPI): string[] {
    const accords: string[] = [];

    $('.accord, .perfume-accord, [class*="accord"]').each((_, elem) => {
      const accord = $(elem).text().trim();
      if (accord && !accord.includes('%')) {
        accords.push(accord);
      }
    });

    return accords;
  }

  /**
   * Extract a rating metric from page text using regex
   */
  private extractRatingMetric(
    pageText: string,
    label: string
  ): { value: number; count: number } | null {
    const pattern = new RegExp(`${label}[^\\d]*(\\d{1,2}\\.\\d)(\\d+)\\s*Ratings?`, 'i');
    const match = pageText.match(pattern);

    if (match) {
      return {
        value: parseFloat(match[1]),
        count: parseInt(match[2], 10),
      };
    }

    return null;
  }

  /**
   * Extract all ratings from the page
   */
  extractAllRatings($: cheerio.CheerioAPI): {
    scent?: number;
    longevity?: number;
    sillage?: number;
    bottle?: number;
    priceValue?: number;
    totalRatings?: number;
    longevityRatingCount?: number;
    sillageRatingCount?: number;
    bottleRatingCount?: number;
    priceValueRatingCount?: number;
  } {
    const ratings: any = {};

    // Extract total ratings count
    const ratingCountText = $('[itemprop="ratingCount"]').text().trim();
    const countMatch = ratingCountText.match(/(\d+)\s*Ratings?/i);
    if (countMatch) {
      ratings.totalRatings = parseInt(countMatch[1], 10);
    }

    const pageText = $('body').text();

    // Extract each rating dimension
    const scent = this.extractRatingMetric(pageText, 'Scent');
    if (scent) {
      ratings.scent = scent.value;
    }

    const longevity = this.extractRatingMetric(pageText, 'Longevity');
    if (longevity) {
      ratings.longevity = longevity.value;
      ratings.longevityRatingCount = longevity.count;
      logger.debug(`Extracted rating - label: longevity, value: ${longevity.value}, count: ${longevity.count}`);
    }

    const sillage = this.extractRatingMetric(pageText, 'Sillage');
    if (sillage) {
      ratings.sillage = sillage.value;
      ratings.sillageRatingCount = sillage.count;
      logger.debug(`Extracted rating - label: sillage, value: ${sillage.value}, count: ${sillage.count}`);
    }

    const bottle = this.extractRatingMetric(pageText, 'Bottle');
    if (bottle) {
      ratings.bottle = bottle.value;
      ratings.bottleRatingCount = bottle.count;
      logger.debug(`Extracted rating - label: bottle, value: ${bottle.value}, count: ${bottle.count}`);
    }

    const priceValue = this.extractRatingMetric(pageText, '(?:Value for money|Price[-\\s]*Value|Pricing)');
    if (priceValue) {
      ratings.priceValue = priceValue.value;
      ratings.priceValueRatingCount = priceValue.count;
      logger.debug(`Extracted rating - label: price-value, value: ${priceValue.value}, count: ${priceValue.count}`);
    }

    logger.debug(`Extracted ratings:`, ratings);
    return ratings;
  }

  /**
   * Extract community statistics
   */
  extractCommunityStats($: cheerio.CheerioAPI): {
    reviewCount?: number;
    statementCount?: number;
    photoCount?: number;
  } {
    const stats: any = {};

    const reviewText = $('body').text();

    const reviewMatch = reviewText.match(/(\d+)\s*(?:in-depth\s+)?reviews?/i);
    if (reviewMatch) {
      stats.reviewCount = parseInt(reviewMatch[1], 10);
    }

    const statementMatch = reviewText.match(/(\d+)\s*statements?/i);
    if (statementMatch) {
      stats.statementCount = parseInt(statementMatch[1], 10);
    }

    const photoMatch = reviewText.match(/(\d+)\s*(?:community\s+)?photos?/i);
    if (photoMatch) {
      stats.photoCount = parseInt(photoMatch[1], 10);
    }

    logger.debug(`Extracted community stats:`, stats);
    return stats;
  }

  /**
   * Extract ranking information
   */
  extractRanking($: cheerio.CheerioAPI): {
    rank?: number;
    rankCategory?: string;
  } {
    const ranking: any = {};

    const rankText = $('body').text();
    const rankMatch = rankText.match(/Ranked\s+#?(\d+)\s+in\s+([^\n.]+)/i);
    if (rankMatch) {
      ranking.rank = parseInt(rankMatch[1], 10);
      ranking.rankCategory = rankMatch[2].trim().replace(/\s+\d+$/, '');
    }

    logger.debug(`Extracted ranking:`, ranking);
    return ranking;
  }

  /**
   * Extract perfumer information
   */
  extractPerfumer($: cheerio.CheerioAPI): string | undefined {
    let perfumer: string | undefined;

    // Strategy 1: Look for "Perfumer:" label
    $('body').find('*').each((_, elem) => {
      const text = $(elem).text();
      if (text.includes('Perfumer:')) {
        const match = text.match(/Perfumer:\s*([^,\n]+)/i);
        if (match) {
          perfumer = match[1].trim();
          return false;
        }
      }
      return;
    });

    // Strategy 2: Look for specific perfumer class or attribute
    if (!perfumer) {
      perfumer = this.extractText($, '.perfumer, [itemprop="creator"]');
    }

    logger.debug(`Extracted perfumer: ${perfumer || 'undefined'}`);
    return perfumer;
  }

  /**
   * Extract main image URL
   */
  extractMainImage($: cheerio.CheerioAPI, baseUrl: string): string | undefined {
    let imageUrl: string | undefined;

    $('img').each((_, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src && src.includes('media.parfumo.com/perfumes')) {
        imageUrl = this.normalizeImageUrl(src, baseUrl);
        return false;
      }
      return;
    });

    return imageUrl;
  }

  /**
   * Extract image URL from element
   */
  extractImageUrl(url: string | undefined, baseUrl: string): string | undefined {
    return this.normalizeImageUrl(url, baseUrl);
  }

  /**
   * Normalize image URL to absolute format
   */
  private normalizeImageUrl(url: string | undefined, baseUrl: string): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${baseUrl}${url}`;
    return url;
  }

  /**
   * Extract similar fragrances
   */
  extractSimilarFragrances($: cheerio.CheerioAPI, limit: number = 10): string[] {
    const similar: string[] = [];

    $('.similar-perfume, .similar-fragrance, [class*="similar"] a').each((_, elem) => {
      const name = $(elem).text().trim();
      if (name) {
        similar.push(name);
      }
    });

    return similar.slice(0, limit);
  }

  /**
   * Parse rating from text
   */
  parseRating(text: string): number | undefined {
    const match = text.match(/(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }
}
