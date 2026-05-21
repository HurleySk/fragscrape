import Database from 'better-sqlite3';
import { ParfumoDb } from '../../src/database/parfumoDb';

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
      parfumo_scent_rating REAL,
      parfumo_longevity_rating REAL,
      parfumo_sillage_rating REAL,
      parfumo_bottle_rating REAL,
      parfumo_value_rating REAL,
      parfumo_review TEXT,
      parfumo_synced_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE parfumo_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cookies TEXT NOT NULL,
      username TEXT,
      logged_in_at DATETIME NOT NULL,
      last_verified_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE parfumo_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
      perfume_id INTEGER REFERENCES perfumes(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      category TEXT,
      status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
      error_message TEXT,
      synced_at DATETIME NOT NULL DEFAULT (datetime('now'))
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

describe('ParfumoDb', () => {
  let db: Database.Database;
  let parfumoDb: ParfumoDb;

  beforeEach(() => {
    db = createTestDb();
    parfumoDb = new ParfumoDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('session management', () => {
    it('saves and retrieves a session', () => {
      parfumoDb.saveSession('encrypted-cookies', 'testuser');
      const session = parfumoDb.getSession();

      expect(session).not.toBeNull();
      expect(session!.cookies).toBe('encrypted-cookies');
      expect(session!.username).toBe('testuser');
    });

    it('upserts session on repeated saves', () => {
      parfumoDb.saveSession('cookies-1', 'user1');
      parfumoDb.saveSession('cookies-2', 'user2');

      const session = parfumoDb.getSession();
      expect(session!.cookies).toBe('cookies-2');
      expect(session!.username).toBe('user2');
    });

    it('updates last_verified_at', () => {
      parfumoDb.saveSession('cookies', 'user');
      parfumoDb.updateSessionVerified();

      const session = parfumoDb.getSession();
      expect(session!.lastVerifiedAt).not.toBeNull();
    });

    it('deletes session', () => {
      parfumoDb.saveSession('cookies', 'user');
      parfumoDb.deleteSession();

      expect(parfumoDb.getSession()).toBeNull();
    });

    it('returns null when no session exists', () => {
      expect(parfumoDb.getSession()).toBeNull();
    });
  });

  describe('sync log', () => {
    it('logs a sync action', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      parfumoDb.logSync({
        direction: 'push',
        perfumeId: p1,
        action: 'add_collection',
        category: 'wishlist',
        status: 'success',
      });

      const logs = parfumoDb.getSyncLog(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].direction).toBe('push');
      expect(logs[0].action).toBe('add_collection');
      expect(logs[0].status).toBe('success');
    });

    it('logs a failed sync with error message', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      parfumoDb.logSync({
        direction: 'push',
        perfumeId: p1,
        action: 'rate',
        category: null,
        status: 'failed',
        errorMessage: 'Selector not found',
      });

      const logs = parfumoDb.getSyncLog(10);
      expect(logs[0].status).toBe('failed');
      expect(logs[0].errorMessage).toBe('Selector not found');
    });

    it('returns logs in reverse chronological order', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      parfumoDb.logSync({ direction: 'push', perfumeId: p1, action: 'a', category: null, status: 'success' });
      parfumoDb.logSync({ direction: 'pull', perfumeId: p1, action: 'b', category: null, status: 'success' });

      const logs = parfumoDb.getSyncLog(10);
      expect(logs[0].action).toBe('b');
      expect(logs[1].action).toBe('a');
    });

    it('limits log results', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      for (let i = 0; i < 5; i++) {
        parfumoDb.logSync({ direction: 'push', perfumeId: p1, action: `action-${i}`, category: null, status: 'success' });
      }

      const logs = parfumoDb.getSyncLog(2);
      expect(logs).toHaveLength(2);
    });
  });

  describe('parfumo user data', () => {
    it('upserts parfumo ratings', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      parfumoDb.upsertParfumoRatings(p1, {
        scent: 8.5,
        longevity: 7.0,
        sillage: 6.5,
        bottle: 9.0,
        value: 7.0,
      });

      const data = parfumoDb.getParfumoUserData(p1);
      expect(data!.parfumoScentRating).toBe(8.5);
      expect(data!.parfumoLongevityRating).toBe(7.0);
      expect(data!.parfumoBottleRating).toBe(9.0);
      expect(data!.parfumoSyncedAt).not.toBeNull();
    });

    it('upserts parfumo review', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      parfumoDb.upsertParfumoReview(p1, 'Rich oud opening...');

      const data = parfumoDb.getParfumoUserData(p1);
      expect(data!.parfumoReview).toBe('Rich oud opening...');
    });

    it('partial update preserves existing fields', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');

      parfumoDb.upsertParfumoRatings(p1, { scent: 8.5 });
      parfumoDb.upsertParfumoReview(p1, 'Great scent');

      const data = parfumoDb.getParfumoUserData(p1);
      expect(data!.parfumoScentRating).toBe(8.5);
      expect(data!.parfumoReview).toBe('Great scent');
    });

    it('returns null for perfume with no user data', () => {
      const p1 = insertPerfume(db, 'Creed', 'Aventus', 'https://parfumo.com/1');
      expect(parfumoDb.getParfumoUserData(p1)).toBeNull();
    });
  });
});
