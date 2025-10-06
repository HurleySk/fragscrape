import * as cheerio from 'cheerio';
import browserClient from '../proxy/browserClient';
import logger from '../utils/logger';
import { Perfume, SearchResult } from '../types';

class ParfumoScraper {
  private baseUrl = 'https://www.parfumo.com';

  /**
   * Search for perfumes on Parfumo
   */
  async search(query: string, limit: number = 20): Promise<SearchResult[]> {
    try {
      const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
      logger.info(`Searching Parfumo for: ${query}`);

      // Add delay to be respectful
      await browserClient.delay(1000 + Math.random() * 1000);

      const html = await browserClient.getPageContent(searchUrl);
      const $ = cheerio.load(html);

      const results: SearchResult[] = [];
      const seenUrls = new Set<string>();

      // Parse results using actual Parfumo structure
      // Each result appears to have a container with name/brand/image children
      $('.name').each((index, element) => {
        if (results.length >= limit) return false;

        const $nameElement = $(element);
        const $nameLink = $nameElement.find('a');
        const href = $nameLink.attr('href');

        if (!href) return;

        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

        // Skip duplicates
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        // Parse brand and name from URL structure: /Perfumes/{BRAND}/{PERFUME_NAME}
        const urlParts = fullUrl.split('/');
        if (urlParts.length < 6) return;

        // Extract brand from URL (index 4)
        const brand = urlParts[4].replace(/_/g, ' ');

        // Extract perfume name from URL (index 5) and clean it up
        let name = urlParts[5].replace(/_/g, ' ');

        // Extract year from name if present (e.g., "Dior Homme Intense 2011")
        let year: number | undefined;
        const yearMatch = name.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[0]);
          // Remove year from name
          name = name.replace(/\s*\d{4}\s*$/, '').trim();
        }

        // Remove common concentration types from the name for cleaner display
        name = name.replace(/\s+(Eau de Parfum|Eau de Toilette|Parfum|Cologne|Extrait)$/i, '').trim();

        // Capitalize first letter of each word in name
        name = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

        // Get parent container for additional info
        const $container = $nameElement.closest('div');

        // Find image
        const $imageElement = $container.find('img').first();
        const imageUrl = this.extractImageUrl($imageElement.attr('src') || $imageElement.attr('data-src'));

        // Find rating if available
        const $ratingElement = $container.find('.rating, .stars, [class*="rating"]');
        const rating = this.parseRating($ratingElement.text());

        if (name && brand) {
          const result: SearchResult = {
            name,
            brand,
            url: fullUrl,
            year,
            rating,
            imageUrl,
          };

          results.push(result);
        }
      });

      logger.info(`Found ${results.length} search results for: ${query}`);
      return results;
    } catch (error) {
      logger.error(`Search failed for query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Get detailed perfume information
   */
  async getPerfumeDetails(url: string): Promise<Perfume> {
    try {
      const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
      logger.info(`Fetching perfume details from: ${fullUrl}`);

      // Add delay to be respectful
      await browserClient.delay(1500 + Math.random() * 1500);

      const html = await browserClient.getPageContent(fullUrl);
      const $ = cheerio.load(html);

      // Extract brand and name from URL (most reliable method)
      const urlParts = fullUrl.split('/');
      let brand = '';
      let name = '';
      let year: number | undefined;

      if (urlParts.length >= 6) {
        brand = urlParts[4].replace(/_/g, ' ');
        name = urlParts[5].replace(/_/g, ' ');

        // Extract year from name
        const yearMatch = name.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[0]);
          name = name.replace(/\s*\d{4}\s*$/, '').trim();
        }

        // Remove concentration types
        name = name.replace(/\s+(Eau de Parfum|Eau de Toilette|Parfum|Cologne|Extrait)$/i, '').trim();

        // Capitalize
        name = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
      }


      // Extract other information using selectors (may need updating based on actual HTML)
      const concentration = this.extractText($, '.concentration, .perfume-concentration, .type');
      const gender = this.extractGender($);
      const description = this.extractText($, '.description, .perfume-description, .main-description, p.desc');

      // Extract notes
      const notes = this.extractNotes($);

      // Extract accords
      const accords = this.extractAccords($);

      // Extract all rating dimensions from barfiller elements
      const ratings = this.extractAllRatings($);

      // Extract image
      const imageUrl = this.extractMainImage($);

      // Extract similar fragrances
      const similarFragrances = this.extractSimilarFragrances($);

      const perfume: Perfume = {
        name,
        brand,
        year,
        url: fullUrl,
        imageUrl,
        concentration,
        gender,
        description,
        notes,
        accords,
        rating: ratings.scent,
        totalRatings: ratings.totalRatings,
        longevity: ratings.longevity,
        sillage: ratings.sillage,
        bottleRating: ratings.bottle,
        priceValue: ratings.priceValue,
        similarFragrances,
        scrapedAt: new Date(),
      };

      logger.info(`Successfully scraped: ${brand} - ${name}`);
      return perfume;
    } catch (error) {
      logger.error(`Failed to fetch perfume details from ${url}:`, error);
      throw error;
    }
  }

  /**
   * Get perfumes by brand
   */
  async getPerfumesByBrand(brand: string, page: number = 1): Promise<SearchResult[]> {
    try {
      const brandUrl = `${this.baseUrl}/Perfumes/${encodeURIComponent(brand)}?page=${page}`;
      logger.info(`Fetching perfumes for brand: ${brand} (page ${page})`);

      await browserClient.delay(1000 + Math.random() * 1000);

      const html = await browserClient.getPageContent(brandUrl);
      const $ = cheerio.load(html);

      const results: SearchResult[] = [];
      const seenUrls = new Set<string>();

      // Use same approach as search - find .name elements and parse from URLs
      $('.name').each((_, element) => {
        const $nameElement = $(element);
        const $nameLink = $nameElement.find('a');
        const href = $nameLink.attr('href');

        if (!href) return;

        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

        // Skip duplicates
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        // Parse from URL: /Perfumes/{BRAND}/{PERFUME_NAME}
        const urlParts = fullUrl.split('/');
        if (urlParts.length < 6) return;

        const extractedBrand = urlParts[4].replace(/_/g, ' ');
        let name = urlParts[5].replace(/_/g, ' ');

        // Extract year if present
        let year: number | undefined;
        const yearMatch = name.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[0]);
          name = name.replace(/\s*\d{4}\s*$/, '').trim();
        }

        // Remove concentration types
        name = name.replace(/\s+(Eau de Parfum|Eau de Toilette|Parfum|Cologne|Extrait)$/i, '').trim();

        // Capitalize
        name = name.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');

        // Try to find rating
        const $container = $nameElement.closest('div');
        const $ratingElement = $container.find('.rating, .stars, [class*="rating"]');
        const rating = this.parseRating($ratingElement.text());

        // Find image
        const $imageElement = $container.find('img').first();
        const imageUrl = this.extractImageUrl($imageElement.attr('src') || $imageElement.attr('data-src'));

        results.push({
          name,
          brand: extractedBrand,
          url: fullUrl,
          year,
          rating,
          imageUrl,
        });
      });

      logger.info(`Found ${results.length} perfumes for brand: ${brand}`);
      return results;
    } catch (error) {
      logger.error(`Failed to fetch perfumes for brand "${brand}":`, error);
      throw error;
    }
  }

  // Helper methods

  private extractText($: cheerio.CheerioAPI | cheerio.Cheerio<any>, selector: string): string {
    // Check if $ has a 'find' method (Cheerio element) or if it's the API itself
    const elem = typeof ($ as any).find === 'function' && !('root' in $)
      ? ($ as cheerio.Cheerio<any>).find(selector)
      : ($ as cheerio.CheerioAPI)(selector);
    return elem.first().text().trim();
  }

  private extractGender($: cheerio.CheerioAPI): 'male' | 'female' | 'unisex' | undefined {
    const genderText = this.extractText($, '.gender, .perfume-gender').toLowerCase();

    if (genderText.includes('women') || genderText.includes('femme') || genderText.includes('her')) {
      return 'female';
    }
    if (genderText.includes('men') || genderText.includes('homme') || genderText.includes('him')) {
      return 'male';
    }
    if (genderText.includes('unisex') || genderText.includes('shared')) {
      return 'unisex';
    }

    return undefined;
  }

  private extractNotes($: cheerio.CheerioAPI): { top: string[], heart: string[], base: string[] } | undefined {
    const notes = {
      top: [] as string[],
      heart: [] as string[],
      base: [] as string[],
    };

    // Parfumo uses .notes_list containers with .clickable_note_img elements
    // Each note has a data-nt attribute: 't' = top, 'm' = middle/heart, 'b' = base
    $('.notes_list').each((_, section) => {
      $(section).find('.clickable_note_img').each((_, elem) => {
        const $elem = $(elem);
        const note = $elem.text().trim();
        const category = $elem.attr('data-nt');

        if (!note) return;

        // Categorize based on data-nt attribute
        if (category === 't') {
          notes.top.push(note);
        } else if (category === 'm' || category === 'h') {
          notes.heart.push(note);
        } else if (category === 'b') {
          notes.base.push(note);
        }
      });
    });

    // Return undefined if no notes found
    if (notes.top.length === 0 && notes.heart.length === 0 && notes.base.length === 0) {
      return undefined;
    }

    return notes;
  }

  private extractAccords($: cheerio.CheerioAPI): string[] {
    const accords: string[] = [];

    $('.accord, .perfume-accord, [class*="accord"]').each((_, elem) => {
      const accord = $(elem).text().trim();
      if (accord && !accord.includes('%')) {
        accords.push(accord);
      }
    });

    return accords;
  }

  private extractAllRatings($: cheerio.CheerioAPI): {
    scent?: number;
    longevity?: number;
    sillage?: number;
    bottle?: number;
    priceValue?: number;
    totalRatings?: number;
  } {
    const ratings = {
      scent: undefined as number | undefined,
      longevity: undefined as number | undefined,
      sillage: undefined as number | undefined,
      bottle: undefined as number | undefined,
      priceValue: undefined as number | undefined,
      totalRatings: undefined as number | undefined,
    };

    // Extract total ratings count from main rating section
    // Format: "117 Ratings" in the itemprop="ratingCount" span
    const ratingCountText = $('[itemprop="ratingCount"]').text().trim();
    const countMatch = ratingCountText.match(/(\d+)\s*Ratings?/i);
    if (countMatch) {
      ratings.totalRatings = parseInt(countMatch[1]);
    }

    // Parfumo structure: Each .barfiller_element has data-type attribute
    // The rating value is in a nested <span class="pr-0-5 text-lg bold"> element
    $('.barfiller_element').each((_, elem) => {
      const $elem = $(elem);

      // Get dimension type from data-type attribute
      const dataType = $elem.attr('data-type');
      if (!dataType) return;

      // Extract rating value from nested bold span
      // Selectors: .pr-0-5.text-lg.bold or just .bold within the element
      const $ratingSpan = $elem.find('span.bold, .pr-0-5.bold, .text-lg.bold').first();
      if (!$ratingSpan.length) return;

      const ratingText = $ratingSpan.text().trim();
      const ratingMatch = ratingText.match(/(\d+\.?\d*)/);
      if (!ratingMatch) return;

      const ratingValue = parseFloat(ratingMatch[1]);
      logger.debug(`Extracted rating - type: ${dataType}, value: ${ratingValue}`);

      // Map data-type attribute to rating fields
      switch (dataType) {
        case 'scent':
          ratings.scent = ratingValue;
          break;
        case 'durability':
          ratings.longevity = ratingValue;
          break;
        case 'sillage':
          ratings.sillage = ratingValue;
          break;
        case 'bottle':
          ratings.bottle = ratingValue;
          break;
        case 'pricing':
          ratings.priceValue = ratingValue;
          break;
      }
    });

    logger.debug(`Extracted ratings:`, ratings);
    return ratings;
  }

  private extractRating($: cheerio.CheerioAPI): number | undefined {
    // Parfumo uses .ratingvalue for the main rating
    const ratingText = this.extractText($, '.ratingvalue');
    return this.parseRating(ratingText);
  }

  private parseRating(text: string): number | undefined {
    const match = text.match(/(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  private extractTotalRatings($: cheerio.CheerioAPI): number | undefined {
    // Parfumo shows ratings count in .barfiller_element (e.g., "Scent 8.47490 Ratings")
    const text = this.extractText($, '.barfiller_element');
    const match = text.match(/(\d+)\s*Ratings/i);
    if (match) {
      return parseInt(match[1]);
    }
    return undefined;
  }

  private extractMetric($: cheerio.CheerioAPI, selector: string): number | undefined {
    const text = this.extractText($, selector);
    const match = text.match(/(\d+\.?\d*)/);
    if (match) {
      return parseFloat(match[1]);
    }
    return undefined;
  }

  private extractMainImage($: cheerio.CheerioAPI): string | undefined {
    // Look for the main perfume bottle image (usually from media.parfumo.com)
    let imageUrl: string | undefined;

    // Try to find image with parfumo media URL
    $('img').each((_, elem) => {
      const src = $(elem).attr('src') || $(elem).attr('data-src');
      if (src && src.includes('media.parfumo.com/perfumes')) {
        imageUrl = this.extractImageUrl(src);
        return false; // Stop iteration
      }
    });

    return imageUrl;
  }

  private extractImageUrl(url: string | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${this.baseUrl}${url}`;
    return url;
  }

  private extractSimilarFragrances($: cheerio.CheerioAPI): string[] {
    const similar: string[] = [];

    $('.similar-perfume, .similar-fragrance, [class*="similar"] a').each((_, elem) => {
      const name = $(elem).text().trim();
      if (name) {
        similar.push(name);
      }
    });

    return similar.slice(0, 10); // Limit to 10 similar fragrances
  }
}

export default new ParfumoScraper();