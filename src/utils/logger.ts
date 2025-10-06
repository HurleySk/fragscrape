import winston from 'winston';
import config from '../config/config';

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  defaultMeta: { service: 'fragscrape' },
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

// If we're not in production, log to the console
if (config.api.nodeEnv !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  );
}

export default logger;