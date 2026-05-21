import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { ParfumoDb } from '../database/parfumoDb';

interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  [key: string]: any;
}

interface LoadedSession {
  cookies: CookieData[];
  username: string | null;
  loggedInAt: string;
  lastVerifiedAt: string | null;
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT = 'fragscrape-parfumo-session';

export class SessionManager {
  private derivedKey: Buffer;

  constructor(private parfumoDb: ParfumoDb, sessionKey: string) {
    this.derivedKey = scryptSync(sessionKey, SALT, 32);
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.derivedKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
  }

  private decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted data format');

    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = createDecipheriv(ALGORITHM, this.derivedKey, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  saveSession(cookies: CookieData[], username: string | null): void {
    const encrypted = this.encrypt(JSON.stringify(cookies));
    this.parfumoDb.saveSession(encrypted, username);
  }

  loadSession(): LoadedSession | null {
    const session = this.parfumoDb.getSession();
    if (!session) return null;

    const cookies = JSON.parse(this.decrypt(session.cookies)) as CookieData[];
    return {
      cookies,
      username: session.username,
      loggedInAt: session.loggedInAt,
      lastVerifiedAt: session.lastVerifiedAt,
    };
  }

  clearSession(): void {
    this.parfumoDb.deleteSession();
  }

  markVerified(): void {
    this.parfumoDb.updateSessionVerified();
  }

  needsVerification(intervalMs: number): boolean {
    const session = this.parfumoDb.getSession();
    if (!session || !session.lastVerifiedAt) return true;

    const lastVerified = new Date(session.lastVerifiedAt + 'Z').getTime();
    return Date.now() - lastVerified > intervalMs;
  }
}
