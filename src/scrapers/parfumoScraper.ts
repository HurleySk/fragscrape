import * as cheerio from 'cheerio';
import browserClient from '../proxy/browserClient';
import logger from '../utils/logger';
import config from '../config/config';
import { Perfume, SearchResult } from '../types';

class ParfumoScraper {
  private get baseUrl(): string {
    return config.scraper.baseUrl;
  }

  /**
   * Search for perfumes on Parfumo
   */
  async search(query: string, limit: number = 20): Promise<SearchResult[]> {
    try {
      // Use the correct Parfumo search endpoint
      const searchUrl = `${this.baseUrl}/s_perfumes_x.php?in=1&order=&filter=${encodeURIComponent(query)}`;
      logger.info(`Searching Parfumo for: ${query}`);

      // Add delay to be respectful
      await browserClient.delay(1000 + Math.random() * 1000);

      const html = await browserClient.getPageContent(searchUrl);

      // Debug: Save HTML to file for inspection
      if (process.env.DEBUG_HTML === 'true') {
        const fs = await import('fs/promises');
        const debugPath = `./debug_search_${query.replace(/\s+/g, '_')}.html`;
        await fs.writeFile(debugPath, html);
        logger.debug(`Saved HTML to: ${debugPath}`);
      }

      const $ = cheerio.load(html);

      // Use a type that includes relevance for sorting
      type ResultWithScore = SearchResult & { relevance: number };
      const results: ResultWithScore[] = [];
      const seenUrls = new Set<string>();

      // Try multiple selector strategies for better accuracy
      // IMPORTANT: Use > (direct child) or :first-child to avoid selecting brand links
      // Each .name div contains two <a> tags: one for perfume, one for brand
      const selectors = [
        '.name > a',               // Direct child link (perfume link only)
        '.name a:first-of-type',   // First anchor in .name (perfume link)
        '#main .name > a',         // Main content area
        '.search-results .name > a', // Search results container
      ];

      let foundResults = false;
      for (const selector of selectors) {
        const $links = $(selector);

        if ($links.length > 0) {
          logger.debug(`Using selector: ${selector}, found ${$links.length} potential results`);
          foundResults = true;

          $links.each((_index, element) => {
            if (results.length >= limit) return false;

            const $link = $(element);
            const href = $link.attr('href');

            if (!href) return;

            const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

            // CRITICAL: Validate this is actually a perfume URL
            if (!this.isValidPerfumeUrl(fullUrl)) {
              logger.debug(`Skipping invalid URL pattern: ${fullUrl}`);
              return;
            }

            // Skip duplicates
            if (seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);

            // Parse brand and name from URL structure: /Perfumes/{BRAND}/{PERFUME_NAME}
            const urlParts = fullUrl.split('/');

            // Extract brand from URL (index 4)
            const brand = urlParts[4].replace(/_/g, ' ');

            // Extract and process perfume name from URL (index 5)
            const [name, year] = this.processPerfumeName(urlParts[5]);

            // Calculate relevance score
            const relevanceScore = this.calculateRelevance(query, brand, name);

            // Filter out very low relevance results (score < 5)
            if (relevanceScore < 5) {
              logger.debug(`Filtering out low relevance result: ${brand} - ${name} (score: ${relevanceScore})`);
              return;
            }

            // Get parent container for additional info
            const $container = $link.closest('div, li, article');

            // Find image
            const $imageElement = $container.find('img').first();
            const imageUrl = this.extractImageUrl($imageElement.attr('src') || $imageElement.attr('data-src'));

            // Find rating if available
            const $ratingElement = $container.find('.rating, .stars, [class*="rating"]');
            const rating = this.parseRating($ratingElement.text());

            if (name && brand) {
              const result: ResultWithScore = {
                name,
                brand,
                url: fullUrl,
                year,
                rating,
                imageUrl,
                relevance: relevanceScore, // Track for sorting
              };

              results.push(result);
              logger.debug(`Added result: ${brand} - ${name} (relevance: ${relevanceScore})`);
            }
            return;
          });

          // If we found results with this selector, don't try others
          if (results.length > 0) break;
        }
      }

      if (!foundResults) {
        logger.warn(`No elements found with any search selector for query: ${query}`);
      }

      // Sort results by relevance score (highest first)
      results.sort((a, b) => b.relevance - a.relevance);

      // Remove relevance field before returning (it's not part of SearchResult interface)
      const cleanedResults: SearchResult[] = results.map(({ relevance, ...rest }) => rest);

      logger.info(`Found ${cleanedResults.length} valid search results for: ${query} (sorted by relevance)`);
      return cleanedResults;
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
        [name, year] = this.processPerfumeName(urlParts[5]);
      }


      // Extract other information using selectors (may need updating based on actual HTML)
      const concentration = this.extractText($, '.concentration, .perfume-concentration, .type');
      const gender = this.extractGender($);
      logger.debug(`Extracted gender for ${brand} - ${name}: ${gender || 'undefined'}`);
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

      // Extract community stats
      const communityStats = this.extractCommunityStats($);

      // Extract ranking
      const ranking = this.extractRanking($);

      // Extract perfumer
      const perfumer = this.extractPerfumer($);

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
        longevityRatingCount: ratings.longevityRatingCount,
        sillage: ratings.sillage,
        sillageRatingCount: ratings.sillageRatingCount,
        bottleRating: ratings.bottle,
        bottleRatingCount: ratings.bottleRatingCount,
        priceValue: ratings.priceValue,
        priceValueRatingCount: ratings.priceValueRatingCount,
        reviewCount: communityStats.reviewCount,
        statementCount: communityStats.statementCount,
        photoCount: communityStats.photoCount,
        rank: ranking.rank,
        rankCategory: ranking.rankCategory,
        perfumer,
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
        const [name, year] = this.processPerfumeName(urlParts[5]);

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

  /**
   * Extract year from perfume name if present
   * Returns tuple of [cleanedName, year]
   */
  private extractYear(name: string): [string, number | undefined] {
    const yearMatch = name.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      const cleanedName = name.replace(/\s*\d{4}\s*$/, '').trim();
      return [cleanedName, year];
    }
    return [name, undefined];
  }

  /**
   * Clean and capitalize perfume name
   */
  private cleanPerfumeName(name: string): string {
    // Remove concentration types
    let cleaned = name.replace(/\s+(Eau de Parfum|Eau de Toilette|Parfum|Cologne|Extrait)$/i, '').trim();

    // Capitalize first letter of each word
    cleaned = cleaned.split(' ').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');

    return cleaned;
  }

  /**
   * Process raw name from URL: extract year, clean, and capitalize
   * Returns tuple of [cleanedName, year]
   */
  private processPerfumeName(rawName: string): [string, number | undefined] {
    let name = rawName.replace(/_/g, ' ');
    const [nameWithoutYear, year] = this.extractYear(name);
    const cleanedName = this.cleanPerfumeName(nameWithoutYear);
    return [cleanedName, year];
  }

  /**
   * Validates that a URL follows the expected Parfumo perfume URL pattern
   * Expected: /Perfumes/{brand}/{name} or https://www.parfumo.com/Perfumes/{brand}/{name}
   */
  private isValidPerfumeUrl(url: string): boolean {
    if (!url) return false;

    // Extract path from full URL if needed
    const path = url.startsWith('http') ? new URL(url).pathname : url;

    // Check if path starts with /Perfumes/ and has at least brand and name
    const perfumePattern = /^\/Perfumes\/[^/]+\/[^/]+/;
    return perfumePattern.test(path);
  }

  /**
   * Calculate relevance score for a perfume result based on how well it matches the search query
   * Returns a score from 0-100, higher is more relevant
   */
  private calculateRelevance(query: string, brand: string, name: string): number {
    const queryLower = query.toLowerCase().trim();
    const brandLower = brand.toLowerCase().trim();
    const nameLower = name.toLowerCase().trim();
    const combined = `${brandLower} ${nameLower}`;

    let score = 0;

    // Exact match (brand + name) = 100 points
    if (combined === queryLower) {
      return 100;
    }

    // Exact brand match = 50 points
    if (brandLower === queryLower) {
      score += 50;
    }

    // Exact name match = 50 points
    if (nameLower === queryLower) {
      score += 50;
    }

    // Query words that appear in brand or name
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const combinedWords = combined.split(/\s+/);

    queryWords.forEach(queryWord => {
      // Brand contains query word = 10 points per word
      if (brandLower.includes(queryWord)) {
        score += 10;
      }

      // Name contains query word = 15 points per word (name is more specific)
      if (nameLower.includes(queryWord)) {
        score += 15;
      }

      // Combined starts with query word = 20 points (strong signal)
      if (combinedWords.some(w => w.startsWith(queryWord))) {
        score += 20;
      }
    });

    // Bonus: Combined contains full query as substring = 30 points
    if (combined.includes(queryLower)) {
      score += 30;
    }

    return Math.min(score, 100); // Cap at 100
  }

  private extractText($: cheerio.CheerioAPI | cheerio.Cheerio<any>, selector: string): string {
    // Check if $ has a 'find' method (Cheerio element) or if it's the API itself
    const elem = typeof ($ as any).find === 'function' && !('root' in $)
      ? ($ as cheerio.Cheerio<any>).find(selector)
      : ($ as cheerio.CheerioAPI)(selector);
    return elem.first().text().trim();
  }

  private extractGender($: cheerio.CheerioAPI): 'male' | 'female' | 'unisex' | undefined {
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

    // Strategy 3: Legacy selector support (if Parfumo adds specific classes later)
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
    longevityRatingCount?: number;
    sillageRatingCount?: number;
    bottleRatingCount?: number;
    priceValueRatingCount?: number;
  } {
    const ratings = {
      scent: undefined as number | undefined,
      longevity: undefined as number | undefined,
      sillage: undefined as number | undefined,
      bottle: undefined as number | undefined,
      priceValue: undefined as number | undefined,
      totalRatings: undefined as number | undefined,
      longevityRatingCount: undefined as number | undefined,
      sillageRatingCount: undefined as number | undefined,
      bottleRatingCount: undefined as number | undefined,
      priceValueRatingCount: undefined as number | undefined,
    };

    // Extract total ratings count from main rating section
    // Format: "117 Ratings" in the itemprop="ratingCount" span
    const ratingCountText = $('[itemprop="ratingCount"]').text().trim();
    const countMatch = ratingCountText.match(/(\d+)\s*Ratings?/i);
    if (countMatch) {
      ratings.totalRatings = parseInt(countMatch[1]);
    }

    // Parfumo structure: ratings appear as text in the format "Label\nValue\nCount Ratings"
    // Extract from page text using regex patterns
    const pageText = $('body').text();

    // Scent rating (main rating) - already captured in totalRatings
    const scentMatch = pageText.match(/Scent[^\d]*(\d+\.?\d*)[^\d]+(\d+)\s*Ratings?/i);
    if (scentMatch) {
      ratings.scent = parseFloat(scentMatch[1]);
      logger.debug(`Extracted rating - label: scent, value: ${ratings.scent}`);
    }

    // Longevity rating - format: "Longevity 6.9406 Ratings" (rating=6.9, count=406 concatenated)
    const longevityMatch = pageText.match(/Longevity[^\d]*(\d{1,2}\.\d)(\d+)\s*Ratings?/i);
    if (longevityMatch) {
      ratings.longevity = parseFloat(longevityMatch[1]);
      ratings.longevityRatingCount = parseInt(longevityMatch[2]);
      logger.debug(`Extracted rating - label: longevity, value: ${ratings.longevity}, count: ${ratings.longevityRatingCount}`);
    }

    // Sillage rating
    const sillageMatch = pageText.match(/Sillage[^\d]*(\d{1,2}\.\d)(\d+)\s*Ratings?/i);
    if (sillageMatch) {
      ratings.sillage = parseFloat(sillageMatch[1]);
      ratings.sillageRatingCount = parseInt(sillageMatch[2]);
      logger.debug(`Extracted rating - label: sillage, value: ${ratings.sillage}, count: ${ratings.sillageRatingCount}`);
    }

    // Bottle rating
    const bottleMatch = pageText.match(/Bottle[^\d]*(\d{1,2}\.\d)(\d+)\s*Ratings?/i);
    if (bottleMatch) {
      ratings.bottle = parseFloat(bottleMatch[1]);
      ratings.bottleRatingCount = parseInt(bottleMatch[2]);
      logger.debug(`Extracted rating - label: bottle, value: ${ratings.bottle}, count: ${ratings.bottleRatingCount}`);
    }

    // Price/Value rating
    const priceMatch = pageText.match(/(?:Value for money|Price[-\s]*Value|Pricing)[^\d]*(\d{1,2}\.\d)(\d+)\s*Ratings?/i);
    if (priceMatch) {
      ratings.priceValue = parseFloat(priceMatch[1]);
      ratings.priceValueRatingCount = parseInt(priceMatch[2]);
      logger.debug(`Extracted rating - label: price-value, value: ${ratings.priceValue}, count: ${ratings.priceValueRatingCount}`);
    }

    logger.debug(`Extracted ratings:`, ratings);
    return ratings;
  }

  private extractCommunityStats($: cheerio.CheerioAPI): {
    reviewCount?: number;
    statementCount?: number;
    photoCount?: number;
  } {
    const stats = {
      reviewCount: undefined as number | undefined,
      statementCount: undefined as number | undefined,
      photoCount: undefined as number | undefined,
    };

    // Look for review count - typically "214 reviews" or "54 in-depth reviews"
    const reviewText = $('body').text();
    const reviewMatch = reviewText.match(/(\d+)\s*(?:in-depth\s+)?reviews?/i);
    if (reviewMatch) {
      stats.reviewCount = parseInt(reviewMatch[1]);
    }

    // Look for statement count - typically "84 statements"
    const statementMatch = reviewText.match(/(\d+)\s*statements?/i);
    if (statementMatch) {
      stats.statementCount = parseInt(statementMatch[1]);
    }

    // Look for photo count - typically "131 community photos" or "108 photos"
    const photoMatch = reviewText.match(/(\d+)\s*(?:community\s+)?photos?/i);
    if (photoMatch) {
      stats.photoCount = parseInt(photoMatch[1]);
    }

    logger.debug(`Extracted community stats:`, stats);
    return stats;
  }

  private extractRanking($: cheerio.CheerioAPI): {
    rank?: number;
    rankCategory?: string;
  } {
    const ranking = {
      rank: undefined as number | undefined,
      rankCategory: undefined as string | undefined,
    };

    // Look for ranking text - typically "Ranked #26 in Men's Perfume"
    const rankText = $('body').text();
    const rankMatch = rankText.match(/Ranked\s+#?(\d+)\s+in\s+([^\n.]+)/i);
    if (rankMatch) {
      ranking.rank = parseInt(rankMatch[1]);
      // Clean up category: trim whitespace and remove trailing digits
      ranking.rankCategory = rankMatch[2].trim().replace(/\s+\d+$/, '');
    }

    logger.debug(`Extracted ranking:`, ranking);
    return ranking;
  }

  private extractPerfumer($: cheerio.CheerioAPI): string | undefined {
    // Look for perfumer info - multiple possible locations
    let perfumer: string | undefined;

    // Strategy 1: Look for "Perfumer:" label
    $('body').find('*').each((_, elem) => {
      const text = $(elem).text();
      if (text.includes('Perfumer:')) {
        const match = text.match(/Perfumer:\s*([^,\n]+)/i);
        if (match) {
          perfumer = match[1].trim();
          return false; // Stop iteration
        }
      }
      return; // Continue iteration
    });

    // Strategy 2: Look for specific perfumer class or attribute
    if (!perfumer) {
      perfumer = this.extractText($, '.perfumer, [itemprop="creator"]');
    }

    logger.debug(`Extracted perfumer: ${perfumer || 'undefined'}`);
    return perfumer;
  }

  private parseRating(text: string): number | undefined {
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
      return;
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