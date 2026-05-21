import Database from 'better-sqlite3';
import { QueryDatabase } from '../../src/database/queries';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE perfumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      name TEXT NOT NULL,
      year INTEGER,
      url TEXT UNIQUE NOT NULL,
      image_url TEXT,
      concentration TEXT,
      gender TEXT,
      description TEXT,
      notes_top TEXT,
      notes_heart TEXT,
      notes_base TEXT,
      accords TEXT,
      rating REAL,
      total_ratings INTEGER,
      longevity REAL,
      longevity_rating_count INTEGER,
      sillage REAL,
      sillage_rating_count INTEGER,
      bottle REAL,
      bottle_rating_count INTEGER,
      price_value REAL,
      price_value_rating_count INTEGER,
      review_count INTEGER,
      statement_count INTEGER,
      photo_count INTEGER,
      rank INTEGER,
      rank_category TEXT,
      perfumer TEXT,
      similar_fragrances TEXT,
      scraped_at DATETIME NOT NULL,
      UNIQUE(brand, name, year)
    );
    CREATE TABLE saved_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      query TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
      last_refreshed_at DATETIME
    );
    CREATE TABLE query_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query_id INTEGER NOT NULL REFERENCES saved_queries(id) ON DELETE CASCADE,
      perfume_id INTEGER NOT NULL REFERENCES perfumes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      reviewed INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      added_at DATETIME NOT NULL DEFAULT (datetime('now')),
      UNIQUE(query_id, perfume_id)
    );
    CREATE TABLE perfume_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      perfume_id INTEGER NOT NULL REFERENCES perfumes(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      UNIQUE(perfume_id, tag)
    );
    CREATE TABLE perfume_user_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      perfume_id INTEGER NOT NULL UNIQUE REFERENCES perfumes(id) ON DELETE CASCADE,
      notes TEXT,
      interest INTEGER CHECK(interest IS NULL OR (interest >= 1 AND interest <= 5)),
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

function insertPerfume(db: Database.Database, brand: string, name: string, url: string): number {
  const stmt = db.prepare(`
    INSERT INTO perfumes (brand, name, url, scraped_at)
    VALUES (?, ?, ?, datetime('now'))
  `);
  return Number(stmt.run(brand, name, url).lastInsertRowid);
}

describe('QueryDatabase', () => {
  let db: Database.Database;
  let queryDb: QueryDatabase;

  beforeEach(() => {
    db = createTestDb();
    queryDb = new QueryDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('saved queries', () => {
    it('creates a saved query with items', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const p2 = insertPerfume(db, 'Dior', 'Sauvage', 'https://parfumo.com/2');

      const saved = queryDb.createSavedQuery('oud rose', 'Summer research', [p1, p2]);

      expect(saved.query).toBe('oud rose');
      expect(saved.name).toBe('Summer research');
      expect(saved.id).toBeGreaterThan(0);

      const items = queryDb.getQueryItems(saved.id);
      expect(items).toHaveLength(2);
      expect(items[0].perfumeId).toBe(p1);
      expect(items[0].position).toBe(0);
      expect(items[1].position).toBe(1);
    });

    it('lists saved queries with progress stats', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const p2 = insertPerfume(db, 'Dior', 'Sauvage', 'https://parfumo.com/2');

      const saved = queryDb.createSavedQuery('oud', null, [p1, p2]);
      queryDb.updateQueryItem(saved.id, p1, { reviewed: true });

      const list = queryDb.listSavedQueries();
      expect(list).toHaveLength(1);
      expect(list[0].totalItems).toBe(2);
      expect(list[0].reviewedCount).toBe(1);
      expect(list[0].unreviewedCount).toBe(1);
    });

    it('deletes a saved query and its items', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const saved = queryDb.createSavedQuery('oud', null, [p1]);

      queryDb.deleteSavedQuery(saved.id);

      expect(queryDb.listSavedQueries()).toHaveLength(0);
      expect(queryDb.getQueryItems(saved.id)).toHaveLength(0);
    });

    it('updates query name', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const saved = queryDb.createSavedQuery('oud', null, [p1]);

      queryDb.updateSavedQuery(saved.id, { name: 'New Name' });

      const updated = queryDb.getSavedQuery(saved.id);
      expect(updated?.name).toBe('New Name');
    });
  });

  describe('query item progress', () => {
    it('marks an item as reviewed', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const saved = queryDb.createSavedQuery('oud', null, [p1]);

      queryDb.updateQueryItem(saved.id, p1, { reviewed: true });

      const items = queryDb.getQueryItems(saved.id);
      expect(items[0].reviewed).toBe(true);
    });

    it('marks an item as skipped', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const saved = queryDb.createSavedQuery('oud', null, [p1]);

      queryDb.updateQueryItem(saved.id, p1, { skipped: true });

      const items = queryDb.getQueryItems(saved.id);
      expect(items[0].skipped).toBe(true);
    });

    it('gets next unreviewed item', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const p2 = insertPerfume(db, 'Dior', 'Sauvage', 'https://parfumo.com/2');
      const p3 = insertPerfume(db, 'Tom Ford', 'Oud Wood', 'https://parfumo.com/3');
      const saved = queryDb.createSavedQuery('oud', null, [p1, p2, p3]);

      queryDb.updateQueryItem(saved.id, p1, { reviewed: true });
      queryDb.updateQueryItem(saved.id, p2, { skipped: true });

      const next = queryDb.getNextItem(saved.id);
      expect(next?.perfumeId).toBe(p3);
    });

    it('returns null when all items are reviewed or skipped', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const saved = queryDb.createSavedQuery('oud', null, [p1]);

      queryDb.updateQueryItem(saved.id, p1, { reviewed: true });

      const next = queryDb.getNextItem(saved.id);
      expect(next).toBeNull();
    });
  });

  describe('refresh', () => {
    it('replaces items, carries over reviewed status for existing perfumes', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const p2 = insertPerfume(db, 'Dior', 'Sauvage', 'https://parfumo.com/2');
      const p3 = insertPerfume(db, 'Tom Ford', 'Oud Wood', 'https://parfumo.com/3');

      const saved = queryDb.createSavedQuery('oud', null, [p1, p2]);
      queryDb.updateQueryItem(saved.id, p1, { reviewed: true });

      queryDb.refreshQueryItems(saved.id, [p1, p3]);

      const items = queryDb.getQueryItems(saved.id);
      expect(items).toHaveLength(2);

      const p1Item = items.find(i => i.perfumeId === p1);
      expect(p1Item?.reviewed).toBe(true);

      const p3Item = items.find(i => i.perfumeId === p3);
      expect(p3Item?.reviewed).toBe(false);
    });
  });

  describe('perfume tags', () => {
    it('adds and lists tags', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      queryDb.addTag(p1, 'want to try');
      queryDb.addTag(p1, 'summer');

      const tags = queryDb.getTags(p1);
      expect(tags).toEqual(['want to try', 'summer']);
    });

    it('prevents duplicate tags', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      queryDb.addTag(p1, 'want to try');
      expect(() => queryDb.addTag(p1, 'want to try')).toThrow();
    });

    it('removes a tag', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      queryDb.addTag(p1, 'want to try');
      queryDb.removeTag(p1, 'want to try');

      expect(queryDb.getTags(p1)).toEqual([]);
    });

    it('lists all tags with counts', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const p2 = insertPerfume(db, 'Dior', 'Sauvage', 'https://parfumo.com/2');

      queryDb.addTag(p1, 'want to try');
      queryDb.addTag(p2, 'want to try');
      queryDb.addTag(p1, 'summer');

      const counts = queryDb.getTagCounts();
      expect(counts).toEqual([
        { tag: 'want to try', count: 2 },
        { tag: 'summer', count: 1 },
      ]);
    });
  });

  describe('perfume user data', () => {
    it('upserts notes and interest', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      queryDb.upsertUserData(p1, { notes: 'Great scent', interest: 4 });
      const data = queryDb.getUserData(p1);

      expect(data?.notes).toBe('Great scent');
      expect(data?.interest).toBe(4);
    });

    it('partial update — only notes', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      queryDb.upsertUserData(p1, { interest: 3 });
      queryDb.upsertUserData(p1, { notes: 'Smoky' });

      const data = queryDb.getUserData(p1);
      expect(data?.notes).toBe('Smoky');
      expect(data?.interest).toBe(3);
    });

    it('deletes user data', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      queryDb.upsertUserData(p1, { notes: 'Great', interest: 5 });
      queryDb.deleteUserData(p1);

      expect(queryDb.getUserData(p1)).toBeNull();
    });
  });

  describe('collection views', () => {
    it('gets perfumes by tag', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const p2 = insertPerfume(db, 'Dior', 'Sauvage', 'https://parfumo.com/2');
      insertPerfume(db, 'Tom Ford', 'Oud Wood', 'https://parfumo.com/3');

      queryDb.addTag(p1, 'want to try');
      queryDb.addTag(p2, 'want to try');

      const collection = queryDb.getPerfumesByTag('want to try');
      expect(collection).toHaveLength(2);
    });
  });

  describe('tag-based cleanup', () => {
    it('deletes perfumes tagged pass and their related data', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      const p2 = insertPerfume(db, 'Dior', 'Sauvage', 'https://parfumo.com/2');

      queryDb.addTag(p1, 'pass');
      queryDb.addTag(p2, 'want to try');
      queryDb.upsertUserData(p1, { notes: 'Not for me' });

      const deleted = queryDb.cleanupPassedPerfumes();
      expect(deleted).toBe(1);

      expect(queryDb.getTags(p1)).toEqual([]);
      expect(queryDb.getUserData(p1)).toBeNull();

      expect(queryDb.getTags(p2)).toEqual(['want to try']);
    });
  });
});
