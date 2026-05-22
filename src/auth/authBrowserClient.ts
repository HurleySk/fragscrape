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

let sharedBrowser: Browser | null = null;
let browserAuthenticated = false;

async function ensureBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.connected) return sharedBrowser;
  browserAuthenticated = false;

  sharedBrowser = await puppeteerExtra.launch({
    userDataDir: PROFILE_DIR,
    headless: false,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1,1',
      '--window-position=-32000,-32000',
    ],
  });

  sharedBrowser.on('disconnected', () => {
    sharedBrowser = null;
    browserAuthenticated = false;
  });

  return sharedBrowser;
}

async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    return await page.evaluate(() => {
      const loginBtn = document.querySelector('#login-btn');
      if (loginBtn) return false;
      const myParfumo = document.querySelector('.icon-my-parfumo, .nick_name');
      if (myParfumo) return true;
      const logoutLink = document.querySelector('a[href*="logout"]');
      if (logoutLink) return true;
      return false;
    });
  } catch {
    return false;
  }
}

async function getUsername(page: Page): Promise<string | null> {
  try {
    return await page.evaluate(() => {
      const nick = document.querySelector('.nick_name');
      if (nick) return nick.textContent?.trim()?.replace(/\s*$/, '') || null;
      const myParfumo = document.querySelector('.icon-my-parfumo img[alt]');
      if (myParfumo) return myParfumo.getAttribute('alt') || null;
      return null;
    });
  } catch {
    return null;
  }
}

async function dismissCookieConsent(page: Page): Promise<void> {
  try {
    const iframeEl = await page.$('iframe[id^="sp_message_iframe"]');
    if (!iframeEl) return;
    const frame = await iframeEl.contentFrame();
    if (!frame) return;
    for (const sel of ['button[title="Accept"]', 'button.sp_choice_type_11']) {
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

export class AuthBrowserClient {
  async launchLoginBrowser(): Promise<{ username: string | null }> {
    if (sharedBrowser && sharedBrowser.connected) {
      try { await sharedBrowser.close(); } catch {}
      sharedBrowser = null;
      browserAuthenticated = false;
    }

    logger.info('Launching visible browser for Parfumo login...');

    sharedBrowser = await puppeteerExtra.launch({
      userDataDir: PROFILE_DIR,
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
    });

    sharedBrowser.on('disconnected', () => {
      sharedBrowser = null;
      browserAuthenticated = false;
    });

    const pages = await sharedBrowser.pages();
    const page = pages[0] || await sharedBrowser.newPage();

    await page.goto(PARFUMO_URLS.login, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });

    await dismissCookieConsent(page);

    if (await isLoggedIn(page)) {
      const username = await getUsername(page);
      logger.info(`Already logged in as: ${username || 'unknown'}`);
      browserAuthenticated = true;
      return { username };
    }

    logger.info('Waiting for user to log in (timeout: 5 minutes)...');

    const loginTimeout = config.parfumo.loginTimeoutMs;
    const pollInterval = 3000;
    const startTime = Date.now();
    let loggedIn = false;

    while (Date.now() - startTime < loginTimeout) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      try {
        loggedIn = await isLoggedIn(page);
        if (loggedIn) break;
      } catch {
        try {
          const currentPages = await sharedBrowser.pages();
          const currentPage = currentPages[currentPages.length - 1];
          await currentPage.waitForSelector('body', { timeout: 5000 });
          loggedIn = await isLoggedIn(currentPage);
          if (loggedIn) break;
        } catch (err) {
          logger.debug(`Login poll error: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    if (!loggedIn) {
      throw new ParfumoUIError('Login timed out - user did not complete login within the timeout period');
    }

    browserAuthenticated = true;
    const username = await getUsername(page);
    logger.info(`Login successful for user: ${username || 'unknown'}`);

    return { username };
  }

  async getAuthenticatedPage(url: string): Promise<{ page: Page; browser: Browser }> {
    const browser = await ensureBrowser();

    const page = await browser.newPage();

    const timeout = config.parfumo.actionTimeoutMs;
    await page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: Math.max(timeout, 60000),
    });

    await dismissCookieConsent(page);

    const loggedIn = await isLoggedIn(page);
    logger.info(`getAuthenticatedPage: isLoggedIn=${loggedIn} url=${page.url()} browserAuth=${browserAuthenticated}`);
    if (!loggedIn) {
      await page.close();
      throw new SessionExpiredError();
    }
    browserAuthenticated = true;

    return { page, browser };
  }

  async verifySession(): Promise<boolean> {
    try {
      const { page } = await this.getAuthenticatedPage(PARFUMO_URLS.login);
      const loggedIn = await isLoggedIn(page);
      await page.close();
      return loggedIn;
    } catch (error) {
      if (error instanceof SessionExpiredError) return false;
      throw error;
    }
  }

  async closeBrowser(): Promise<void> {
    const browser = sharedBrowser;
    if (!browser || !browser.connected) return;
    const pages = await browser.pages();
    for (const p of pages) {
      if (p.url() !== 'about:blank') {
        await p.close().catch(() => {});
      }
    }
  }
}
