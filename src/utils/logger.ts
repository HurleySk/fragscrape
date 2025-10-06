import winston from 'winston';
import config from '../config/config';

/**
 * Custom log format for better readability in console
 */
const consoleFormat = winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${service}] ${level}: ${message}`;

  // Add metadata if present (excluding timestamp and service)
  const meta = Object.keys(metadata).length > 0 ? JSON.stringify(metadata, null, 2) : '';
  if (meta) {
    msg += `\n${meta}`;
  }

  return msg;
});

/**
 * Standardized JSON format for file logging
 * Includes consistent fields for structured logging
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

/**
 * Console format with colors for development
 */
const developmentConsoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.colorize(),
  consoleFormat
);

/**
 * Console format without colors for production (if needed)
 */
const productionConsoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss',
  }),
  consoleFormat
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: fileFormat,
  defaultMeta: {
    service: 'fragscrape',
    environment: config.api.nodeEnv,
  },
  transports: [
    // Write all logs with importance level of 'error' or less to error.log
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: config.logging.fileMaxSizeMB * 1024 * 1024, // Convert MB to bytes
      maxFiles: config.logging.fileMaxFiles,
    }),
    // Write all logs with importance level of 'info' or less to combined.log
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: config.logging.fileMaxSizeMB * 1024 * 1024, // Convert MB to bytes
      maxFiles: config.logging.fileMaxFiles,
    }),
  ],
});

// Add console transport based on environment
if (config.api.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: developmentConsoleFormat,
    })
  );
} else {
  // Even in production, we might want console logs for debugging
  logger.add(
    new winston.transports.Console({
      format: productionConsoleFormat,
      level: 'warn', // Only show warnings and errors in production console
    })
  );
}

export default logger;