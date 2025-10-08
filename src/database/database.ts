import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs/promises';
import config from '../config/config';
import logger from '../utils/logger';
import { Perfume, DecodoSubUser } from '../types';
import { DatabaseError } from '../api/middleware/errorHandler';
import { validateGender, validateSubUserStatus } from '../utils/validation';

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
  cached_until: string;
}

interface SubUserRow extends DatabaseRow {
  id: string;
  username: string;
  password: string;
  status: string;
  traffic_limit: number;
  traffic_used: number;
  service_type: string;
  created_at: string;
  last_checked: string;
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

    // Sub-users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS subusers (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        status TEXT NOT NULL,
        traffic_limit INTEGER NOT NULL,
        traffic_used INTEGER NOT NULL,
        service_type TEXT NOT NULL,
        created_at DATETIME NOT NULL,
        last_checked DATETIME NOT NULL
      )
    `);

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

    // Request logs table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        method TEXT NOT NULL,
        status_code INTEGER,
        response_time INTEGER,
        error TEXT,
        subuser_id TEXT,
        created_at DATETIME NOT NULL,
        FOREIGN KEY (subuser_id) REFERENCES subusers(id)
      )
    `);

    // Create indexes
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_perfumes_brand ON perfumes(brand)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_perfumes_cached_until ON perfumes(cached_until)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_query ON search_cache(query)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_search_cached_until ON search_cache(cached_until)');
  }

  // Perfume methods

  savePerfume(perfume: Perfume, cacheDuration?: number): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const duration = cacheDuration ?? config.cache.perfumeDurationSeconds;
    const cachedUntil = new Date(Date.now() + duration * 1000);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO perfumes (
        brand, name, year, url, image_url, concentration, gender,
        description, notes_top, notes_heart, notes_base, accords,
        rating, total_ratings, longevity, longevity_rating_count,
        sillage, sillage_rating_count, bottle, bottle_rating_count,
        price_value, price_value_rating_count, review_count, statement_count,
        photo_count, rank, rank_category, perfumer,
        similar_fragrances, scraped_at, cached_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      perfume.scrapedAt.toISOString(),
      cachedUntil.toISOString()
    );
  }

  getPerfume(brand: string, name: string, year?: number): Perfume | null {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM perfumes
      WHERE brand = ? AND name = ? AND (year = ? OR (year IS NULL AND ? IS NULL))
      AND cached_until > datetime('now')
    `);

    const row = stmt.get(brand, name, year || null, year || null) as PerfumeRow | undefined;

    if (!row) return null;

    return this.rowToPerfume(row);
  }

  getPerfumeByUrl(url: string): Perfume | null {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM perfumes
      WHERE url = ? AND cached_until > datetime('now')
    `);

    const row = stmt.get(url) as PerfumeRow | undefined;

    if (!row) return null;

    return this.rowToPerfume(row);
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

  // Sub-user methods

  saveSubUser(subUser: DecodoSubUser): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO subusers (
        id, username, password, status, traffic_limit, traffic_used,
        service_type, created_at, last_checked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      subUser.id,
      subUser.username,
      subUser.password,
      subUser.status,
      subUser.trafficLimit,
      subUser.trafficUsed,
      subUser.serviceType,
      subUser.createdAt.toISOString(),
      subUser.lastChecked.toISOString()
    );
  }

  getSubUsers(): DecodoSubUser[] {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM subusers ORDER BY created_at DESC');
    const rows = stmt.all() as SubUserRow[];

    return rows.map(row => ({
        id: row.id,
        username: row.username,
        password: row.password,
        status: validateSubUserStatus(row.status),
        trafficLimit: row.traffic_limit,
        trafficUsed: row.traffic_used,
        serviceType: row.service_type,
        createdAt: new Date(row.created_at),
        lastChecked: new Date(row.last_checked),
    }));
  }

  getActiveSubUser(): DecodoSubUser | null {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT * FROM subusers
      WHERE status = 'active'
      ORDER BY last_checked DESC
      LIMIT 1
    `);

    const row = stmt.get() as SubUserRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      password: row.password,
      status: validateSubUserStatus(row.status),
      trafficLimit: row.traffic_limit,
      trafficUsed: row.traffic_used,
      serviceType: row.service_type,
      createdAt: new Date(row.created_at),
      lastChecked: new Date(row.last_checked),
    };
  }

  // Search cache methods

  getCachedSearch(query: string): unknown {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      SELECT results FROM search_cache
      WHERE query = ? AND cached_until > datetime('now')
      ORDER BY cached_at DESC
      LIMIT 1
    `);

    const row = stmt.get(query) as SearchCacheRow | undefined;

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

  // Request logging

  logRequest(
    url: string,
    method: string,
    statusCode: number | null,
    responseTime: number,
    error: string | null,
    subUserId: string | null
  ): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO request_logs (url, method, status_code, response_time, error, subuser_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    stmt.run(
      url,
      method,
      statusCode,
      responseTime,
      error,
      subUserId
    );
  }

  // Cleanup methods

  cleanupExpiredCache(): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const perfumesStmt = this.db.prepare("DELETE FROM perfumes WHERE cached_until < datetime('now')");
    const searchStmt = this.db.prepare("DELETE FROM search_cache WHERE cached_until < datetime('now')");

    const perfumesResult = perfumesStmt.run();
    const searchResult = searchStmt.run();

    const totalDeleted = (perfumesResult.changes || 0) + (searchResult.changes || 0);
    logger.info(`Cleaned up ${totalDeleted} expired cache entries`);
  }

  cleanupOldRequestLogs(retentionDays: number): void {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const stmt = this.db.prepare(`
      DELETE FROM request_logs
      WHERE created_at < datetime('now', '-${retentionDays} days')
    `);

    const result = stmt.run();
    const deletedCount = result.changes || 0;

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old request logs (older than ${retentionDays} days)`);
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