import { Browser, Page, Protocol } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import config from '../config/config';
import logger from '../utils/logger';
import { SessionExpiredError, ParfumoUIError, SessionNotConfiguredError } from '../api/middleware/errorHandler';
import { SessionManager } from './sessionManager';
import { ParfumoDb } from '../database/parfumoDb';
import { PARFUMO_SELECTORS, PARFUMO_URLS } from '../constants/parfumoSelectors';

puppeteerExtra.use(StealthPlugin());

export class AuthBrowserClient {
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(
    private sessionManager: SessionManager,
    private parfumoDb: ParfumoDb
  ) {}

  private getSessionKey(): string {
    const key = config.parfumo.sessionKey;
    if (!key) throw new SessionNotConfiguredError();
    return key;
  }

  async launchLoginBrowser(): Promise<{ username: string | null }> {
    this.getSessionKey();

    await this.closeBrowser();

    logger.info('Launching visible browser for Parfumo login...');

    const launchOptions: any = {
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280x800',
      ],
      defaultViewport: { width: 1280, height: 800 },
    };

    if (config.browser.executablePath) {
      launchOptions.executablePath = config.browser.executablePath;
    }

    this.browser = await puppeteerExtra.launch(launchOptions);
    this.page = await this.browser.newPage();

    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await this.page.goto(PARFUMO_URLS.login, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    logger.info('Waiting for user to log in (timeout: 5 minutes)...');

    const loginTimeout = config.parfumo.loginTimeoutMs;
    const pollInterval = 2000;
    const startTime = Date.now();
    let loggedIn = false;

    while (Date.now() - startTime < loginTimeout) {
      try {
        const profileEl = await this.page.$(PARFUMO_SELECTORS.login.profileIndicator);
        if (profileEl) {
          loggedIn = true;
          break;
        }
        const loginForm = await this.page.$(PARFUMO_SELECTORS.login.form);
        if (!loginForm) {
          loggedIn = true;
          break;
        }
      } catch {
        // Page may have navigated, continue polling
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (!loggedIn) {
      await this.closeBrowser();
      throw new ParfumoUIError('Login timed out — user did not complete login within the timeout period');
    }

    const cookies = await this.page.cookies();
    logger.info(`Captured ${cookies.length} cookies from Parfumo`);

    let username: string | null = null;
    try {
      const profileLink = await this.page.$(PARFUMO_SELECTORS.login.profileIndicator);
      if (profileLink) {
        username = await this.page.evaluate(el => el?.textContent?.trim() || null, profileLink);
      }
    } catch {
      logger.warn('Could not extract username from page');
    }

    const cookieData = cookies.map(c => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite,
    }));

    this.sessionManager.saveSession(cookieData, username);
    logger.info(`Session saved for user: ${username || 'unknown'}`);

    await this.closeBrowser();

    return { username };
  }

  async getAuthenticatedPage(url: string): Promise<{ page: Page; browser: Browser }> {
    const session = this.sessionManager.loadSession();
    if (!session) throw new SessionExpiredError();

    await this.closeBrowser();

    const launchOptions: any = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920x1080',
      ],
      defaultViewport: { width: 1920, height: 1080 },
    };

    if (config.browser.executablePath) {
      launchOptions.executablePath = config.browser.executablePath;
    }

    this.browser = await puppeteerExtra.launch(launchOptions);
    this.page = await this.browser.newPage();

    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await this.page.setCookie(...session.cookies as Protocol.Network.CookieParam[]);

    const timeout = config.parfumo.actionTimeoutMs;

    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout,
    });

    const loginForm = await this.page.$(PARFUMO_SELECTORS.login.form);
    if (loginForm) {
      await this.closeBrowser();
      throw new SessionExpiredError();
    }

    return { page: this.page, browser: this.browser };
  }

  async verifySession(): Promise<boolean> {
    try {
      const { page } = await this.getAuthenticatedPage(PARFUMO_URLS.settings);
      const profileEl = await page.$(PARFUMO_SELECTORS.login.profileIndicator);
      const isValid = profileEl !== null;

      if (isValid) {
        this.sessionManager.markVerified();
      }

      await this.closeBrowser();
      return isValid;
    } catch (error) {
      await this.closeBrowser();
      if (error instanceof SessionExpiredError) return false;
      throw error;
    }
  }

  async closeBrowser(): Promise<void> {
    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close();
      }
    } catch { /* ignore */ }
    this.page = null;

    try {
      if (this.browser && this.browser.connected) {
        await this.browser.close();
      }
    } catch { /* ignore */ }
    this.browser = null;
  }
}
