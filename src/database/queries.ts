import Database from 'better-sqlite3';
import { SavedQuery, SavedQueryWithStats, QueryItem, PerfumeUserData, TagCount } from '../types/queries';
import { DatabaseError } from '../api/middleware/errorHandler';
import database from './database';

export class QueryDatabase {
  constructor(private db: Database.Database) {}

  createSavedQuery(query: string, name: string | null, perfumeIds: number[]): SavedQuery {
    const insertQuery = this.db.prepare(`
      INSERT INTO saved_queries (query, name)
      VALUES (?, ?)
    `);
    const result = insertQuery.run(query, name);
    const queryId = Number(result.lastInsertRowid);

    const insertItem = this.db.prepare(`
      INSERT INTO query_items (query_id, perfume_id, position)
      VALUES (?, ?, ?)
    `);

    const insertItems = this.db.transaction((ids: number[]) => {
      for (let i = 0; i < ids.length; i++) {
        insertItem.run(queryId, ids[i], i);
      }
    });
    insertItems(perfumeIds);

    return this.getSavedQuery(queryId)!;
  }

  getSavedQuery(id: number): SavedQuery | null {
    const row = this.db.prepare('SELECT * FROM saved_queries WHERE id = ?').get(id) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      query: row.query,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRefreshedAt: row.last_refreshed_at,
    };
  }

  listSavedQueries(): SavedQueryWithStats[] {
    const rows = this.db.prepare(`
      SELECT
        sq.*,
        COUNT(qi.id) as total_items,
        SUM(CASE WHEN qi.reviewed = 1 THEN 1 ELSE 0 END) as reviewed_count,
        SUM(CASE WHEN qi.skipped = 1 THEN 1 ELSE 0 END) as skipped_count
      FROM saved_queries sq
      LEFT JOIN query_items qi ON qi.query_id = sq.id
      GROUP BY sq.id
      ORDER BY sq.updated_at DESC
    `).all() as any[];

    return rows.map(row => ({
      id: row.id,
      name: row.name,
      query: row.query,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRefreshedAt: row.last_refreshed_at,
      totalItems: row.total_items,
      reviewedCount: row.reviewed_count,
      skippedCount: row.skipped_count,
      unreviewedCount: row.total_items - row.reviewed_count - row.skipped_count,
    }));
  }

  updateSavedQuery(id: number, updates: { name?: string }): void {
    if (updates.name !== undefined) {
      this.db.prepare(`
        UPDATE saved_queries SET name = ?, updated_at = datetime('now') WHERE id = ?
      `).run(updates.name, id);
    }
  }

  deleteSavedQuery(id: number): void {
    this.db.prepare('DELETE FROM saved_queries WHERE id = ?').run(id);
  }

  getQueryItems(queryId: number): QueryItem[] {
    const rows = this.db.prepare(`
      SELECT * FROM query_items WHERE query_id = ? ORDER BY position
    `).all(queryId) as any[];

    return rows.map(row => ({
      id: row.id,
      queryId: row.query_id,
      perfumeId: row.perfume_id,
      position: row.position,
      reviewed: Boolean(row.reviewed),
      skipped: Boolean(row.skipped),
      addedAt: row.added_at,
    }));
  }

  updateQueryItem(queryId: number, perfumeId: number, updates: { reviewed?: boolean; skipped?: boolean }): void {
    const sets: string[] = [];
    const params: any[] = [];

    if (updates.reviewed !== undefined) {
      sets.push('reviewed = ?');
      params.push(updates.reviewed ? 1 : 0);
    }
    if (updates.skipped !== undefined) {
      sets.push('skipped = ?');
      params.push(updates.skipped ? 1 : 0);
    }

    if (sets.length === 0) return;

    params.push(queryId, perfumeId);
    this.db.prepare(`
      UPDATE query_items SET ${sets.join(', ')} WHERE query_id = ? AND perfume_id = ?
    `).run(...params);
  }

  getNextItem(queryId: number): QueryItem | null {
    const row = this.db.prepare(`
      SELECT * FROM query_items
      WHERE query_id = ? AND reviewed = 0 AND skipped = 0
      ORDER BY position
      LIMIT 1
    `).get(queryId) as any;

    if (!row) return null;

    return {
      id: row.id,
      queryId: row.query_id,
      perfumeId: row.perfume_id,
      position: row.position,
      reviewed: Boolean(row.reviewed),
      skipped: Boolean(row.skipped),
      addedAt: row.added_at,
    };
  }

  refreshQueryItems(queryId: number, newPerfumeIds: number[]): void {
    const existing = this.getQueryItems(queryId);
    const existingMap = new Map(existing.map(item => [item.perfumeId, item]));

    const refresh = this.db.transaction(() => {
      this.db.prepare('DELETE FROM query_items WHERE query_id = ?').run(queryId);

      const insert = this.db.prepare(`
        INSERT INTO query_items (query_id, perfume_id, position, reviewed, skipped)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < newPerfumeIds.length; i++) {
        const perfumeId = newPerfumeIds[i];
        const prev = existingMap.get(perfumeId);
        insert.run(
          queryId,
          perfumeId,
          i,
          prev ? (prev.reviewed ? 1 : 0) : 0,
          prev ? (prev.skipped ? 1 : 0) : 0
        );
      }

      this.db.prepare(`
        UPDATE saved_queries SET last_refreshed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?
      `).run(queryId);
    });

    refresh();
  }

  addTag(perfumeId: number, tag: string): void {
    try {
      this.db.prepare(`
        INSERT INTO perfume_tags (perfume_id, tag) VALUES (?, ?)
      `).run(perfumeId, tag);
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
        throw new DatabaseError(`Tag '${tag}' already exists on this perfume`);
      }
      throw error;
    }
  }

  removeTag(perfumeId: number, tag: string): void {
    this.db.prepare('DELETE FROM perfume_tags WHERE perfume_id = ? AND tag = ?').run(perfumeId, tag);
  }

  getTags(perfumeId: number): string[] {
    const rows = this.db.prepare(
      'SELECT tag FROM perfume_tags WHERE perfume_id = ? ORDER BY id'
    ).all(perfumeId) as Array<{ tag: string }>;
    return rows.map(r => r.tag);
  }

  getTagCounts(): TagCount[] {
    const rows = this.db.prepare(`
      SELECT tag, COUNT(*) as count FROM perfume_tags
      GROUP BY tag ORDER BY count DESC
    `).all() as Array<{ tag: string; count: number }>;
    return rows;
  }

  upsertUserData(perfumeId: number, data: { notes?: string; interest?: number }): void {
    const existing = this.getUserData(perfumeId);

    if (existing) {
      const newNotes = data.notes !== undefined ? data.notes : existing.notes;
      const newInterest = data.interest !== undefined ? data.interest : existing.interest;
      this.db.prepare(`
        UPDATE perfume_user_data SET notes = ?, interest = ?, updated_at = datetime('now')
        WHERE perfume_id = ?
      `).run(newNotes, newInterest, perfumeId);
    } else {
      this.db.prepare(`
        INSERT INTO perfume_user_data (perfume_id, notes, interest)
        VALUES (?, ?, ?)
      `).run(perfumeId, data.notes ?? null, data.interest ?? null);
    }
  }

  getUserData(perfumeId: number): PerfumeUserData | null {
    const row = this.db.prepare(
      'SELECT * FROM perfume_user_data WHERE perfume_id = ?'
    ).get(perfumeId) as any;

    if (!row) return null;

    return {
      id: row.id,
      perfumeId: row.perfume_id,
      notes: row.notes,
      interest: row.interest,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  deleteUserData(perfumeId: number): void {
    this.db.prepare('DELETE FROM perfume_user_data WHERE perfume_id = ?').run(perfumeId);
  }

  getPerfumesByTag(tag: string): number[] {
    const rows = this.db.prepare(`
      SELECT perfume_id FROM perfume_tags WHERE tag = ? ORDER BY created_at
    `).all(tag) as Array<{ perfume_id: number }>;
    return rows.map(r => r.perfume_id);
  }

  cleanupPassedPerfumes(): number {
    const ids = this.db.prepare(`
      SELECT DISTINCT perfume_id FROM perfume_tags WHERE tag = 'pass'
    `).all() as Array<{ perfume_id: number }>;

    if (ids.length === 0) return 0;

    const cleanup = this.db.transaction(() => {
      for (const { perfume_id } of ids) {
        this.db.prepare('DELETE FROM perfume_tags WHERE perfume_id = ?').run(perfume_id);
        this.db.prepare('DELETE FROM perfume_user_data WHERE perfume_id = ?').run(perfume_id);
        this.db.prepare('DELETE FROM query_items WHERE perfume_id = ?').run(perfume_id);
        this.db.prepare('DELETE FROM perfumes WHERE id = ?').run(perfume_id);
      }
    });
    cleanup();

    return ids.length;
  }
}

let _instance: QueryDatabase | null = null;

export function getQueryDb(): QueryDatabase {
  if (!_instance) {
    _instance = new QueryDatabase(database.getDb());
  }
  return _instance;
}
