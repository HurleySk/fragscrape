import logger from './logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'ENETUNREACH',
    'EAI_AGAIN',
  ],
};

/**
 * Retry a function with exponential backoff
 * @param fn The async function to retry
 * @param options Retry configuration options
 * @returns The result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | undefined;
  let delay = config.initialDelay;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if this is the last attempt
      if (attempt === config.maxRetries) {
        logger.error(`All ${config.maxRetries + 1} retry attempts failed`);
        break;
      }

      // Check if error is retryable
      const isRetryable =
        error.code && config.retryableErrors.includes(error.code) ||
        error.response?.status === 429 || // Rate limiting
        error.response?.status === 503 || // Service unavailable
        error.response?.status === 502;   // Bad gateway

      if (!isRetryable) {
        logger.debug(`Non-retryable error: ${error.message || error.code}`);
        throw error;
      }

      // Log retry attempt
      logger.warn(
        `Attempt ${attempt + 1}/${config.maxRetries + 1} failed: ${error.message || error.code}. ` +
        `Retrying in ${delay}ms...`
      );

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));

      // Calculate next delay with exponential backoff
      delay = Math.min(delay * config.backoffMultiplier, config.maxDelay);
    }
  }

  // If we get here, all retries failed
  throw lastError;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: any, retryableErrors: string[]): boolean {
  return (
    (error.code && retryableErrors.includes(error.code)) ||
    error.response?.status === 429 ||
    error.response?.status === 503 ||
    error.response?.status === 502
  );
}
