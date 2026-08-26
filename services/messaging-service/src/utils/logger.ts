import { createLogger, format, transports } from 'winston';
import path from 'path';
import { SentryTransport } from './sentryTransport.js';

const customLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const logger = createLogger({
  levels: customLevels,
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ level, message, timestamp }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: path.join('logs', 'error.log'), level: 'error' }),
    new transports.File({ filename: path.join('logs', 'combined.log') }),
    ...(process.env.SENTRY_DSN ? [new SentryTransport({ level: 'error' })] : []),
  ],
});

export default logger;
