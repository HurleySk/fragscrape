import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { PARFUMO_SELECTORS } from '../../src/constants/parfumoSelectors';

const fixturePath = path.join(__dirname, '..', 'fixtures', 'parfumo-perfume-page.html');
const html = fs.readFileSync(fixturePath, 'utf-8');
const $ = cheerio.load(html);

describe('Parfumo selectors against HTML fixture', () => {
  describe('login selectors', () => {
    it('finds profile indicator when logged in', () => {
      const el = $(PARFUMO_SELECTORS.login.profileIndicator);
      expect(el.length).toBeGreaterThan(0);
    });
  });

  describe('collection selectors', () => {
    it('finds collection button', () => {
      const el = $(PARFUMO_SELECTORS.collection.button);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds collection dropdown', () => {
      const el = $(PARFUMO_SELECTORS.collection.dropdown);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds each collection category', () => {
      const categories = PARFUMO_SELECTORS.collection.categories;
      for (const [_name, selector] of Object.entries(categories)) {
        const el = $(selector);
        expect(el.length).toBeGreaterThan(0);
      }
    });
  });

  describe('rating selectors', () => {
    it('finds rating container', () => {
      const el = $(PARFUMO_SELECTORS.rating.container);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds each rating dimension', () => {
      const dimensions = ['scent', 'longevity', 'sillage', 'bottle', 'value'] as const;
      for (const dim of dimensions) {
        const el = $(PARFUMO_SELECTORS.rating[dim]);
        expect(el.length).toBeGreaterThan(0);
      }
    });
  });

  describe('review selectors', () => {
    it('finds review container', () => {
      const el = $(PARFUMO_SELECTORS.review.container);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds review text area', () => {
      const el = $(PARFUMO_SELECTORS.review.textArea);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds submit button', () => {
      const el = $(PARFUMO_SELECTORS.review.submitButton);
      expect(el.length).toBeGreaterThan(0);
    });

    it('finds existing review text', () => {
      const el = $(PARFUMO_SELECTORS.review.existingReviewText);
      expect(el.length).toBeGreaterThan(0);
      expect(el.first().text()).toContain('Existing review text');
    });

    it('finds delete button', () => {
      const el = $(PARFUMO_SELECTORS.review.deleteButton);
      expect(el.length).toBeGreaterThan(0);
    });
  });
});
