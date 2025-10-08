import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import proxyManager from './proxyManager';
import logger from '../utils/logger';
import { ProxyError, RateLimitError } from '../api/middleware/errorHandler';
import { IHttpClient } from './types';
import { retryWithBackoff } from '../utils/retry';
import { BaseProxyClient } from './BaseProxyClient';
import { TIMEOUT_CONFIG } from '../constants/scraping';

class HttpClient extends BaseProxyClient implements IHttpClient {
  private axiosInstance: AxiosInstance | null = null;

  /**
   * Create an axios instance with proxy configuration
   */
  private async createAxiosInstance(): Promise<AxiosInstance> {
    // Get or create session ID
    const sessionId = this.getSessionId();

    // Get proxy config with formatted username (includes session and country)
    const proxyConfig = await proxyManager.getProxyConfig({ sessionId });

    const axiosConfig: AxiosRequestConfig = {
      timeout: TIMEOUT_CONFIG.HTTP_TIMEOUT,
      maxRedirects: 10,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      proxy: {
        host: proxyConfig.endpoint,
        port: proxyConfig.port,
        auth: {
          username: proxyConfig.username,
          password: proxyConfig.password,
        },
        protocol: 'http',
      },
    };

    logger.info(`HTTP client created with proxy: ${proxyConfig.endpoint}:${proxyConfig.port} (session: ${sessionId})`);

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
    logger.info('HTTP client reset - will use new proxy and session on next request');
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

        logger.error(`HTTP GET error for ${url}:`, error.message);
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

        logger.error(`HTTP POST error for ${url}:`, error.message);
        throw new ProxyError(`HTTP POST failed for ${url}`, error);
      }
    });
  }

  /**
   * Test the proxy connection
   */
  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple IP check service
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