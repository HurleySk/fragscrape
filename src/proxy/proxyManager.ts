import decodoClient from './decodoClient';
import logger from '../utils/logger';
import config from '../config/config';
import { DecodoSubUser, ProxyConfig } from '../types';
import { EventEmitter } from 'events';

interface ProxyManagerEvents {
  'subuser-near-limit': (subUser: DecodoSubUser) => void;
  'subuser-exhausted': (subUser: DecodoSubUser) => void;
  'new-subuser-needed': () => void;
}

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
   */
  async getProxyConfig(): Promise<ProxyConfig> {
    const subUser = await this.getCurrentSubUser();

    return {
      endpoint: config.decodo.proxyEndpoint,
      port: config.decodo.proxyPort,
      username: subUser.username,
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
    throw new Error(
      'No active sub-users available. Please create a new sub-user via the /api/proxy/create-subuser endpoint.'
    );
  }

  /**
   * Check if a sub-user is approaching its traffic limit
   */
  private async checkSubUserUsage(subUser: DecodoSubUser): Promise<boolean> {
    try {
      const traffic = await decodoClient.getSubUserTraffic(subUser.username);

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
        id: response.id,
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

      logger.info(`Created new sub-user: ${username}`);
      return subUser;
    } catch (error) {
      logger.error('Failed to create sub-user:', error);
      throw error;
    }
  }

  /**
   * Load existing sub-users from Decodo
   */
  async loadSubUsers(): Promise<void> {
    try {
      const subUsers = await decodoClient.getSubUsers();

      for (const su of subUsers) {
        // We don't have passwords for existing sub-users, so we'll need to skip them
        // or implement a password reset mechanism
        logger.info(`Found existing sub-user: ${su.username} (status: ${su.status})`);
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