import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/config';
import logger from './utils/logger';
import database from './database/database';
import { isProxyConfigured } from './proxy/proxyConfig';
import perfumeRoutes from './api/routes/perfume';
import proxyRoutes from './api/routes/proxy';
import queryRoutes from './api/routes/queries';
import perfumeDataRoutes, { collectionRouter, tagsRouter, cleanupRouter } from './api/routes/perfumeData';
import authRoutes from './api/routes/auth';
import parfumoCollectionRoutes from './api/routes/parfumoCollection';
import parfumoRatingRoutes from './api/routes/parfumoRating';
import parfumoReviewRoutes from './api/routes/parfumoReview';
import syncRoutes from './api/routes/sync';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';
import { displayStartupBanner } from './utils/banner';
import { TIMEOUT_CONFIG } from './constants/scraping';

const app = express();

// Middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: 'Too many requests from this IP, please try again later.',
});

app.use('/api', limiter);

app.get('/health', (_req, res) => {
  try {
    const dbOk = database.healthCheck();
    const memUsage = process.memoryUsage();
    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

    res.json({
      status: dbOk ? 'healthy' : 'degraded',
      timestamp: new Date(),
      environment: config.api.nodeEnv,
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        readable: `${uptimeHours}h ${uptimeMinutes}m`,
      },
      database: { status: dbOk ? 'ok' : 'error' },
      proxy: { configured: isProxyConfigured() },
      memory: {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMB: Math.round(memUsage.rss / 1024 / 1024),
      },
    });
  } catch (error) {
    logger.error('Health check error:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date(),
      error: 'Health check failed',
    });
  }
});

// API routes
app.use('/api', perfumeRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/queries', queryRoutes);
app.use('/api/perfumes', perfumeDataRoutes);
app.use('/api/collection', collectionRouter);
app.use('/api/tags', tagsRouter);
app.use('/api/cleanup', cleanupRouter);
app.use('/api/auth', authRoutes);
app.use('/api/parfumo/collection', parfumoCollectionRoutes);
app.use('/api/parfumo/rating', parfumoRatingRoutes);
app.use('/api/parfumo/reviews', parfumoReviewRoutes);
app.use('/api/sync', syncRoutes);

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Global server variable
let server: any;

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  // Stop accepting new requests
  server?.close(() => {
    try {
      database.close();

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, TIMEOUT_CONFIG.GRACEFUL_SHUTDOWN);
};

// Start server
const startServer = async () => {
  try {
    await database.initialize();

    if (!isProxyConfigured()) {
      logger.warn('DECODO_PROXY_URL is not set - scraping will use direct connections (no proxy)');
    }

    // Start server
    const port = config.api.port;
    server = app.listen(port, () => {
      logger.info(`🚀 Fragscrape API server running on port ${port}`);

      // Read version from package.json
      const packageJson = require('../package.json');
      displayStartupBanner({ version: packageJson.version, port });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the server
startServer();