import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import config from '../config/config';
import logger from '../utils/logger';
import { Perfume } from '../types';
import { DatabaseError } from '../api/middleware/errorHandler';
import { validateGender } from '../utils/validation';

interface DatabaseRow {
  [key: string]: any;
}

interface PerfumeRow extends DatabaseRow {
  id: number;
  brand: string;
  name: string;
  year: number | null;
  url: string;
  image_url: string | null;
  concentration: string | null;
  gender: string | null;
  description: string | null;
  notes_top: string;
  notes_heart: string;
  notes_base: string;
  accords: string;
  rating: number | null;
  total_ratings: number | null;
  longevity: number | null;
  longevity_rating_count: number | null;
  sillage: number | null;
  sillage_rating_count: number | null;
  bottle: number | null;
  bottle_rating_count: number | null;
  price_value: number | null;
  price_value_rating_count: number | null;
  review_count: number | null;
  statement_count: number | null;
  photo_count: number | null;
  rank: number | null;
  rank_category: string | null;
  perfumer: string | null;
  similar_fragrances: string;
  scraped_at: string;
}

interface SearchCacheRow extends DatabaseRow {
  results: string;
}

class DatabaseService {
  private db: Database.Database | null = null;

  async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      const dbDir = path.dirname(config.database.path);
      await fs.mkdir(dbDir, { recursive: true });

      // Open database
      this.db = new Database(config.database.path);

      // Create tables
      this.createTables();

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private createTables(): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    this.db.pragma('foreign_keys = ON');

    // Perfumes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS perfumes (
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
        cached_until DATETIME NOT NULL,
        UNIQUE(brand, name, year)
      )
    `);

    // Migrations: Add new columns to existing tables
    const migrations = [
      { column: 'bottle', type: 'REAL', desc: 'bottle rating' },
      { column: 'longevity_rating_count', type: 'INTEGER', desc: 'longevity vote count' },
      { column: 'sillage_rating_count', type: 'INTEGER', desc: 'sillage vote count' },
      { column: 'bottle_rating_count', type: 'INTEGER', desc: 'bottle vote count' },
      { column: 'price_value_rating_count', type: 'INTEGER', desc: 'price-value vote count' },
      { column: 'review_count', type: 'INTEGER', desc: 'review count' },
      { column: 'statement_count', type: 'INTEGER', desc: 'statement count' },
      { column: 'photo_count', type: 'INTEGER', desc: 'photo count' },
      { column: 'rank', type: 'INTEGER', desc: 'ranking position' },
      { column: 'rank_category', type: 'TEXT', desc: 'ranking category' },
      { column: 'perfumer', type: 'TEXT', desc: 'perfumer name' },
    ];

    for (const migration of migrations) {
      try {
        this.db.exec(`ALTER TABLE perfumes ADD COLUMN ${migration.column} ${migration.type}`);
        logger.info(`Added ${migration.column} column to perfumes table`);
      } catch (error: any) {
        // Column may already exist, ignore error
        if (!error.message.includes('duplicate column name')) {
          logger.debug(`Migration for ${migration.column} failed (may already exist)`);
        }
      }
    }

    // Clean up legacy tables
    this.db.exec('DROP TABLE IF EXISTS request_logs');
    this.db.exec('DROP TABLE IF EXISTS subusers');

    // Search cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS search_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        results TEXT NOT NULL,
        cached_at DATETIME NOT NULL,
        cached_until DATETIME NOT NULL
      )
    `);

    // Saved queries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saved_queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        query TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
        updated_at DATETIME NOT NULL DEFAULT (datetime('now')),
        last_refreshed_at DATETIME
      )
    `);

    // Query items junction table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_id INTEGER NOT NULL REFERENCES saved_queries(id) ON DELETE CASCADE,
        perfume_id INTEGER NOT NULL REFERENCES perfumes(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        reviewed INTEGER NOT NULL DEFAULT 0,
        skipped INTEGER NOT NULL DEFAULT 0,
        added_at DATETIME NOT NULL DEFAULT (datetime('now')),
        UNIQUE(query_id, perfume_id)
      )
    `);

    // Perfume tags table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS perfume_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        perfume_id INTEGER NOT NULL REFERENCES perfumes(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
        UNIQUE(perfume_id, tag)
      )
    `);

    // Perfume user data table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS perfume_user_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        perfume_id INTEGER NOT NULL UNIQUE REFERENCES perfumes(id) ON DELETE CASCADE,
        notes TEXT,
        interest INTEGER CHECK(interest IS NULL OR (interest >= 1 AND interest <= 5)),
        created_at DATETIME NOT NULL DEFAULT (datetime('now')),
        updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Migration: drop cached_until column (replaced by tag-based cleanup)
    try {
      const cols = this.db.pragma('table_info(perfumes)') as Array<{ name: string }>;
      if (cols.some(c => c.name === 'cached_until')) {
        this.db.exec('ALTER TABLE perfumes DROP COLUMN cached_until');
        logger.info('Dropped cached_until column from perfumes table');
      }
    } catch (error: any) {
      logger.debug('Migration for cached_until removal failed:', error.message);
    }

    // Create indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_perfumes_brand ON perfumes(brand)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_query ON search_cache(query)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_cached_until ON search_cache(cached_until)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_query_items_query ON query_items(query_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_query_items_perfume ON query_items(perfume_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_perfume_tags_perfume ON perfume_tags(perfume_id)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_perfume_tags_tag ON perfume_tags(tag)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_perfume_user_data_perfume ON perfume_user_data(perfume_id)');
  }

  // Perfume methods

  savePerfume(perfume: Perfume): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO perfumes (
        brand, name, year, url, image_url, concentration, gender,
        description, notes_top, notes_heart, notes_base, accords,
        rating, total_ratings, longevity, longevity_rating_count,
        sillage, sillage_rating_count, bottle, bottle_rating_count,
        price_value, price_value_rating_count, review_count, statement_count,
        photo_count, rank, rank_category, perfumer,
        similar_fragrances, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      perfume.brand,
      perfume.name,
      perfume.year || null,
      perfume.url,
      perfume.imageUrl || null,
      perfume.concentration || null,
      perfume.gender || null,
      perfume.description || null,
      JSON.stringify(perfume.notes?.top || []),
      JSON.stringify(perfume.notes?.heart || []),
      JSON.stringify(perfume.notes?.base || []),
      JSON.stringify(perfume.accords || []),
      perfume.rating || null,
      perfume.totalRatings || null,
      perfume.longevity || null,
      perfume.longevityRatingCount || null,
      perfume.sillage || null,
      perfume.sillageRatingCount || null,
      perfume.bottleRating || null,
      perfume.bottleRatingCount || null,
      perfume.priceValue || null,
      perfume.priceValueRatingCount || null,
      perfume.reviewCount || null,
      perfume.statementCount || null,
      perfume.photoCount || null,
      perfume.rank || null,
      perfume.rankCategory || null,
      perfume.perfumer || null,
      JSON.stringify(perfume.similarFragrances || []),
      perfume.scrapedAt.toISOString()
    );
  }

  getPerfume(brand: string, name: string, year?: number): Perfume | null {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const maxAgeSeconds = config.cache.perfumeDurationSeconds;
    const stmt = this.db.prepare(`
      SELECT * FROM perfumes
      WHERE brand = ? AND name = ? AND (year = ? OR (year IS NULL AND ? IS NULL))
      AND scraped_at > datetime('now', '-' || ? || ' seconds')
    `);

    const row = stmt.get(brand, name, year || null, year || null, maxAgeSeconds) as PerfumeRow | undefined;

    if (!row) return null;

    return this.rowToPerfume(row);
  }

  getPerfumeByUrl(url: string): Perfume | null {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const maxAgeSeconds = config.cache.perfumeDurationSeconds;
    const stmt = this.db.prepare(`
      SELECT * FROM perfumes
      WHERE url = ? AND scraped_at > datetime('now', '-' || ? || ' seconds')
    `);

    const row = stmt.get(url, maxAgeSeconds) as PerfumeRow | undefined;

    if (!row) return null;

    return this.rowToPerfume(row);
  }

  getPerfumeById(id: number): Perfume | null {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM perfumes WHERE id = ?');
    const row = stmt.get(id) as PerfumeRow | undefined;

    if (!row) return null;

    return this.rowToPerfume(row);
  }

  getDb(): Database.Database {
    if (!this.db) throw new DatabaseError('Database not initialized');
    return this.db;
  }

  private rowToPerfume(row: PerfumeRow): Perfume {
    return {
      id: row.id.toString(),
      brand: row.brand,
      name: row.name,
      year: row.year || undefined,
      url: row.url,
      imageUrl: row.image_url || undefined,
      concentration: row.concentration || undefined,
      gender: validateGender(row.gender),
      description: row.description || undefined,
      notes: {
        top: JSON.parse(row.notes_top || '[]'),
        heart: JSON.parse(row.notes_heart || '[]'),
        base: JSON.parse(row.notes_base || '[]'),
      },
      accords: JSON.parse(row.accords || '[]'),
      rating: row.rating || undefined,
      totalRatings: row.total_ratings || undefined,
      longevity: row.longevity || undefined,
      longevityRatingCount: row.longevity_rating_count || undefined,
      sillage: row.sillage || undefined,
      sillageRatingCount: row.sillage_rating_count || undefined,
      bottleRating: row.bottle || undefined,
      bottleRatingCount: row.bottle_rating_count || undefined,
      priceValue: row.price_value || undefined,
      priceValueRatingCount: row.price_value_rating_count || undefined,
      reviewCount: row.review_count || undefined,
      statementCount: row.statement_count || undefined,
      photoCount: row.photo_count || undefined,
      rank: row.rank || undefined,
      rankCategory: row.rank_category || undefined,
      perfumer: row.perfumer || undefined,
      similarFragrances: JSON.parse(row.similar_fragrances || '[]'),
      scrapedAt: new Date(row.scraped_at),
    };
  }

  // Search cache methods

  getCachedSearch(query: string): unknown {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const maxAgeSeconds = config.cache.searchDurationSeconds;
    const stmt = this.db.prepare(`
      SELECT results FROM search_cache
      WHERE query = ? AND cached_at > datetime('now', '-' || ? || ' seconds')
      ORDER BY cached_at DESC
      LIMIT 1
    `);

    const row = stmt.get(query, maxAgeSeconds) as SearchCacheRow | undefined;

    if (!row) return null;

    return JSON.parse(row.results);
  }

  saveSearchCache(query: string, results: unknown, cacheDuration?: number): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const duration = cacheDuration ?? config.cache.searchDurationSeconds;
    const cachedUntil = new Date(Date.now() + duration * 1000);

    const stmt = this.db.prepare(`
      INSERT INTO search_cache (query, results, cached_at, cached_until)
      VALUES (?, ?, datetime('now'), ?)
    `);

    stmt.run(
      query,
      JSON.stringify(results),
      cachedUntil.toISOString()
    );
  }

  healthCheck(): boolean {
    if (!this.db) return false;
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export default new DatabaseService();