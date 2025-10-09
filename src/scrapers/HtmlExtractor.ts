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
   * Extract a rating metric using multiple strategies for robustness
   *
   * Strategies (in order of preference):
   * 1. DOM selectors with context (most reliable)
   * 2. Separated format with strict context (e.g., "Longevity 6.0 2895 Ratings")
   * 3. Concatenated format (e.g., "Longevity6.02895 Ratings")
   */
  private extractRatingMetric(
    $: cheerio.CheerioAPI,
    label: string
  ): { value: number; count: number } | null {
    // Strategy 1: Try DOM-based extraction with context
    // Look for rating sections that contain the label and extract structured data
    const domResult = this.extractRatingFromDOM($, label);
    if (domResult) {
      logger.debug(`Extracted rating (DOM): ${label} = ${domResult.value}, count = ${domResult.count}`);
      return domResult;
    }

    // Strategy 2: Try regex on body text with STRICT separated format
    // This requires spaces/newlines between components to avoid ambiguity
    const pageText = $('body').text();
    const separatedResult = this.extractRatingSeparated(pageText, label);
    if (separatedResult) {
      logger.debug(`Extracted rating (separated): ${label} = ${separatedResult.value}, count = ${separatedResult.count}`);
      return separatedResult;
    }

    // Strategy 3: Try concatenated format (less reliable, use as last resort)
    const concatenatedResult = this.extractRatingConcatenated(pageText, label);
    if (concatenatedResult) {
      logger.debug(`Extracted rating (concatenated): ${label} = ${concatenatedResult.value}, count = ${concatenatedResult.count}`);
      return concatenatedResult;
    }

    logger.debug(`Failed to extract rating for: ${label}`);
    return null;
  }

  /**
   * Extract rating from DOM structure with context
   * Uses precise data-type selectors to target specific rating sections
   */
  private extractRatingFromDOM($: cheerio.CheerioAPI, label: string): { value: number; count: number } | null {
    // Map labels to data-type attributes
    // The label parameter may be a regex pattern, so we need to check against possible values
    const labelToDataType: { [key: string]: string } = {
      'longevity': 'durability',
      'sillage': 'sillage',
      'bottle': 'bottle',
      'pricing': 'pricing',
      'value for money': 'pricing',
      'price-value': 'pricing',
      'price value': 'pricing',
    };

    // Extract the actual label from potential regex pattern
    const normalizedLabel = label.toLowerCase()
      .replace(/\(\?:/g, '')
      .replace(/\|/g, ' ')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .replace(/\\/g, '')
      .replace(/-/g, ' ')
      .trim()
      .split(' ')[0]; // Get first word for lookup

    const dataType = labelToDataType[normalizedLabel];
    if (!dataType) {
      return null;
    }

    // Find the specific rating container using data-type attribute
    const container = $(`[data-type="${dataType}"]`);
    if (container.length === 0) {
      return null;
    }

    // Extract value from: <span class="text-lg bold [color]">VALUE</span>
    const valueSpan = container.find('span.text-lg.bold').first();
    const valueText = valueSpan.text().trim();

    if (!valueText) {
      return null;
    }

    const value = parseFloat(valueText);
    if (isNaN(value)) {
      return null;
    }

    // Extract count from: <span class="lightgrey text-2xs upper">COUNT Ratings</span>
    const countSpan = container.find('span.lightgrey.text-2xs').first();
    const countText = countSpan.text().trim();
    const countMatch = countText.match(/(\d+)\s*Ratings?/i);

    if (!countMatch) {
      return null;
    }

    const count = parseInt(countMatch[1].replace(/,/g, ''), 10);

    // Validate before accepting
    if (this.validateRating(value, count, label)) {
      return { value, count };
    }

    return null;
  }

  /**
   * Extract rating using separated format (spaces between components)
   */
  private extractRatingSeparated(pageText: string, label: string): { value: number; count: number } | null {
    const escapedLabel = label.replace(/[-\s]/g, '[-\\s]*');

    // Require at least 2 non-digit chars between rating and count to avoid ambiguity
    // Format: "Label 8.6 3052 Ratings" or "Label\n8.6\n3052 Ratings"
    const pattern = new RegExp(
      `${escapedLabel}[^\\d]+(\\d{1,2}\\.\\d{1,2})[^\\d]{2,}([\\d,]+)\\s*Ratings?`,
      'i'
    );

    const match = pageText.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      const count = parseInt(match[2].replace(/,/g, ''), 10);

      if (this.validateRating(value, count, label)) {
        return { value, count };
      }
    }

    return null;
  }

  /**
   * Extract rating using concatenated format (last resort)
   */
  private extractRatingConcatenated(pageText: string, label: string): { value: number; count: number } | null {
    const escapedLabel = label.replace(/[-\s]/g, '[-\\s]*');

    // Extract integer part, decimal point, and all following digits
    const pattern = new RegExp(`${escapedLabel}[^\\d]*(\\d{1,2})\\.(\\d+?)\\s*Ratings?`, 'i');
    const match = pageText.match(pattern);

    if (match) {
      const integerPart = match[1];
      const decimalDigits = match[2];

      // Analyze digit count to determine structure
      if (decimalDigits.length >= 5) {
        if (decimalDigits.length === 5) {
          // Could be: 1-dec + 4-digit count OR 2-dec + 3-digit count
          const potentialCount = parseInt(decimalDigits.substring(1), 10);
          if (potentialCount >= 1000) {
            // 1-decimal + 4-digit count
            const value = parseFloat(`${integerPart}.${decimalDigits[0]}`);
            const count = potentialCount;
            if (this.validateRating(value, count, label)) {
              return { value, count };
            }
          } else {
            // 2-decimal + 3-digit count
            const value = parseFloat(`${integerPart}.${decimalDigits.substring(0, 2)}`);
            const count = parseInt(decimalDigits.substring(2), 10);
            if (this.validateRating(value, count, label)) {
              return { value, count };
            }
          }
        } else if (decimalDigits.length >= 6) {
          // 6+ digits: 2-decimal + 4+ digit count
          const value = parseFloat(`${integerPart}.${decimalDigits.substring(0, 2)}`);
          const count = parseInt(decimalDigits.substring(2), 10);
          if (this.validateRating(value, count, label)) {
            return { value, count };
          }
        }
      } else if (decimalDigits.length === 4) {
        // 4 digits: 1-decimal + 3-digit count
        const value = parseFloat(`${integerPart}.${decimalDigits[0]}`);
        const count = parseInt(decimalDigits.substring(1), 10);
        if (this.validateRating(value, count, label)) {
          return { value, count };
        }
      }
    }

    return null;
  }

  /**
   * Validate extracted rating values for sanity
   */
  private validateRating(value: number, count: number, label: string): boolean {
    // Ratings must be between 0 and 10
    if (value < 0 || value > 10) {
      logger.warn(`Invalid rating value for ${label}: ${value} (must be 0-10)`);
      return false;
    }

    // Count must be positive and reasonable (less than 1 million)
    if (count <= 0 || count > 1000000) {
      logger.warn(`Invalid rating count for ${label}: ${count} (must be 1-1000000)`);
      return false;
    }

    return true;
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

    // Extract main scent rating using structured data (most reliable)
    const ratingValueText = $('[itemprop="ratingValue"]').first().text().trim();
    if (ratingValueText) {
      const ratingValue = parseFloat(ratingValueText);
      if (!isNaN(ratingValue)) {
        ratings.scent = ratingValue;
        logger.debug(`Extracted main rating from structured data: ${ratingValue}`);
      }
    }

    // Extract total ratings count
    const ratingCountText = $('[itemprop="ratingCount"]').text().trim();
    const countMatch = ratingCountText.match(/(\d+)\s*Ratings?/i);
    if (countMatch) {
      ratings.totalRatings = parseInt(countMatch[1], 10);
    }

    // Fallback: Try regex extraction for scent rating if structured data extraction failed
    if (!ratings.scent) {
      const scent = this.extractRatingMetric($, 'Scent');
      if (scent) {
        ratings.scent = scent.value;
      }
    }

    const longevity = this.extractRatingMetric($, 'Longevity');
    if (longevity) {
      ratings.longevity = longevity.value;
      ratings.longevityRatingCount = longevity.count;
      logger.debug(`Extracted rating - label: longevity, value: ${longevity.value}, count: ${longevity.count}`);
    }

    const sillage = this.extractRatingMetric($, 'Sillage');
    if (sillage) {
      ratings.sillage = sillage.value;
      ratings.sillageRatingCount = sillage.count;
      logger.debug(`Extracted rating - label: sillage, value: ${sillage.value}, count: ${sillage.count}`);
    }

    const bottle = this.extractRatingMetric($, 'Bottle');
    if (bottle) {
      ratings.bottle = bottle.value;
      ratings.bottleRatingCount = bottle.count;
      logger.debug(`Extracted rating - label: bottle, value: ${bottle.value}, count: ${bottle.count}`);
    }

    const priceValue = this.extractRatingMetric($, '(?:Value for money|Price[-\\s]*Value|Pricing)');
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

    const reviewMatch = reviewText.match(/(\d+)\s*in-depth\s+fragrance\s+descriptions?/i);
    if (reviewMatch) {
      stats.reviewCount = parseInt(reviewMatch[1], 10);
    }

    const statementMatch = reviewText.match(/(\d+)\s*short\s+views?\s+on\s+the\s+fragrance/i);
    if (statementMatch) {
      stats.statementCount = parseInt(statementMatch[1], 10);
    }

    const photoMatch = reviewText.match(/(\d+)\s*fragrance\s+photos?/i);
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
