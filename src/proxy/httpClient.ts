import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { getProxyConfig, isProxyConfigured } from './proxyConfig';
import logger from '../utils/logger';
import { ProxyError, RateLimitError } from '../api/middleware/errorHandler';
import { IHttpClient } from './types';
import { retryWithBackoff } from '../utils/retry';
import { BaseProxyClient } from './BaseProxyClient';
import { TIMEOUT_CONFIG } from '../constants/scraping';
import { HTTP_HEADERS } from './headers';

class HttpClient extends BaseProxyClient implements IHttpClient {
  private axiosInstance: AxiosInstance | null = null;

  /**
   * Create an axios instance with proxy configuration
   */
  private async createAxiosInstance(): Promise<AxiosInstance> {
    const axiosConfig: AxiosRequestConfig = {
      timeout: TIMEOUT_CONFIG.HTTP_TIMEOUT,
      maxRedirects: 10,
      headers: { ...HTTP_HEADERS },
    };

    if (isProxyConfigured()) {
      const sessionId = this.getSessionId();
      const proxyConfig = getProxyConfig(sessionId);
      axiosConfig.proxy = {
        host: proxyConfig.endpoint,
        port: proxyConfig.port,
        auth: {
          username: proxyConfig.username,
          password: proxyConfig.password,
        },
        protocol: 'http',
      };
      logger.info(`HTTP client created with proxy: ${proxyConfig.endpoint}:${proxyConfig.port} (session: ${sessionId})`);
    } else {
      logger.info('HTTP client created in direct mode (no proxy configured)');
    }

    return axios.create(axiosConfig);
  }

  /**
   * Get axios instance (create if needed)
   */
  private async getAxiosInstance(): Promise<AxiosInstance> {
    if (!this.axiosInstance) {
      this.axiosInstance = await this.createAxiosInstance();
    }
    return this.axiosInstance;
  }

  /**
   * Reset the axios instance (useful when rotating proxies)
   */
  async reset(): Promise<void> {
    this.axiosInstance = null;
    this.resetSessionId();
    logger.info('HTTP client reset - will reconnect on next request');
  }

  /**
   * Perform a GET request through the proxy with retry logic
   */
  async get(url: string, config?: AxiosRequestConfig): Promise<any> {
    return retryWithBackoff(async () => {
      const client = await this.getAxiosInstance();

      try {
        logger.debug(`GET request to: ${url}`);
        const response = await client.get(url, config);
        return response.data;
      } catch (error: any) {
        if (error.response?.status === 403) {
          logger.warn('Received 403 - possible rate limiting or IP block');
          // Trigger proxy rotation
          await this.reset();
          throw new RateLimitError('Access forbidden - rotating proxy');
        }

        logger.error(`HTTP GET error for ${url}: ${error.message}`);
        throw new ProxyError(`HTTP GET failed for ${url}`, error);
      }
    });
  }

  /**
   * Perform a POST request through the proxy with retry logic
   */
  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<any> {
    return retryWithBackoff(async () => {
      const client = await this.getAxiosInstance();

      try {
        logger.debug(`POST request to: ${url}`);
        const response = await client.post(url, data, config);
        return response.data;
      } catch (error: any) {
        if (error.response?.status === 403) {
          logger.warn('Received 403 - possible rate limiting or IP block');
          // Trigger proxy rotation
          await this.reset();
          throw new RateLimitError('Access forbidden - rotating proxy');
        }

        logger.error(`HTTP POST error for ${url}: ${error.message}`);
        throw new ProxyError(`HTTP POST failed for ${url}`, error);
      }
    });
  }

  /**
   * Test the proxy connection
   */
  async testConnection(): Promise<boolean> {
    if (!isProxyConfigured()) {
      logger.info('No proxy configured - HTTP client operating in direct mode');
      return true;
    }
    try {
      const response = await this.get('https://ip.decodo.com/');
      logger.info(`Proxy test successful. Current IP: ${JSON.stringify(response)}`);
      return true;
    } catch (error) {
      logger.error('Proxy test failed:', error);
      return false;
    }
  }
}

export default new HttpClient();