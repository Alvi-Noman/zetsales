import { env } from '@zetsales/config/validateEnv';
import app from './app.js';
import { connectDb, client } from './utils/db.js';
import logger from './utils/logger.js';

const PORT = Number(env.PORT) || 3001;
let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    logger.info(`Starting in ${process.env.NODE_ENV || 'development'} mode`);
    await connectDb();

    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Auth service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err as Error);
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`${signal} received. Closing MongoDB connection...`);
  await client.close();
  logger.info('MongoDB connection closed.');
  if (server) {
    logger.info('Closing HTTP server...');
    server.close(() => {
      logger.info('HTTP server closed. Exiting process.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  shutdown('unhandledRejection');
});

startServer();
