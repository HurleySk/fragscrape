import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import config from '../config/config';
import logger from '../utils/logger';
import { Perfume, DecodoSubUser } from '../types';

class Database {
  private db: sqlite3.Database | null = null;

  async initialize(): Promise<void> {
    try {
      // Ensure data directory exists
      const dbDir = path.dirname(config.database.path);
      await fs.mkdir(dbDir, { recursive: true });

      // Open database
      this.db = new sqlite3.Database(config.database.path);

      // Promisify database methods
      (this.db.run as any) = promisify(this.db.run);
      (this.db.get as any) = promisify(this.db.get);
      (this.db.all as any) = promisify(this.db.all);

      // Create tables
      await this.createTables();

      logger.info('Database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize database:', error);
      throw error;
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Perfumes table
    await (this.db.run as any)(`
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
        sillage REAL,
        bottle REAL,
        price_value REAL,
        similar_fragrances TEXT,
        scraped_at DATETIME NOT NULL,
        cached_until DATETIME NOT NULL,
        UNIQUE(brand, name, year)
      )
    `);

    // Migration: Add bottle column to existing tables
    try {
      await (this.db.run as any)(`ALTER TABLE perfumes ADD COLUMN bottle REAL`);
      logger.info('Added bottle column to perfumes table');
    } catch (error: any) {
      // Column may already exist, ignore error
      if (!error.message.includes('duplicate column name')) {
        logger.debug('Bottle column migration skipped (may already exist)');
      }
    }

    // Sub-users table
    await (this.db.run as any)(`
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
    await (this.db.run as any)(`
      CREATE TABLE IF NOT EXISTS search_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query TEXT NOT NULL,
        results TEXT NOT NULL,
        cached_at DATETIME NOT NULL,
        cached_until DATETIME NOT NULL
      )
    `);

    // Request logs table
    await (this.db.run as any)(`
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
    await (this.db.run as any)('CREATE INDEX IF NOT EXISTS idx_perfumes_brand ON perfumes(brand)');
    await (this.db.run as any)('CREATE INDEX IF NOT EXISTS idx_perfumes_cached_until ON perfumes(cached_until)');
    await (this.db.run as any)('CREATE INDEX IF NOT EXISTS idx_search_query ON search_cache(query)');
    await (this.db.run as any)('CREATE INDEX IF NOT EXISTS idx_search_cached_until ON search_cache(cached_until)');
  }

  // Perfume methods

  async savePerfume(perfume: Perfume, cacheDuration: number = 86400): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const cachedUntil = new Date(Date.now() + cacheDuration * 1000);

    const sql = `
      INSERT OR REPLACE INTO perfumes (
        brand, name, year, url, image_url, concentration, gender,
        description, notes_top, notes_heart, notes_base, accords,
        rating, total_ratings, longevity, sillage, bottle, price_value,
        similar_fragrances, scraped_at, cached_until
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await (this.db.run as any)(
      sql,
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
      perfume.sillage || null,
      perfume.bottleRating || null,
      perfume.priceValue || null,
      JSON.stringify(perfume.similarFragrances || []),
      perfume.scrapedAt.toISOString(),
      cachedUntil.toISOString()
    );
  }

  async getPerfume(brand: string, name: string, year?: number): Promise<Perfume | null> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      SELECT * FROM perfumes
      WHERE brand = ? AND name = ? AND (year = ? OR (year IS NULL AND ? IS NULL))
      AND cached_until > datetime('now')
    `;

    const row: any = await (this.db.get as any)(sql, brand, name, year || null, year || null);

    if (!row) return null;

    return this.rowToPerfume(row);
  }

  async getPerfumeByUrl(url: string): Promise<Perfume | null> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      SELECT * FROM perfumes
      WHERE url = ? AND cached_until > datetime('now')
    `;

    const row: any = await (this.db.get as any)(sql, url);

    if (!row) return null;

    return this.rowToPerfume(row);
  }

  private rowToPerfume(row: any): Perfume {
    return {
      id: row.id.toString(),
      brand: row.brand,
      name: row.name,
      year: row.year || undefined,
      url: row.url,
      imageUrl: row.image_url || undefined,
      concentration: row.concentration || undefined,
      gender: row.gender || undefined,
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
      sillage: row.sillage || undefined,
      bottleRating: row.bottle || undefined,
      priceValue: row.price_value || undefined,
      similarFragrances: JSON.parse(row.similar_fragrances || '[]'),
      scrapedAt: new Date(row.scraped_at),
    };
  }

  // Sub-user methods

  async saveSubUser(subUser: DecodoSubUser): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      INSERT OR REPLACE INTO subusers (
        id, username, password, status, traffic_limit, traffic_used,
        service_type, created_at, last_checked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await (this.db.run as any)(
      sql,
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

  async getSubUsers(): Promise<DecodoSubUser[]> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = 'SELECT * FROM subusers ORDER BY created_at DESC';
    const rows: any[] = await (this.db.all as any)(sql);

    return rows.map(row => ({
      id: row.id,
      username: row.username,
      password: row.password,
      status: row.status,
      trafficLimit: row.traffic_limit,
      trafficUsed: row.traffic_used,
      serviceType: row.service_type,
      createdAt: new Date(row.created_at),
      lastChecked: new Date(row.last_checked),
    }));
  }

  async getActiveSubUser(): Promise<DecodoSubUser | null> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      SELECT * FROM subusers
      WHERE status = 'active'
      ORDER BY last_checked DESC
      LIMIT 1
    `;

    const row: any = await (this.db.get as any)(sql);

    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      password: row.password,
      status: row.status,
      trafficLimit: row.traffic_limit,
      trafficUsed: row.traffic_used,
      serviceType: row.service_type,
      createdAt: new Date(row.created_at),
      lastChecked: new Date(row.last_checked),
    };
  }

  // Search cache methods

  async getCachedSearch(query: string): Promise<any | null> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      SELECT results FROM search_cache
      WHERE query = ? AND cached_until > datetime('now')
      ORDER BY cached_at DESC
      LIMIT 1
    `;

    const row: any = await (this.db.get as any)(sql, query);

    if (!row) return null;

    return JSON.parse(row.results);
  }

  async saveSearchCache(query: string, results: any, cacheDuration: number = 3600): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const cachedUntil = new Date(Date.now() + cacheDuration * 1000);

    const sql = `
      INSERT INTO search_cache (query, results, cached_at, cached_until)
      VALUES (?, ?, datetime('now'), ?)
    `;

    await (this.db.run as any)(
      sql,
      query,
      JSON.stringify(results),
      cachedUntil.toISOString()
    );
  }

  // Request logging

  async logRequest(
    url: string,
    method: string,
    statusCode: number | null,
    responseTime: number,
    error: string | null,
    subUserId: string | null
  ): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      INSERT INTO request_logs (url, method, status_code, response_time, error, subuser_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `;

    await (this.db.run as any)(
      sql,
      url,
      method,
      statusCode,
      responseTime,
      error,
      subUserId
    );
  }

  // Cleanup methods

  async cleanupExpiredCache(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const perfumesResult: any = await (this.db.run as any)("DELETE FROM perfumes WHERE cached_until < datetime('now')");
    const searchResult: any = await (this.db.run as any)("DELETE FROM search_cache WHERE cached_until < datetime('now')");

    const totalDeleted = (perfumesResult.changes || 0) + (searchResult.changes || 0);
    logger.info(`Cleaned up ${totalDeleted} expired cache entries`);
  }

  async cleanupOldRequestLogs(retentionDays: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const sql = `
      DELETE FROM request_logs
      WHERE created_at < datetime('now', '-${retentionDays} days')
    `;

    const result: any = await (this.db.run as any)(sql);
    const deletedCount = result.changes || 0;

    if (deletedCount > 0) {
      logger.info(`Cleaned up ${deletedCount} old request logs (older than ${retentionDays} days)`);
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await new Promise((resolve, reject) => {
        this.db!.close((err) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });
      this.db = null;
    }
  }
}

export default new Database();