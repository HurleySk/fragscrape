import * as cheerio from 'cheerio';
import browserClient from '../proxy/browserClient';
import logger from '../utils/logger';
import config from '../config/config';
import { Perfume, SearchResult } from '../types';
import { HtmlExtractor } from './HtmlExtractor';
import { UrlProcessor } from './UrlProcessor';
import { SCRAPING_DELAYS, getRandomDelay, RELEVANCE_SCORES, LIMITS } from '../constants/scraping';

class ParfumoScraper {
  private htmlExtractor = new HtmlExtractor();
  private urlProcessor = new UrlProcessor();

  private get baseUrl(): string {
    return config.scraper.baseUrl;
  }

  /**
   * Search for perfumes on Parfumo
   */
  async search(query: string, limit: number = LIMITS.DEFAULT_SEARCH_LIMIT): Promise<SearchResult[]> {
    try {
      const searchUrl = `${this.baseUrl}/s_perfumes_x.php?in=1&order=&filter=${encodeURIComponent(query)}`;
      logger.info(`Searching Parfumo for: ${query}`);

      // Add delay to be respectful
      await browserClient.delay(getRandomDelay(SCRAPING_DELAYS.SEARCH_MIN, SCRAPING_DELAYS.SEARCH_MAX));

      const html = await browserClient.getPageContent(searchUrl);

      // Debug: Save HTML to file for inspection
      if (process.env.DEBUG_HTML === 'true') {
        const fs = await import('fs/promises');
        const debugPath = `./debug_search_${query.replace(/\s+/g, '_')}.html`;
        await fs.writeFile(debugPath, html);
        logger.debug(`Saved HTML to: ${debugPath}`);
      }

      const $ = cheerio.load(html);

      type ResultWithScore = SearchResult & { relevance: number };
      const results: ResultWithScore[] = [];
      const seenUrls = new Set<string>();

      // Try multiple selector strategies
      const selectors = [
        '.name > a',
        '.name a:first-of-type',
        '#main .name > a',
        '.search-results .name > a',
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

            // Validate perfume URL
            if (!this.urlProcessor.isValidPerfumeUrl(fullUrl)) {
              logger.debug(`Skipping invalid URL pattern: ${fullUrl}`);
              return;
            }

            // Skip duplicates
            if (seenUrls.has(fullUrl)) return;
            seenUrls.add(fullUrl);

            // Parse brand and name from URL
            const urlParts = fullUrl.split('/');
            const brand = urlParts[4].replace(/_/g, ' ');
            const [name, year] = this.urlProcessor.processPerfumeName(urlParts[5]);

            // Calculate relevance score
            const relevanceScore = this.urlProcessor.calculateRelevance(query, brand, name);

            // Filter out very low relevance results
            if (relevanceScore < RELEVANCE_SCORES.MIN_RELEVANCE) {
              logger.debug(`Filtering out low relevance result: ${brand} - ${name} (score: ${relevanceScore})`);
              return;
            }

            // Get parent container for additional info
            const $container = $link.closest('div, li, article');

            // Find image
            const $imageElement = $container.find('img').first();
            const imageUrl = this.htmlExtractor.extractImageUrl(
              $imageElement.attr('src') || $imageElement.attr('data-src'),
              this.baseUrl
            );

            // Find rating if available
            const $ratingElement = $container.find('.rating, .stars, [class*="rating"]');
            const rating = this.htmlExtractor.parseRating($ratingElement.text());

            if (name && brand) {
              const result: ResultWithScore = {
                name,
                brand,
                url: fullUrl,
                year,
                rating,
                imageUrl,
                relevance: relevanceScore,
              };

              results.push(result);
              logger.debug(`Added result: ${brand} - ${name} (relevance: ${relevanceScore})`);
            }
            return;
          });

          if (results.length > 0) break;
        }
      }

      if (!foundResults) {
        logger.warn(`No elements found with any search selector for query: ${query}`);
      }

      // Sort results by relevance score (highest first)
      results.sort((a, b) => b.relevance - a.relevance);

      // Remove relevance field before returning
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
      await browserClient.delay(getRandomDelay(SCRAPING_DELAYS.DETAILS_MIN, SCRAPING_DELAYS.DETAILS_MAX));

      // Get page content and wait for rating containers to appear (indicates JavaScript has fully rendered)
      // We wait for both the rating value and durability selector to ensure full page load
      const html = await browserClient.getPageContent(fullUrl, '[itemprop="aggregateRating"]');

      // Debug: Always save HTML to file for inspection (helps compare with known-good HTML)
      const fs = await import('fs/promises');
      const brandSlug = fullUrl.split('/')[4];
      const nameSlug = fullUrl.split('/')[5];
      const timestamp = Date.now();
      const debugPath = `./debug_live_${brandSlug}_${nameSlug}_${timestamp}.html`;
      await fs.writeFile(debugPath, html);
      logger.info(`💾 Saved live HTML to: ${debugPath}`);

      const $ = cheerio.load(html);

      // Extract brand and name from URL (most reliable method)
      const urlParts = fullUrl.split('/');
      let brand = '';
      let name = '';
      let year: number | undefined;

      if (urlParts.length >= 6) {
        brand = urlParts[4].replace(/_/g, ' ');
        [name, year] = this.urlProcessor.processPerfumeName(urlParts[5]);
      }

      // Extract other information
      const concentration = this.htmlExtractor.extractText($, '.concentration, .perfume-concentration, .type');
      const gender = this.htmlExtractor.extractGender($);
      logger.debug(`Extracted gender for ${brand} - ${name}: ${gender || 'undefined'}`);
      const description = this.htmlExtractor.extractText($, '.description, .perfume-description, .main-description, p.desc');

      // Extract notes
      const notes = this.htmlExtractor.extractNotes($);

      // Extract accords
      const accords = this.htmlExtractor.extractAccords($);

      // Extract all rating dimensions
      const ratings = this.htmlExtractor.extractAllRatings($);

      // Debug: Save HTML if rating extraction failed
      const hasRatingFailures = !ratings.longevity || !ratings.sillage || !ratings.bottle || !ratings.priceValue;
      if (hasRatingFailures) {
        const fs = await import('fs/promises');
        const brandSlug = fullUrl.split('/')[4];
        const nameSlug = fullUrl.split('/')[5];
        const timestamp = Date.now();
        const debugPath = `./debug_failed_${brandSlug}_${nameSlug}_${timestamp}.html`;
        await fs.writeFile(debugPath, html);
        logger.warn(`⚠️  Rating extraction failed - HTML saved to: ${debugPath}`);
        logger.warn(`Missing ratings: ${!ratings.longevity ? 'longevity ' : ''}${!ratings.sillage ? 'sillage ' : ''}${!ratings.bottle ? 'bottle ' : ''}${!ratings.priceValue ? 'priceValue' : ''}`);
      }

      // Extract image
      const imageUrl = this.htmlExtractor.extractMainImage($, this.baseUrl);

      // Extract similar fragrances
      const similarFragrances = this.htmlExtractor.extractSimilarFragrances($, LIMITS.MAX_SIMILAR_FRAGRANCES);

      // Extract community stats
      const communityStats = this.htmlExtractor.extractCommunityStats($);

      // Extract ranking
      const ranking = this.htmlExtractor.extractRanking($);

      // Extract perfumer
      const perfumer = this.htmlExtractor.extractPerfumer($);

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

      await browserClient.delay(getRandomDelay(SCRAPING_DELAYS.BRAND_MIN, SCRAPING_DELAYS.BRAND_MAX));

      const html = await browserClient.getPageContent(brandUrl);
      const $ = cheerio.load(html);

      const results: SearchResult[] = [];
      const seenUrls = new Set<string>();

      $('.name').each((_, element) => {
        const $nameElement = $(element);
        const $nameLink = $nameElement.find('a');
        const href = $nameLink.attr('href');

        if (!href) return;

        const fullUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;

        // Skip duplicates
        if (seenUrls.has(fullUrl)) return;
        seenUrls.add(fullUrl);

        // Parse from URL
        const urlParts = fullUrl.split('/');
        if (urlParts.length < 6) return;

        const extractedBrand = urlParts[4].replace(/_/g, ' ');
        const [name, year] = this.urlProcessor.processPerfumeName(urlParts[5]);

        // Try to find rating
        const $container = $nameElement.closest('div');
        const $ratingElement = $container.find('.rating, .stars, [class*="rating"]');
        const rating = this.htmlExtractor.parseRating($ratingElement.text());

        // Find image
        const $imageElement = $container.find('img').first();
        const imageUrl = this.htmlExtractor.extractImageUrl(
          $imageElement.attr('src') || $imageElement.attr('data-src'),
          this.baseUrl
        );

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
}

export default new ParfumoScraper();
