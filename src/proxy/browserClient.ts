import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import proxyManager from './proxyManager';
import logger from '../utils/logger';
import config from '../config/config';

// Add stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

class BrowserClient {
  private browser: Browser | null = null;
  private activePage: Page | null = null;
  private sessionId: string | null = null;

  /**
   * Generate a random session ID for sticky sessions
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get or create a browser instance with proxy configuration
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      const proxyConfig = await proxyManager.getProxyConfig();

      // Generate a session ID for sticky sessions (same IP across requests)
      if (!this.sessionId) {
        this.sessionId = this.generateSessionId();
      }

      // Format username for Decodo with geo-targeting and session
      // Format: user-{username}-country-{country}-session-{sessionId}
      const formattedUsername = `user-${proxyConfig.username}-country-${config.decodo.proxyCountry}-session-${this.sessionId}`;

      // Store credentials for page authentication
      const proxyAuth = {
        username: formattedUsername,
        password: proxyConfig.password,
      };

      logger.info(`Launching browser with proxy: ${proxyConfig.endpoint}:${proxyConfig.port} (country: ${config.decodo.proxyCountry})`);

      this.browser = await puppeteerExtra.launch({
        headless: true,
        args: [
          `--proxy-server=http://${proxyConfig.endpoint}:${proxyConfig.port}`,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080',
        ],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });

      // Store auth credentials for use in getPage()
      (this.browser as any).proxyAuth = proxyAuth;

      logger.info('Browser launched successfully');
    }

    return this.browser;
  }

  /**
   * Get or create a page
   */
  private async getPage(): Promise<Page> {
    const browser = await this.getBrowser();

    if (!this.activePage || this.activePage.isClosed()) {
      this.activePage = await browser.newPage();

      // Authenticate with proxy if credentials are available
      const proxyAuth = (browser as any).proxyAuth;
      if (proxyAuth) {
        await this.activePage.authenticate({
          username: proxyAuth.username,
          password: proxyAuth.password,
        });
        logger.debug('Page authenticated with proxy credentials');
      }

      // Set user agent
      await this.activePage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Set additional headers
      await this.activePage.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      });

      logger.debug('New page created');
    }

    return this.activePage;
  }

  /**
   * Navigate to a URL and return the HTML content
   */
  async getPageContent(url: string, waitForSelector?: string): Promise<string> {
    try {
      const page = await this.getPage();

      logger.debug(`Navigating to: ${url}`);

      // Navigate with timeout
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      // Optionally wait for a specific selector to ensure page is loaded
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }

      // Get the HTML content
      const html = await page.content();

      // Check if we got a Cloudflare challenge page
      const title = await page.title();
      if (title.includes('Just a moment') || title.includes('Attention Required')) {
        logger.warn('Detected Cloudflare challenge page, waiting for resolution...');

        // Wait a bit longer for Cloudflare to resolve
        await page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: 30000
        }).catch(() => {
          // If navigation doesn't happen, that's OK - page might have resolved in place
          logger.debug('No navigation after Cloudflare challenge, checking content...');
        });

        // Get content after challenge
        const resolvedHtml = await page.content();
        const resolvedTitle = await page.title();

        if (resolvedTitle.includes('Just a moment') || resolvedTitle.includes('Attention Required')) {
          throw new Error('Failed to bypass Cloudflare challenge');
        }

        logger.info('Successfully bypassed Cloudflare challenge');
        return resolvedHtml;
      }

      logger.debug(`Successfully retrieved content from: ${url}`);
      return html;
    } catch (error: any) {
      logger.error(`Browser navigation error for ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * Reset the browser (useful when rotating proxies)
   */
  async reset(): Promise<void> {
    try {
      if (this.activePage && !this.activePage.isClosed()) {
        await this.activePage.close();
        this.activePage = null;
      }

      if (this.browser && this.browser.connected) {
        await this.browser.close();
        this.browser = null;
      }

      // Reset session ID to get a new IP on next request
      this.sessionId = null;

      logger.info('Browser client reset - will use new proxy on next request');
    } catch (error) {
      logger.error('Error resetting browser:', error);
    }
  }

  /**
   * Test the proxy connection with the browser
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test with IP check service
      const html = await this.getPageContent('https://ip.decodo.com/');
      logger.info(`Browser proxy test successful. Response length: ${html.length}`);
      return true;
    } catch (error) {
      logger.error('Browser proxy test failed:', error);
      return false;
    }
  }

  /**
   * Add delay between requests to avoid rate limiting
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Close all browser resources
   */
  async close(): Promise<void> {
    await this.reset();
  }
}

export default new BrowserClient();
