import axios, { AxiosInstance } from 'axios';
import config from '../config/config';
import logger from '../utils/logger';
import {
  DecodoAuthResponse,
  DecodoSubUserResponse,
  DecodoTrafficResponse,
} from '../types';

class DecodoClient {
  private apiClient: AxiosInstance;
  private authToken: string | null = null;
  private userId: string | null = null;
  private usingApiKey: boolean = false;

  constructor() {
    const headers: any = {
      'Content-Type': 'application/json',
    };

    // If API key is provided, set it immediately
    if (config.decodo.apiKey) {
      headers['Authorization'] = config.decodo.apiKey;
      this.usingApiKey = true;
      logger.info('Decodo client configured with API key authentication');
    }

    // API key authentication uses v2, username/password uses v1
    const baseURL = this.usingApiKey
      ? 'https://api.decodo.com/v2'
      : config.decodo.apiUrl;

    this.apiClient = axios.create({
      baseURL,
      timeout: 10000,
      headers,
    });
  }

  /**
   * Authenticate with Decodo API
   */
  async authenticate(): Promise<void> {
    // Skip if using API key authentication
    if (this.usingApiKey) {
      logger.debug('Using API key authentication, skipping auth endpoint');
      return;
    }

    // Ensure username and password are provided for legacy auth
    if (!config.decodo.username || !config.decodo.password) {
      throw new Error('Username and password required when not using API key');
    }

    try {
      const response = await this.apiClient.post<DecodoAuthResponse>('/auth', {
        username: config.decodo.username,
        password: config.decodo.password,
      });

      this.authToken = response.data.token;
      this.userId = response.data.userId;

      // Set auth token for future requests
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;

      logger.info('Successfully authenticated with Decodo API using username/password');
    } catch (error) {
      logger.error('Failed to authenticate with Decodo API:', error);
      throw new Error('Decodo authentication failed');
    }
  }

  /**
   * Ensure we're authenticated before making requests
   */
  private async ensureAuthenticated(): Promise<void> {
    // If using API key, we're always authenticated
    if (this.usingApiKey) {
      return;
    }

    // For username/password auth, check if we have a token
    if (!this.authToken || !this.userId) {
      await this.authenticate();
    }
  }

  /**
   * Get all sub-users
   */
  async getSubUsers(): Promise<DecodoSubUserResponse[]> {
    await this.ensureAuthenticated();

    try {
      // API key authentication uses v2 /sub-users endpoint
      const url = this.usingApiKey ? '/sub-users' : `/users/${this.userId}/sub-users`;
      const response = await this.apiClient.get<DecodoSubUserResponse[]>(url);
      return response.data;
    } catch (error) {
      logger.error('Failed to get sub-users:', error);
      throw error;
    }
  }

  /**
   * Create a new sub-user with traffic limit
   */
  async createSubUser(username: string, password: string): Promise<DecodoSubUserResponse> {
    await this.ensureAuthenticated();

    try {
      // API key authentication uses v2 /sub-users endpoint
      const url = this.usingApiKey ? '/sub-users' : `/users/${this.userId}/sub-users`;
      const response = await this.apiClient.post<DecodoSubUserResponse>(
        url,
        {
          username,
          password,
          service_type: 'residential',
          traffic_limit: config.subUserManagement.trafficLimitGB * 1024 * 1024 * 1024, // Convert GB to bytes
        }
      );

      logger.info(`Created sub-user: ${username}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to create sub-user:', error);
      throw error;
    }
  }

  /**
   * Update sub-user (e.g., change traffic limit)
   */
  async updateSubUser(subUserId: string, trafficLimit: number, password?: string): Promise<void> {
    await this.ensureAuthenticated();

    try {
      const url = this.usingApiKey ? `/sub-users/${subUserId}` : `/users/${this.userId}/sub-users/${subUserId}`;
      await this.apiClient.put(url, {
        traffic_limit: trafficLimit,
        ...(password && { password }),
      });

      logger.info(`Updated sub-user: ${subUserId}`);
    } catch (error) {
      logger.error('Failed to update sub-user:', error);
      throw error;
    }
  }

  /**
   * Get traffic usage for a sub-user
   */
  async getSubUserTraffic(subUserId: string): Promise<DecodoTrafficResponse> {
    await this.ensureAuthenticated();

    try {
      // For API key auth (v2), traffic is included in the sub-users list
      if (this.usingApiKey) {
        const subUsers = await this.getSubUsers();
        const subUser = subUsers.find(su => su.id === subUserId || su.username === subUserId);

        if (!subUser) {
          throw new Error(`Sub-user ${subUserId} not found`);
        }

        // Return traffic data in the expected format
        return {
          traffic_used: subUser.traffic_bytes || 0,
          traffic_limit: subUser.traffic_limit_bytes || 0,
        };
      }

      // For username/password auth (v1), use the dedicated traffic endpoint
      const url = `/users/${this.userId}/sub-users/${subUserId}/traffic`;
      const response = await this.apiClient.get<DecodoTrafficResponse>(url);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get traffic for sub-user ${subUserId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a sub-user
   */
  async deleteSubUser(subUserId: string): Promise<void> {
    await this.ensureAuthenticated();

    try {
      const url = this.usingApiKey ? `/sub-users/${subUserId}` : `/users/${this.userId}/sub-users/${subUserId}`;
      await this.apiClient.delete(url);
      logger.info(`Deleted sub-user: ${subUserId}`);
    } catch (error) {
      logger.error('Failed to delete sub-user:', error);
      throw error;
    }
  }

  /**
   * Generate a unique sub-user name
   */
  generateSubUserName(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `fragscrape_${timestamp}_${random}`;
  }

  /**
   * Generate a secure password
   */
  generatePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}

export default new DecodoClient();