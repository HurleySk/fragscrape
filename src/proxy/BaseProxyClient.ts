import { randomUUID } from 'crypto';
import logger from '../utils/logger';

/**
 * Base class for proxy clients (HTTP and Browser)
 * Provides shared functionality like session management and delays
 */
export abstract class BaseProxyClient {
  protected sessionId: string | null = null;

  /**
   * Generate a session ID for sticky sessions (same IP across requests)
   */
  protected generateSessionId(): string {
    return `session_${randomUUID()}`;
  }

  /**
   * Get or create session ID
   */
  protected getSessionId(): string {
    if (!this.sessionId) {
      this.sessionId = this.generateSessionId();
    }
    return this.sessionId;
  }

  /**
   * Reset session ID (useful for getting new IPs)
   */
  protected resetSessionId(): void {
    this.sessionId = null;
    logger.debug('Session ID reset - will use new session on next request');
  }

  /**
   * Add delay between requests to avoid rate limiting
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Reset the client (useful when rotating proxies)
   */
  abstract reset(): Promise<void>;

  /**
   * Test the proxy connection
   */
  abstract testConnection(): Promise<boolean>;
}
