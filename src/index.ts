import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config/config';
import logger from './utils/logger';
import database from './database/database';
import proxyManager from './proxy/proxyManager';
import perfumeRoutes from './api/routes/perfume';
import proxyRoutes from './api/routes/proxy';
import { errorHandler, notFoundHandler } from './api/middleware/errorHandler';

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

// Enhanced health check endpoint
app.get('/health', (_req, res) => {
  try {
    // Get proxy statistics
    const proxyStats = proxyManager.getStatistics();

    // Calculate memory usage
    const memUsage = process.memoryUsage();

    // Calculate uptime
    const uptimeSeconds = process.uptime();
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

    // Database health check
    let databaseStatus = 'ok';
    try {
      database.getSubUsers(); // Simple query to verify database is responsive
    } catch (error) {
      databaseStatus = 'error';
    }

    res.json({
      status: databaseStatus === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date(),
      environment: config.api.nodeEnv,
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        readable: `${uptimeHours}h ${uptimeMinutes}m`,
      },
      database: {
        status: databaseStatus,
      },
      proxy: {
        totalSubUsers: proxyStats.totalSubUsers,
        activeSubUsers: proxyStats.activeSubUsers,
        exhaustedSubUsers: proxyStats.exhaustedSubUsers,
        currentSubUser: proxyStats.currentSubUser,
        totalTrafficUsedMB: Math.round(proxyStats.totalTrafficUsedMB),
        totalTrafficLimitMB: Math.round(proxyStats.totalTrafficLimitMB),
      },
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
      // Clean up resources
      proxyManager.stopMonitoring();
      database.close();

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

// Start server
const startServer = async () => {
  try {
    // Initialize database
    await database.initialize();

    // Load existing sub-users
    await proxyManager.loadSubUsers();

    // Set up proxy manager event listeners
    proxyManager.on('new-subuser-needed', () => {
      logger.warn('⚠️  NEW SUB-USER NEEDED - Please create one via /api/proxy/create-subuser');
      console.log('\n⚠️  ATTENTION: A new Decodo sub-user is needed!');
      console.log('Please create one by calling: POST /api/proxy/create-subuser\n');
    });

    proxyManager.on('subuser-near-limit', (subUser) => {
      const usedMB = subUser.trafficUsed / (1024 * 1024);
      const limitMB = subUser.trafficLimit / (1024 * 1024);
      logger.warn(`Sub-user ${subUser.username} approaching limit: ${usedMB.toFixed(2)}/${limitMB}MB`);
    });

    proxyManager.on('subuser-exhausted', (subUser) => {
      logger.warn(`Sub-user ${subUser.username} has exhausted its traffic limit`);
    });

    // Start cleanup interval
    const cleanupIntervalMs = config.cleanup.intervalHours * 60 * 60 * 1000;
    logger.info(`Starting cleanup interval: every ${config.cleanup.intervalHours} hours`);

    setInterval(() => {
      try {
        database.cleanupExpiredCache();
        database.cleanupOldRequestLogs(config.cleanup.logRetentionDays);
      } catch (error) {
        logger.error('Cleanup error:', error);
      }
    }, cleanupIntervalMs);

    // Start server
    const port = config.api.port;
    server = app.listen(port, () => {
      logger.info(`🚀 Fragscrape API server running on port ${port}`);
      console.log(`
╔══════════════════════════════════════════════════╗
║           Fragscrape API Server v1.1.1           ║
╚══════════════════════════════════════════════════╝

🚀 Server running at: http://localhost:${port}

API Endpoints:
  Perfume:
    • GET  /api/search?q=query          - Search perfumes
    • GET  /api/perfume/:brand/:name    - Get perfume details
    • POST /api/perfume/by-url          - Get perfume by URL
    • GET  /api/brand/:brand            - List brand perfumes

  Proxy Management:
    • GET  /api/proxy/status            - View proxy status & usage
    • GET  /api/proxy/subusers          - List all sub-users
    • POST /api/proxy/create-subuser    - Create new sub-user (1GB)
    • POST /api/proxy/add-subuser       - Add existing sub-user to DB
    • GET  /api/proxy/test              - Test proxy connection
    • POST /api/proxy/rotate            - Force rotate proxy

⚠️  Remember to create a Decodo sub-user before starting!
   Use: curl -X POST http://localhost:${port}/api/proxy/create-subuser
      `);
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