import * as cheerio from 'cheerio';
import httpClient from '../proxy/httpClient';
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
      await httpClient.delay(1000 + Math.random() * 1000);

      const html = await httpClient.get(searchUrl);
      const $ = cheerio.load(html);

      const results: SearchResult[] = [];

      // Parse search results
      $('.perfume-box, .search-result-item').each((index, element) => {
        if (index >= limit) return false;

        const $elem = $(element);

        // Extract perfume details from search results
        const nameElement = $elem.find('.perfume-name, h3 a, .name');
        const brandElement = $elem.find('.perfume-brand, .brand');
        const ratingElement = $elem.find('.rating, .perfume-rating');
        const imageElement = $elem.find('img');

        const name = nameElement.text().trim();
        const brand = brandElement.text().trim();
        const href = nameElement.attr('href') || $elem.find('a').first().attr('href');

        if (name && brand && href) {
          const result: SearchResult = {
            name,
            brand,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            rating: this.parseRating(ratingElement.text()),
            imageUrl: this.extractImageUrl(imageElement.attr('src') || imageElement.attr('data-src')),
          };

          // Try to extract year from name or other elements
          const yearMatch = name.match(/\b(19|20)\d{2}\b/);
          if (yearMatch) {
            result.year = parseInt(yearMatch[0]);
          }

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
      await httpClient.delay(1500 + Math.random() * 1500);

      const html = await httpClient.get(fullUrl);
      const $ = cheerio.load(html);

      // Extract basic information
      const name = this.extractText($, '.perfume-name, h1, .name-main');
      const brand = this.extractText($, '.perfume-brand, .brand-name, .brand');
      const concentration = this.extractText($, '.concentration, .perfume-concentration');
      const gender = this.extractGender($);
      const description = this.extractText($, '.description, .perfume-description, .main-description');

      // Extract year
      let year: number | undefined;
      const yearText = this.extractText($, '.year, .release-year');
      if (yearText) {
        const yearMatch = yearText.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
          year = parseInt(yearMatch[0]);
        }
      }

      // Extract notes
      const notes = this.extractNotes($);

      // Extract accords
      const accords = this.extractAccords($);

      // Extract ratings
      const rating = this.extractRating($);
      const totalRatings = this.extractTotalRatings($);

      // Extract performance metrics
      const longevity = this.extractMetric($, '.longevity, .perfume-longevity');
      const sillage = this.extractMetric($, '.sillage, .perfume-sillage');
      const priceValue = this.extractMetric($, '.price-value, .value');

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
        rating,
        totalRatings,
        longevity,
        sillage,
        priceValue,
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

      await httpClient.delay(1000 + Math.random() * 1000);

      const html = await httpClient.get(brandUrl);
      const $ = cheerio.load(html);

      const results: SearchResult[] = [];

      $('.perfume-item, .brand-perfume').each((_, element) => {
        const $elem = $(element);
        const name = this.extractText($elem, '.name, .perfume-name');
        const href = $elem.find('a').first().attr('href');

        if (name && href) {
          results.push({
            name,
            brand,
            url: href.startsWith('http') ? href : `${this.baseUrl}${href}`,
            rating: this.parseRating($elem.find('.rating').text()),
          });
        }
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
    const elem = $ === cheerio ? $(selector) : $.find(selector);
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

    // Top notes
    $('.top-notes .note, .notes-top .note, [class*="top"] .note').each((_, elem) => {
      const note = $(elem).text().trim();
      if (note) notes.top.push(note);
    });

    // Heart/middle notes
    $('.heart-notes .note, .middle-notes .note, .notes-heart .note, [class*="heart"] .note, [class*="middle"] .note').each((_, elem) => {
      const note = $(elem).text().trim();
      if (note) notes.heart.push(note);
    });

    // Base notes
    $('.base-notes .note, .notes-base .note, [class*="base"] .note').each((_, elem) => {
      const note = $(elem).text().trim();
      if (note) notes.base.push(note);
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

  private extractRating($: cheerio.CheerioAPI): number | undefined {
    const ratingText = this.extractText($, '.rating-value, .perfume-rating, .overall-rating');
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
    const text = this.extractText($, '.rating-count, .total-ratings, .votes');
    const match = text.match(/(\d+)/);
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
    const img = $('.perfume-image img, .main-image img, .perfume-bottle img, img.perfume').first();
    return this.extractImageUrl(img.attr('src') || img.attr('data-src'));
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