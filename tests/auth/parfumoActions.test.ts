import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { PARFUMO_SELECTORS } from '../../src/constants/parfumoSelectors';

const fixturePath = path.join(__dirname, '..', 'fixtures', 'parfumo-perfume-page.html');
const html = fs.readFileSync(fixturePath, 'utf-8');
const $ = cheerio.load(html);

describe('Parfumo selectors against HTML fixture', () => {
  describe('login selectors', () => {
    it('finds login form', () => {
      const el = $(PARFUMO_SELECTORS.login.form);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds username input', () => {
      const el = $(PARFUMO_SELECTORS.login.usernameInput);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds password input', () => {
      const el = $(PARFUMO_SELECTORS.login.passwordInput);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds mobile menu auth area', () => {
      const el = $(PARFUMO_SELECTORS.login.mobileMenuAuth);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds logout link when logged in', () => {
      const el = $(PARFUMO_SELECTORS.login.logoutLink);
      expect(el.length).toBeGreaterThan(0);
    });
  });

  describe('action nav selectors', () => {
    it('finds action nav container', () => {
      const el = $(PARFUMO_SELECTORS.actionNav.container);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds Collection link in action nav', () => {
      const links = $(`${PARFUMO_SELECTORS.actionNav.container} a`);
      const collectionLink = links.filter(function () {
        return $(this).text().trim().includes('Collection');
      });
      expect(collectionLink.length).toBeGreaterThan(0);
    });

    it('finds Rate link in action nav', () => {
      const links = $(`${PARFUMO_SELECTORS.actionNav.container} a`);
      const rateLink = links.filter(function () {
        return $(this).text().trim().includes('Rate');
      });
      expect(rateLink.length).toBeGreaterThan(0);
    });

    it('action links do not point to dologin when authenticated', () => {
      const links = $(`${PARFUMO_SELECTORS.actionNav.container} a`);
      links.each(function () {
        const href = $(this).attr('href') || '';
        expect(href).not.toContain('dologin');
      });
    });
  });

  describe('rating selectors', () => {
    it('finds all five rating barfillers', () => {
      const el = $(PARFUMO_SELECTORS.rating.barfiller);
      expect(el.length).toBe(5);
    });

    it('finds scent rating', () => {
      const el = $(PARFUMO_SELECTORS.rating.scent);
      expect(el.length).toBe(1);
      expect(el.attr('data-type')).toBe('scent');
    });

    it('finds longevity rating (durability)', () => {
      const el = $(PARFUMO_SELECTORS.rating.longevity);
      expect(el.length).toBe(1);
      expect(el.attr('data-type')).toBe('durability');
    });

    it('finds sillage rating', () => {
      const el = $(PARFUMO_SELECTORS.rating.sillage);
      expect(el.length).toBe(1);
    });

    it('finds bottle rating', () => {
      const el = $(PARFUMO_SELECTORS.rating.bottle);
      expect(el.length).toBe(1);
    });

    it('finds value rating (pricing)', () => {
      const el = $(PARFUMO_SELECTORS.rating.value);
      expect(el.length).toBe(1);
      expect(el.attr('data-type')).toBe('pricing');
    });

    it('reads rating percentages from fill elements', () => {
      const scentFill = $(`${PARFUMO_SELECTORS.rating.scent} ${PARFUMO_SELECTORS.rating.barFill}`);
      expect(scentFill.length).toBe(1);
      expect(parseFloat(scentFill.attr('data-percentage') || '0')).toBeCloseTo(83.685, 1);
    });

    it('reads rating display values from bold elements', () => {
      const scentValue = $(`${PARFUMO_SELECTORS.rating.scent} ${PARFUMO_SELECTORS.rating.barValue}`);
      expect(scentValue.length).toBe(1);
      expect(scentValue.text().trim()).toBe('8.4');
    });
  });

  describe('review selectors', () => {
    it('finds reviews tab', () => {
      const el = $(PARFUMO_SELECTORS.review.tab);
      expect(el.length).toBe(1);
    });

    it('finds statements tab', () => {
      const el = $(PARFUMO_SELECTORS.review.statementsTab);
      expect(el.length).toBe(1);
    });

    it('finds reviews holder', () => {
      const el = $(PARFUMO_SELECTORS.review.reviewsHolder);
      expect(el.length).toBe(1);
    });

    it('finds review articles', () => {
      const el = $(PARFUMO_SELECTORS.review.reviewArticle);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds review text content', () => {
      const el = $(PARFUMO_SELECTORS.review.reviewText);
      expect(el.length).toBeGreaterThan(0);
      expect(el.first().text()).toContain('excellent fragrance');
    });
  });

  describe('content tab selectors', () => {
    it('finds content tabs container', () => {
      const el = $(PARFUMO_SELECTORS.contentTabs.container);
      expect(el.length).toBe(1);
    });

    it('finds info tab', () => {
      const el = $(PARFUMO_SELECTORS.contentTabs.info);
      expect(el.length).toBe(1);
    });

    it('finds chart tab', () => {
      const el = $(PARFUMO_SELECTORS.contentTabs.chart);
      expect(el.length).toBe(1);
    });
  });
});
