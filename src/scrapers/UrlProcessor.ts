import { RELEVANCE_SCORES } from '../constants/scraping';

/**
 * Processes and validates Parfumo URLs
 */
export class UrlProcessor {
  /**
   * Validates that a URL follows the expected Parfumo perfume URL pattern
   * Expected: /Perfumes/{brand}/{name} or https://www.parfumo.com/Perfumes/{brand}/{name}
   */
  isValidPerfumeUrl(url: string): boolean {
    if (!url) return false;

    const path = url.startsWith('http') ? new URL(url).pathname : url;
    const perfumePattern = /^\/Perfumes\/[^/]+\/[^/]+/;
    return perfumePattern.test(path);
  }

  /**
   * Extract year from perfume name if present
   * Returns tuple of [cleanedName, year]
   */
  extractYear(name: string): [string, number | undefined] {
    const yearMatch = name.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0], 10);
      const cleanedName = name.replace(/\s*\d{4}\s*$/, '').trim();
      return [cleanedName, year];
    }
    return [name, undefined];
  }

  /**
   * Clean and capitalize perfume name
   */
  cleanPerfumeName(name: string): string {
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
  processPerfumeName(rawName: string): [string, number | undefined] {
    let name = rawName.replace(/_/g, ' ');
    const [nameWithoutYear, year] = this.extractYear(name);
    const cleanedName = this.cleanPerfumeName(nameWithoutYear);
    return [cleanedName, year];
  }

  /**
   * Calculate relevance score for a perfume result based on how well it matches the search query
   * Returns a score from 0-100, higher is more relevant
   */
  calculateRelevance(query: string, brand: string, name: string): number {
    const queryLower = query.toLowerCase().trim();
    const brandLower = brand.toLowerCase().trim();
    const nameLower = name.toLowerCase().trim();
    const combined = `${brandLower} ${nameLower}`;

    let score = 0;

    // Exact match (brand + name)
    if (combined === queryLower) {
      return RELEVANCE_SCORES.EXACT_COMBINED;
    }

    // Exact brand match
    if (brandLower === queryLower) {
      score += RELEVANCE_SCORES.EXACT_BRAND;
    }

    // Exact name match
    if (nameLower === queryLower) {
      score += RELEVANCE_SCORES.EXACT_NAME;
    }

    // Query words that appear in brand or name
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
    const combinedWords = combined.split(/\s+/);

    queryWords.forEach(queryWord => {
      if (brandLower.includes(queryWord)) {
        score += RELEVANCE_SCORES.BRAND_CONTAINS_WORD;
      }

      if (nameLower.includes(queryWord)) {
        score += RELEVANCE_SCORES.NAME_CONTAINS_WORD;
      }

      if (combinedWords.some(w => w.startsWith(queryWord))) {
        score += RELEVANCE_SCORES.WORD_STARTS_WITH;
      }
    });

    // Bonus: Combined contains full query as substring
    if (combined.includes(queryLower)) {
      score += RELEVANCE_SCORES.CONTAINS_FULL_QUERY;
    }

    return Math.min(score, RELEVANCE_SCORES.EXACT_COMBINED);
  }
}
