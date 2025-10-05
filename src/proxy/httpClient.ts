import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import proxyManager from './proxyManager';
import logger from '../utils/logger';
import { ProxyConfig } from '../types';

class HttpClient {
  private axiosInstance: AxiosInstance | null = null;

  /**
   * Create an axios instance with proxy configuration
   */
  private async createAxiosInstance(): Promise<AxiosInstance> {
    const proxyConfig = await proxyManager.getProxyConfig();

    const axiosConfig: AxiosRequestConfig = {
      timeout: 30000,
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
    logger.info('HTTP client reset - will use new proxy on next request');
  }

  /**
   * Perform a GET request through the proxy
   */
  async get(url: string, config?: AxiosRequestConfig): Promise<any> {
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
        throw new Error('Access forbidden - rotating proxy');
      }

      logger.error(`HTTP GET error for ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * Perform a POST request through the proxy
   */
  async post(url: string, data?: any, config?: AxiosRequestConfig): Promise<any> {
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
        throw new Error('Access forbidden - rotating proxy');
      }

      logger.error(`HTTP POST error for ${url}:`, error.message);
      throw error;
    }
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

  /**
   * Add delay between requests to avoid rate limiting
   */
  async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new HttpClient();