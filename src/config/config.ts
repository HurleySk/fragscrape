import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  decodo: z.object({
    apiUrl: z.string().url(),
    apiKey: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
    proxyEndpoint: z.string(),
    proxyPort: z.number(),
    proxyCountry: z.string().default('us'), // Country code for geo-targeting (e.g., 'us', 'uk', 'de')
  }).refine(
    (data) => data.apiKey || (data.username && data.password),
    { message: "Either apiKey or username/password must be provided for Decodo authentication" }
  ),
  api: z.object({
    port: z.number(),
    nodeEnv: z.enum(['development', 'production', 'test']),
  }),
  database: z.object({
    path: z.string(),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
  }),
  rateLimit: z.object({
    windowMs: z.number(),
    maxRequests: z.number(),
  }),
  subUserManagement: z.object({
    trafficLimitGB: z.number(),
    warningThresholdMB: z.number(),
  }),
  browser: z.object({
    executablePath: z.string().optional(),
  }),
});

export type Config = z.infer<typeof configSchema>;

const config: Config = {
  decodo: {
    apiUrl: process.env.DECODO_API_URL || 'https://api.decodo.com/v1',
    apiKey: process.env.DECODO_API_KEY,
    username: process.env.DECODO_USERNAME,
    password: process.env.DECODO_PASSWORD,
    proxyEndpoint: process.env.DECODO_PROXY_ENDPOINT || 'gate.decodo.com',
    proxyPort: parseInt(process.env.DECODO_PROXY_PORT || '7000', 10),
    proxyCountry: process.env.DECODO_PROXY_COUNTRY || 'us',
  },
  api: {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
  },
  database: {
    path: process.env.DATABASE_PATH || './data/fragscrape.db',
  },
  logging: {
    level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },
  subUserManagement: {
    trafficLimitGB: parseFloat(process.env.SUB_USER_TRAFFIC_LIMIT_GB || '1'),
    warningThresholdMB: parseFloat(process.env.SUB_USER_WARNING_THRESHOLD_MB || '900'),
  },
  browser: {
    executablePath: process.env.BROWSER_EXECUTABLE_PATH,
  },
};

// Validate configuration at startup
try {
  configSchema.parse(config);
} catch (error) {
  console.error('Invalid configuration:', error);
  process.exit(1);
}

export default config;