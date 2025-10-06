/**
 * Base interface for all proxy clients
 * Defines common methods that all proxy implementations must support
 */
export interface BaseProxyClient {
  /**
   * Reset the client connection (useful when rotating proxies)
   */
  reset(): Promise<void>;

  /**
   * Test the proxy connection
   */
  testConnection(): Promise<boolean>;

  /**
   * Add delay between requests to avoid rate limiting
   */
  delay(ms: number): Promise<void>;
}

/**
 * HTTP proxy client interface for making HTTP requests through a proxy
 */
export interface IHttpClient extends BaseProxyClient {
  /**
   * Perform a GET request through the proxy
   */
  get(url: string, config?: any): Promise<any>;

  /**
   * Perform a POST request through the proxy
   */
  post(url: string, data?: any, config?: any): Promise<any>;
}

/**
 * Browser proxy client interface for browser-based scraping through a proxy
 */
export interface IBrowserClient extends BaseProxyClient {
  /**
   * Navigate to a URL and return the HTML content
   */
  getPageContent(url: string, waitForSelector?: string): Promise<string>;

  /**
   * Close all browser resources
   */
  close(): Promise<void>;
}
