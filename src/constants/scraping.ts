/**
 * Constants for scraping delays and retry configurations
 */

export const SCRAPING_DELAYS = {
  // Search page delays (ms)
  SEARCH_MIN: 1000,
  SEARCH_MAX: 2000,
  SEARCH_RANGE: 1000,

  // Details page delays (ms)
  DETAILS_MIN: 1500,
  DETAILS_MAX: 3000,
  DETAILS_RANGE: 1500,

  // Brand page delays (ms)
  BRAND_MIN: 1000,
  BRAND_MAX: 2000,
  BRAND_RANGE: 1000,
};

export const RETRY_CONFIG = {
  // Browser operations (expensive, fewer retries)
  BROWSER_MAX_RETRIES: 2,

  // HTTP operations (cheaper, more retries)
  HTTP_MAX_RETRIES: 3,
};

export const TIMEOUT_CONFIG = {
  // HTTP request timeout (ms)
  HTTP_TIMEOUT: 30000,

  // Browser navigation timeout (ms)
  BROWSER_NAVIGATION: 60000,

  // Browser selector wait timeout (ms)
  BROWSER_SELECTOR_WAIT: 10000,

  // Cloudflare challenge timeout (ms)
  CLOUDFLARE_CHALLENGE: 30000,

  // Decodo API timeout (ms)
  DECODO_API_TIMEOUT: 10000,

  // Graceful shutdown timeout (ms)
  GRACEFUL_SHUTDOWN: 10000,
};

export const MONITORING_INTERVALS = {
  // Proxy usage check interval (ms)
  PROXY_USAGE_CHECK: 5 * 60 * 1000, // 5 minutes
};

export const RELEVANCE_SCORES = {
  // Exact match scores
  EXACT_COMBINED: 100,
  EXACT_BRAND: 50,
  EXACT_NAME: 50,

  // Partial match scores
  BRAND_CONTAINS_WORD: 10,
  NAME_CONTAINS_WORD: 15,
  WORD_STARTS_WITH: 20,
  CONTAINS_FULL_QUERY: 30,

  // Minimum relevance threshold
  MIN_RELEVANCE: 5,
};

export const LIMITS = {
  // Similar fragrances limit
  MAX_SIMILAR_FRAGRANCES: 10,

  // Default search results limit
  DEFAULT_SEARCH_LIMIT: 20,
};

/**
 * Helper function to get a random delay within a range
 */
export function getRandomDelay(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
