import { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import config from '../config/config';
import logger from '../utils/logger';
import { SessionExpiredError, ParfumoUIError } from '../api/middleware/errorHandler';
import { PARFUMO_URLS } from '../constants/parfumoSelectors';

puppeteerExtra.use(StealthPlugin());

const PROFILE_DIR = path.resolve(config.database.path, '..', 'chrome-profile');

export class AuthBrowserClient {
  private browser: Browser | null = null;
  private page: Page | null = null;

  private baseLaunchOptions(): any {
    const opts: any = {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        `--user-data-dir=${PROFILE_DIR}`,
      ],
    };
    if (config.browser.executablePath) {
      opts.executablePath = config.browser.executablePath;
    }
    return opts;
  }

  private async isLoggedIn(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const mobileAuth = document.querySelector('.mobile-menu-auth');
      if (mobileAuth) {
        const hasLoginBtn = !!mobileAuth.querySelector('a[href*="register"], #mobile-menu-login-btn');
        if (hasLoginBtn) return false;
      }
      const actionLinks = document.querySelectorAll('.pd-nav a');
      for (const link of actionLinks) {
        const href = link.getAttribute('href') || '';
        if (href.includes('/action/dologin')) return false;
      }
      const logoutLink = document.querySelector('a[href*="board/logout"], a[href*="action/logout"]');
      if (logoutLink) return true;
      if (actionLinks.length > 0) return true;
      return false;
    });
  }

  private async getUsername(page: Page): Promise<string | null> {
    return page.evaluate(() => {
      const mobileAuth = document.querySelector('.mobile-menu-auth');
      if (mobileAuth) {
        const profileLink = mobileAuth.querySelector('a[href*="/Users/"]');
        if (profileLink) return profileLink.textContent?.trim() || null;
      }
      const headerLink = document.querySelector('.header-wrapper a[href*="/Users/"]');
      if (headerLink) return headerLink.textContent?.trim() || null;
      return null;
    });
  }

  async launchLoginBrowser(): Promise<{ username: string | null }> {
    await this.closeBrowser();

    logger.info('Launching visible browser for Parfumo login...');

    this.browser = await puppeteerExtra.launch({
      ...this.baseLaunchOptions(),
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: [...this.baseLaunchOptions().args, '--window-size=1280,800'],
    });
    this.page = await this.browser.newPage();

    await this.page.goto(PARFUMO_URLS.login, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    await this.dismissCookieConsent();

    const alreadyLoggedIn = await this.isLoggedIn(this.page);
    if (alreadyLoggedIn) {
      const username = await this.getUsername(this.page);
      logger.info(`Already logged in as: ${username || 'unknown'}`);
      await this.closeBrowser();
      return { username };
    }

    logger.info('Waiting for user to log in (timeout: 5 minutes)...');

    const loginTimeout = config.parfumo.loginTimeoutMs;
    const pollInterval = 2000;
    const startTime = Date.now();
    let loggedIn = false;

    while (Date.now() - startTime < loginTimeout) {
      try {
        loggedIn = await this.isLoggedIn(this.page);
        if (loggedIn) break;
      } catch {
        // Page may have navigated
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (!loggedIn) {
      await this.closeBrowser();
      throw new ParfumoUIError('Login timed out — user did not complete login within the timeout period');
    }

    const username = await this.getUsername(this.page);
    logger.info(`Login successful for user: ${username || 'unknown'}`);
    await this.closeBrowser();

    return { username };
  }

  async getAuthenticatedPage(url: string): Promise<{ page: Page; browser: Browser }> {
    await this.closeBrowser();

    this.browser = await puppeteerExtra.launch({
      ...this.baseLaunchOptions(),
      headless: true,
      defaultViewport: { width: 1920, height: 1080 },
    });
    this.page = await this.browser.newPage();

    const timeout = config.parfumo.actionTimeoutMs;

    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: Math.max(timeout, 60000),
    });

    await this.dismissCookieConsent();

    const loggedIn = await this.isLoggedIn(this.page);
    if (!loggedIn) {
      await this.closeBrowser();
      throw new SessionExpiredError();
    }

    return { page: this.page, browser: this.browser };
  }

  async verifySession(): Promise<boolean> {
    try {
      const { page } = await this.getAuthenticatedPage(PARFUMO_URLS.login);
      const loggedIn = await this.isLoggedIn(page);
      await this.closeBrowser();
      return loggedIn;
    } catch (error) {
      await this.closeBrowser();
      if (error instanceof SessionExpiredError) return false;
      throw error;
    }
  }

  private async dismissCookieConsent(): Promise<void> {
    if (!this.page) return;
    try {
      const iframeSelector = 'iframe[id^="sp_message_iframe"]';
      const iframeEl = await this.page.$(iframeSelector);
      if (!iframeEl) return;

      const frame = await iframeEl.contentFrame();
      if (!frame) return;

      const acceptSelectors = [
        'button[title="Accept"]',
        'button.sp_choice_type_11',
      ];
      for (const sel of acceptSelectors) {
        try {
          await frame.waitForSelector(sel, { timeout: 3000 });
          await frame.click(sel);
          logger.debug('Dismissed cookie consent popup');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return;
        } catch { /* try next */ }
      }
    } catch {
      logger.debug('No cookie consent popup found');
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
