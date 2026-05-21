import Database from 'better-sqlite3';
import { SessionManager } from '../../src/auth/sessionManager';
import { ParfumoDb } from '../../src/database/parfumoDb';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE parfumo_session (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      cookies TEXT NOT NULL,
      username TEXT,
      logged_in_at DATETIME NOT NULL,
      last_verified_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

describe('SessionManager', () => {
  let db: Database.Database;
  let parfumoDb: ParfumoDb;

  beforeEach(() => {
    db = createTestDb();
    parfumoDb = new ParfumoDb(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('encryption round-trip', () => {
    it('encrypts and decrypts cookies', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      const cookies = [
        { name: 'session_id', value: 'abc123', domain: '.parfumo.com', path: '/' },
        { name: 'user', value: 'testuser', domain: '.parfumo.com', path: '/' },
      ];

      manager.saveSession(cookies, 'testuser');
      const result = manager.loadSession();

      expect(result).not.toBeNull();
      expect(result!.cookies).toEqual(cookies);
      expect(result!.username).toBe('testuser');
    });

    it('handles special characters in cookie values', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      const cookies = [
        { name: 'token', value: 'eyJhbG==;path=/;secure', domain: '.parfumo.com', path: '/' },
      ];

      manager.saveSession(cookies, 'user');
      const result = manager.loadSession();

      expect(result!.cookies[0].value).toBe('eyJhbG==;path=/;secure');
    });
  });

  describe('session lifecycle', () => {
    it('returns null when no session exists', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      expect(manager.loadSession()).toBeNull();
    });

    it('clears session on logout', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      manager.saveSession([{ name: 'x', value: 'y', domain: '.parfumo.com', path: '/' }], 'user');
      manager.clearSession();

      expect(manager.loadSession()).toBeNull();
    });

    it('throws on decryption with wrong key', () => {
      const key1 = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const key2 = 'b]3Fj9#kL2!mNpQ7$rStUvWxYz012345';

      const manager1 = new SessionManager(parfumoDb, key1);
      manager1.saveSession([{ name: 'x', value: 'y', domain: '.parfumo.com', path: '/' }], 'user');

      const manager2 = new SessionManager(parfumoDb, key2);
      expect(() => manager2.loadSession()).toThrow();
    });

    it('overwrites session on re-login', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      manager.saveSession([{ name: 'old', value: '1', domain: '.parfumo.com', path: '/' }], 'user1');
      manager.saveSession([{ name: 'new', value: '2', domain: '.parfumo.com', path: '/' }], 'user2');

      const result = manager.loadSession();
      expect(result!.cookies[0].name).toBe('new');
      expect(result!.username).toBe('user2');
    });
  });

  describe('needsVerification', () => {
    it('returns true when no session exists', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      expect(manager.needsVerification(1800000)).toBe(true);
    });

    it('returns true when session has never been verified', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      manager.saveSession([{ name: 'x', value: 'y', domain: '.parfumo.com', path: '/' }], 'user');
      expect(manager.needsVerification(1800000)).toBe(true);
    });

    it('returns false when recently verified', () => {
      const key = 'a]3Fj9#kL2!mNpQ7$rStUvWxYz012345';
      const manager = new SessionManager(parfumoDb, key);

      manager.saveSession([{ name: 'x', value: 'y', domain: '.parfumo.com', path: '/' }], 'user');
      manager.markVerified();

      expect(manager.needsVerification(1800000)).toBe(false);
    });
  });
});
