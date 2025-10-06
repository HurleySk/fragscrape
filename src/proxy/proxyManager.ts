import decodoClient from './decodoClient';
import logger from '../utils/logger';
import config from '../config/config';
import database from '../database/database';
import { DecodoSubUser, ProxyConfig } from '../types';
import { EventEmitter } from 'events';
import { ProxyError, NotFoundError, ValidationError } from '../api/middleware/errorHandler';

class ProxyManager extends EventEmitter {
  private currentSubUser: DecodoSubUser | null = null;
  private subUsers: Map<string, DecodoSubUser> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startMonitoring();
  }

  /**
   * Get current proxy configuration
   * @param options.sessionId - Optional session ID for sticky sessions (same IP across requests)
   * @param options.includeFormatting - Whether to format username with country and session (default: true)
   */
  async getProxyConfig(options?: { sessionId?: string; includeFormatting?: boolean }): Promise<ProxyConfig> {
    const subUser = await this.getCurrentSubUser();
    const includeFormatting = options?.includeFormatting ?? true;

    let username = subUser.username;

    // Format username for Decodo with geo-targeting and session if requested
    if (includeFormatting && options?.sessionId) {
      // Format: user-{username}-country-{country}-session-{sessionId}
      username = `user-${subUser.username}-country-${config.decodo.proxyCountry}-session-${options.sessionId}`;
    }

    return {
      endpoint: config.decodo.proxyEndpoint,
      port: config.decodo.proxyPort,
      username,
      password: subUser.password,
    };
  }

  /**
   * Get or create an active sub-user
   */
  private async getCurrentSubUser(): Promise<DecodoSubUser> {
    // If we have a current sub-user that's still active, return it
    if (this.currentSubUser && this.currentSubUser.status === 'active') {
      const isNearLimit = await this.checkSubUserUsage(this.currentSubUser);
      if (!isNearLimit) {
        return this.currentSubUser;
      }
    }

    // Find an active sub-user from our pool
    for (const subUser of this.subUsers.values()) {
      if (subUser.status === 'active') {
        const isNearLimit = await this.checkSubUserUsage(subUser);
        if (!isNearLimit) {
          this.currentSubUser = subUser;
          return subUser;
        }
      }
    }

    // No active sub-user found, request creation of a new one
    logger.warn('No active sub-users available. Requesting new sub-user creation.');
    this.emit('new-subuser-needed');

    // Wait for user to create new sub-user
    throw new ProxyError(
      'No active sub-users available. Please create a new sub-user via the /api/proxy/create-subuser endpoint.'
    );
  }

  /**
   * Check if a sub-user is approaching its traffic limit
   */
  private async checkSubUserUsage(subUser: DecodoSubUser): Promise<boolean> {
    try {
      const traffic = await decodoClient.getSubUserTraffic(subUser.id);

      // Update our local record
      subUser.trafficUsed = traffic.traffic_used;
      subUser.lastChecked = new Date();

      const usedMB = traffic.traffic_used / (1024 * 1024);
      const limitMB = traffic.traffic_limit / (1024 * 1024);
      const thresholdMB = config.subUserManagement.warningThresholdMB;

      if (usedMB >= limitMB) {
        // Sub-user has exhausted its limit
        subUser.status = 'exhausted';
        this.emit('subuser-exhausted', subUser);
        logger.warn(`Sub-user ${subUser.username} has exhausted its traffic limit`);
        return true;
      }

      if (usedMB >= thresholdMB) {
        // Sub-user is approaching limit
        this.emit('subuser-near-limit', subUser);
        logger.warn(
          `Sub-user ${subUser.username} is approaching limit: ${usedMB.toFixed(2)}MB / ${limitMB}MB`
        );
        return true;
      }

      logger.debug(
        `Sub-user ${subUser.username} usage: ${usedMB.toFixed(2)}MB / ${limitMB}MB`
      );
      return false;
    } catch (error) {
      logger.error(`Failed to check usage for sub-user ${subUser.username}:`, error);
      return true; // Assume it's near limit if we can't check
    }
  }

  /**
   * Create a new sub-user
   */
  async createSubUser(): Promise<DecodoSubUser> {
    const username = decodoClient.generateSubUserName();
    const password = decodoClient.generatePassword();

    try {
      const response = await decodoClient.createSubUser(username, password);

      const subUser: DecodoSubUser = {
        id: response.id.toString(),
        username: response.username,
        password: password, // Store the password we generated
        status: 'active',
        trafficLimit: response.traffic_limit,
        trafficUsed: 0,
        serviceType: response.service_type,
        createdAt: new Date(response.created_at),
        lastChecked: new Date(),
      };

      this.subUsers.set(subUser.id, subUser);
      this.currentSubUser = subUser;

      // Save to database for persistence
      database.saveSubUser(subUser);

      logger.info(`Created new sub-user: ${username}`);
      return subUser;
    } catch (error) {
      logger.error('Failed to create sub-user:', error);
      throw error;
    }
  }

  /**
   * Add an existing sub-user to the local database
   */
  async addExistingSubUser(username: string, password: string): Promise<DecodoSubUser> {
    try {
      // First, check if we already have this sub-user in our database
      const dbSubUsers = database.getSubUsers();
      const existing = dbSubUsers.find(su => su.username === username);
      if (existing) {
        throw new ValidationError(`Sub-user ${username} already exists in local database`);
      }

      // Fetch all sub-users from Decodo API to find this one
      const apiSubUsers = await decodoClient.getSubUsers();
      const apiSubUser = apiSubUsers.find(su => su.username === username);

      if (!apiSubUser) {
        throw new NotFoundError(`Sub-user ${username}`);
      }

      // Get current traffic usage
      const traffic = await decodoClient.getSubUserTraffic(apiSubUser.id.toString());

      // Determine status based on traffic usage
      const usedMB = traffic.traffic_used / (1024 * 1024);
      const limitMB = traffic.traffic_limit / (1024 * 1024);
      let status: 'active' | 'exhausted' | 'error' = 'active';

      if (usedMB >= limitMB) {
        status = 'exhausted';
      } else if (usedMB >= config.subUserManagement.warningThresholdMB) {
        // Still active but approaching limit
        logger.warn(`Sub-user ${username} is approaching limit: ${usedMB.toFixed(2)}MB / ${limitMB}MB`);
      }

      // Create the sub-user object
      const subUser: DecodoSubUser = {
        id: apiSubUser.id.toString(),
        username: apiSubUser.username,
        password: password, // Store the password provided by user
        status: status,
        trafficLimit: traffic.traffic_limit,
        trafficUsed: traffic.traffic_used,
        serviceType: apiSubUser.service_type,
        createdAt: new Date(apiSubUser.created_at),
        lastChecked: new Date(),
      };

      // Add to our local pool
      this.subUsers.set(subUser.id, subUser);

      // Save to database for persistence
      database.saveSubUser(subUser);

      logger.info(`Added existing sub-user: ${username} (status: ${status})`);
      return subUser;
    } catch (error) {
      logger.error('Failed to add existing sub-user:', error);
      throw error;
    }
  }

  /**
   * Load existing sub-users from database and Decodo
   */
  async loadSubUsers(): Promise<void> {
    try {
      // First, load sub-users from our database (where we have passwords stored)
      const dbSubUsers = database.getSubUsers();
      for (const su of dbSubUsers) {
        if (su.password) { // Only add if we have the password
          this.subUsers.set(su.id, su);
          logger.info(`Loaded sub-user from database: ${su.username} (status: ${su.status})`);
        }
      }

      // Try to sync with Decodo API (optional, may fail with API key auth)
      try {
        const apiSubUsers = await decodoClient.getSubUsers();
        for (const su of apiSubUsers) {
          // Update existing sub-user info if we have it
          const existing = Array.from(this.subUsers.values()).find(s => s.username === su.username);
          if (existing) {
            // Validate and set status
            if (su.status === 'active' || su.status === 'exhausted' || su.status === 'error') {
              existing.status = su.status;
            }
            existing.trafficUsed = su.traffic_bytes || 0;
            existing.trafficLimit = su.traffic_limit || existing.trafficLimit;
            logger.info(`Updated sub-user from API: ${su.username} (status: ${su.status})`);
          } else {
            // New sub-user from API that we don't have password for
            logger.info(`Found sub-user in API without password: ${su.username} (status: ${su.status})`);
          }
        }
      } catch (apiError) {
        // API sync failed, but that's OK - we have our local database
        logger.debug('Could not sync with Decodo API, using local database only');
      }
    } catch (error) {
      logger.error('Failed to load sub-users:', error);
    }
  }

  /**
   * Start monitoring sub-user usage
   */
  private startMonitoring(): void {
    // Check usage every 5 minutes
    this.checkInterval = setInterval(async () => {
      if (this.currentSubUser) {
        await this.checkSubUserUsage(this.currentSubUser);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Get all sub-users
   */
  getAllSubUsers(): DecodoSubUser[] {
    return Array.from(this.subUsers.values());
  }

  /**
   * Get sub-user statistics
   */
  getStatistics() {
    const subUsers = this.getAllSubUsers();
    const active = subUsers.filter(su => su.status === 'active').length;
    const exhausted = subUsers.filter(su => su.status === 'exhausted').length;

    let totalUsed = 0;
    let totalLimit = 0;

    for (const su of subUsers) {
      totalUsed += su.trafficUsed;
      totalLimit += su.trafficLimit;
    }

    return {
      totalSubUsers: subUsers.length,
      activeSubUsers: active,
      exhaustedSubUsers: exhausted,
      totalTrafficUsedMB: totalUsed / (1024 * 1024),
      totalTrafficLimitMB: totalLimit / (1024 * 1024),
      currentSubUser: this.currentSubUser?.username || null,
    };
  }
}

export default new ProxyManager();