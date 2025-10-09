import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import proxyManager from './proxyManager';
import logger from '../utils/logger';
import config from '../config/config';
import { ScraperError } from '../api/middleware/errorHandler';
import { IBrowserClient } from './types';
import { retryWithBackoff } from '../utils/retry';
import { BaseProxyClient } from './BaseProxyClient';
import { TIMEOUT_CONFIG, RETRY_CONFIG } from '../constants/scraping';

// Add stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

class BrowserClient extends BaseProxyClient implements IBrowserClient {
  private browser: Browser | null = null;
  private activePage: Page | null = null;

  /**
   * Get or create a browser instance with proxy configuration
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.connected) {
      // Get or create session ID
      const sessionId = this.getSessionId();

      // Get proxy config with formatted username (includes session and country)
      const proxyConfig = await proxyManager.getProxyConfig({ sessionId });

      // Store credentials for page authentication
      const proxyAuth = {
        username: proxyConfig.username,
        password: proxyConfig.password,
      };

      logger.info(`Launching browser with proxy: ${proxyConfig.endpoint}:${proxyConfig.port} (session: ${sessionId})`);

      const launchOptions: any = {
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
      };

      // Use custom executable path if configured (useful for ARM64 or custom Chrome installations)
      if (config.browser.executablePath) {
        launchOptions.executablePath = config.browser.executablePath;
      }

      this.browser = await puppeteerExtra.launch(launchOptions);

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
   * Validate that the loaded page matches the requested URL
   * Prevents browser session pollution where wrong pages are loaded
   */
  private validatePageContent(html: string, requestedUrl: string): { isValid: boolean; actualUrl?: string; message?: string } {
    try {
      const $ = cheerio.load(html);

      // Extract og:url from page metadata
      const ogUrl = $('meta[property="og:url"]').attr('content');

      if (!ogUrl) {
        logger.warn('No og:url found in page, cannot validate');
        return { isValid: true }; // Assume valid if no og:url present
      }

      // Extract brand and name from both URLs (format: /Perfumes/Brand_Name/perfume_name)
      const extractBrandAndName = (urlStr: string): { brand: string; name: string } | null => {
        try {
          const urlParts = urlStr.split('/');
          if (urlParts.length < 6) return null;

          const brand = urlParts[4].replace(/_/g, ' ').toLowerCase().trim();
          const nameWithYear = urlParts[5];
          // Remove year suffix (e.g., _2015) if present
          const name = nameWithYear.replace(/_\d{4}$/, '').replace(/_/g, ' ').toLowerCase().trim();

          return { brand, name };
        } catch (error) {
          return null;
        }
      };

      const requested = extractBrandAndName(requestedUrl);
      const actual = extractBrandAndName(ogUrl);

      if (!requested || !actual) {
        logger.warn('Could not extract brand/name from URLs for validation');
        return { isValid: true }; // Assume valid if we can't parse
      }

      // Compare brand and name (case-insensitive)
      const isValid = requested.brand === actual.brand && requested.name === actual.name;

      if (!isValid) {
        return {
          isValid: false,
          actualUrl: ogUrl,
          message: `Page mismatch! Requested: ${requested.brand}/${requested.name}, Got: ${actual.brand}/${actual.name}`
        };
      }

      logger.debug(`Page validation passed: ${requested.brand}/${requested.name}`);
      return { isValid: true };
    } catch (error) {
      logger.error('Error validating page content:', error);
      return { isValid: true }; // On error, assume valid to avoid false positives
    }
  }

  /**
   * Navigate to a URL and return the HTML content with retry logic
   */
  async getPageContent(url: string, waitForSelector?: string): Promise<string> {
    return retryWithBackoff(async () => {
      try {
        const page = await this.getPage();

        logger.debug(`Navigating to: ${url}`);

        // Navigate with timeout
        await page.goto(url, {
          waitUntil: 'networkidle2',
          timeout: TIMEOUT_CONFIG.BROWSER_NAVIGATION,
        });

        // Optionally wait for a specific selector to ensure page is loaded
        if (waitForSelector) {
          try {
            await page.waitForSelector(waitForSelector, { timeout: TIMEOUT_CONFIG.BROWSER_SELECTOR_WAIT });
            logger.debug(`Selector found: ${waitForSelector}`);
          } catch (selectorError) {
            // Selector didn't appear in time, but page might still be loaded
            // Log warning and continue - networkidle2 already waited for page load
            logger.warn(`Selector '${waitForSelector}' not found within timeout, continuing anyway`);
          }
          // Add extra delay to let JavaScript finish rendering all content
          await new Promise(resolve => setTimeout(resolve, 2000));
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
            timeout: TIMEOUT_CONFIG.CLOUDFLARE_CHALLENGE
          }).catch(() => {
            // If navigation doesn't happen, that's OK - page might have resolved in place
            logger.debug('No navigation after Cloudflare challenge, checking content...');
          });

          // Get content after challenge
          const resolvedHtml = await page.content();
          const resolvedTitle = await page.title();

          if (resolvedTitle.includes('Just a moment') || resolvedTitle.includes('Attention Required')) {
            throw new ScraperError('Failed to bypass Cloudflare challenge', url);
          }

          logger.info('Successfully bypassed Cloudflare challenge');

          // Validate page content matches requested URL (for Parfumo perfume URLs)
          if (url.includes('/Perfumes/')) {
            const validation = this.validatePageContent(resolvedHtml, url);
            if (!validation.isValid) {
              logger.error(`❌ ${validation.message}`);
              logger.error(`Expected URL: ${url}`);
              logger.error(`Actual URL: ${validation.actualUrl}`);
              logger.info('🔄 Resetting entire browser to clear session pollution...');
              await this.reset();
              const error: any = new ScraperError('Page content mismatch - browser session polluted', url);
              error.code = 'PAGE_MISMATCH';
              throw error;
            }
          }

          return resolvedHtml;
        }

        // Validate page content matches requested URL (for Parfumo perfume URLs)
        if (url.includes('/Perfumes/')) {
          const validation = this.validatePageContent(html, url);
          if (!validation.isValid) {
            logger.error(`❌ ${validation.message}`);
            logger.error(`Expected URL: ${url}`);
            logger.error(`Actual URL: ${validation.actualUrl}`);
            logger.info('🔄 Resetting entire browser to clear session pollution...');
            await this.reset();
            const error: any = new ScraperError('Page content mismatch - browser session polluted', url);
            error.code = 'PAGE_MISMATCH';
            throw error;
          }
        }

        logger.debug(`Successfully retrieved content from: ${url}`);
        return html;
      } catch (error: any) {
        logger.error(`Browser navigation error for ${url}:`, error.message);
        throw error;
      }
    }, { maxRetries: RETRY_CONFIG.BROWSER_MAX_RETRIES });
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

      this.resetSessionId();

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
   * Close all browser resources
   */
  async close(): Promise<void> {
    await this.reset();
  }
}

export default new BrowserClient();
