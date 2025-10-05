import axios, { AxiosInstance } from 'axios';
import config from '../config/config';
import logger from '../utils/logger';
import {
  DecodoAuthResponse,
  DecodoSubUserResponse,
  DecodoTrafficResponse,
  DecodoSubUser,
} from '../types';

class DecodoClient {
  private apiClient: AxiosInstance;
  private authToken: string | null = null;
  private userId: string | null = null;

  constructor() {
    this.apiClient = axios.create({
      baseURL: config.decodo.apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Authenticate with Decodo API
   */
  async authenticate(): Promise<void> {
    try {
      const response = await this.apiClient.post<DecodoAuthResponse>('/auth', {
        username: config.decodo.username,
        password: config.decodo.password,
      });

      this.authToken = response.data.token;
      this.userId = response.data.userId;

      // Set auth token for future requests
      this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${this.authToken}`;

      logger.info('Successfully authenticated with Decodo API');
    } catch (error) {
      logger.error('Failed to authenticate with Decodo API:', error);
      throw new Error('Decodo authentication failed');
    }
  }

  /**
   * Ensure we're authenticated before making requests
   */
  private async ensureAuthenticated(): Promise<void> {
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
      const response = await this.apiClient.get<DecodoSubUserResponse[]>(
        `/users/${this.userId}/sub-users`
      );
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
      const response = await this.apiClient.post<DecodoSubUserResponse>(
        `/users/${this.userId}/sub-users`,
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
      await this.apiClient.put(`/users/${this.userId}/sub-users/${subUserId}`, {
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
  async getSubUserTraffic(username: string): Promise<DecodoTrafficResponse> {
    await this.ensureAuthenticated();

    try {
      const response = await this.apiClient.get<DecodoTrafficResponse>(
        `/users/${this.userId}/sub-users/${username}/traffic`
      );
      return response.data;
    } catch (error) {
      logger.error(`Failed to get traffic for sub-user ${username}:`, error);
      throw error;
    }
  }

  /**
   * Delete a sub-user
   */
  async deleteSubUser(subUserId: string): Promise<void> {
    await this.ensureAuthenticated();

    try {
      await this.apiClient.delete(`/users/${this.userId}/sub-users/${subUserId}`);
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