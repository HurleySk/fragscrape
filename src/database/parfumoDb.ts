import Database from 'better-sqlite3';
import { ParfumoSession, ParfumoSyncLogEntry, ParfumoRating } from '../types/parfumo';
import { PerfumeUserData } from '../types/queries';
import database from './database';

interface SyncLogInput {
  direction: 'push' | 'pull';
  perfumeId: number;
  action: string;
  category: string | null;
  status: 'success' | 'failed' | 'skipped';
  errorMessage?: string;
}

export class ParfumoDb {
  constructor(private db: Database.Database) {}

  saveSession(encryptedCookies: string, username: string | null): void {
    this.db.prepare(`
      INSERT INTO parfumo_session (id, cookies, username, logged_in_at)
      VALUES (1, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        cookies = excluded.cookies,
        username = excluded.username,
        logged_in_at = datetime('now'),
        last_verified_at = NULL,
        updated_at = datetime('now')
    `).run(encryptedCookies, username);
  }

  getSession(): ParfumoSession | null {
    const row = this.db.prepare('SELECT * FROM parfumo_session WHERE id = 1').get() as any;
    if (!row) return null;
    return {
      id: row.id,
      cookies: row.cookies,
      username: row.username,
      loggedInAt: row.logged_in_at,
      lastVerifiedAt: row.last_verified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  updateSessionVerified(): void {
    this.db.prepare(`
      UPDATE parfumo_session SET last_verified_at = datetime('now'), updated_at = datetime('now') WHERE id = 1
    `).run();
  }

  deleteSession(): void {
    this.db.prepare('DELETE FROM parfumo_session WHERE id = 1').run();
  }

  logSync(input: SyncLogInput): void {
    this.db.prepare(`
      INSERT INTO parfumo_sync_log (direction, perfume_id, action, category, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(input.direction, input.perfumeId, input.action, input.category, input.status, input.errorMessage ?? null);
  }

  getSyncLog(limit: number): ParfumoSyncLogEntry[] {
    const rows = this.db.prepare(`
      SELECT * FROM parfumo_sync_log ORDER BY synced_at DESC, id DESC LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      direction: row.direction,
      perfumeId: row.perfume_id,
      action: row.action,
      category: row.category,
      status: row.status,
      errorMessage: row.error_message,
      syncedAt: row.synced_at,
    }));
  }

  getParfumoUserData(perfumeId: number): PerfumeUserData | null {
    const row = this.db.prepare(
      'SELECT * FROM perfume_user_data WHERE perfume_id = ?'
    ).get(perfumeId) as any;

    if (!row) return null;

    return {
      id: row.id,
      perfumeId: row.perfume_id,
      notes: row.notes,
      interest: row.interest,
      parfumoScentRating: row.parfumo_scent_rating,
      parfumoLongevityRating: row.parfumo_longevity_rating,
      parfumoSillageRating: row.parfumo_sillage_rating,
      parfumoBottleRating: row.parfumo_bottle_rating,
      parfumoValueRating: row.parfumo_value_rating,
      parfumoReview: row.parfumo_review,
      parfumoSyncedAt: row.parfumo_synced_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  upsertParfumoRatings(perfumeId: number, ratings: ParfumoRating): void {
    const existing = this.getParfumoUserData(perfumeId);

    if (existing) {
      const scent = ratings.scent ?? existing.parfumoScentRating;
      const longevity = ratings.longevity ?? existing.parfumoLongevityRating;
      const sillage = ratings.sillage ?? existing.parfumoSillageRating;
      const bottle = ratings.bottle ?? existing.parfumoBottleRating;
      const value = ratings.value ?? existing.parfumoValueRating;

      this.db.prepare(`
        UPDATE perfume_user_data SET
          parfumo_scent_rating = ?,
          parfumo_longevity_rating = ?,
          parfumo_sillage_rating = ?,
          parfumo_bottle_rating = ?,
          parfumo_value_rating = ?,
          parfumo_synced_at = datetime('now'),
          updated_at = datetime('now')
        WHERE perfume_id = ?
      `).run(scent, longevity, sillage, bottle, value, perfumeId);
    } else {
      this.db.prepare(`
        INSERT INTO perfume_user_data (
          perfume_id,
          parfumo_scent_rating, parfumo_longevity_rating, parfumo_sillage_rating,
          parfumo_bottle_rating, parfumo_value_rating,
          parfumo_synced_at
        )
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        perfumeId,
        ratings.scent ?? null,
        ratings.longevity ?? null,
        ratings.sillage ?? null,
        ratings.bottle ?? null,
        ratings.value ?? null
      );
    }
  }

  upsertParfumoReview(perfumeId: number, review: string): void {
    const existing = this.getParfumoUserData(perfumeId);

    if (existing) {
      this.db.prepare(`
        UPDATE perfume_user_data SET
          parfumo_review = ?,
          parfumo_synced_at = datetime('now'),
          updated_at = datetime('now')
        WHERE perfume_id = ?
      `).run(review, perfumeId);
    } else {
      this.db.prepare(`
        INSERT INTO perfume_user_data (perfume_id, parfumo_review, parfumo_synced_at)
        VALUES (?, ?, datetime('now'))
      `).run(perfumeId, review);
    }
  }
}

let _instance: ParfumoDb | null = null;

export function getParfumoDb(): ParfumoDb {
  if (!_instance) {
    _instance = new ParfumoDb(database.getDb());
  }
  return _instance;
}
