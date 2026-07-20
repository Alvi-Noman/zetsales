import { env } from '@zetsales/config/validateEnv';
import './instrument.js';
import app from './app.js';
import { connectDb, client } from './utils/db.js';
import logger from './utils/logger.js';

const PORT = Number(env.PORT) || 3002;
let server: ReturnType<typeof app.listen> | null = null;

async function startServer() {
  try {
    logger.info(`Starting in ${process.env.NODE_ENV || 'development'} mode`);
    await connectDb();

    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Commerce service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start server', { stack: (err as Error)?.stack, message: (err as Error)?.message });
    process.exit(1);
  }
}

let shuttingDown = false;

// server.close()'s callback only fires once every open connection ends — a single long-lived
// SSE stream (product push progress, store import) left open would otherwise stall this forever,
// leaving the process neither serving requests nor actually exited, so Docker's restart policy
// (which only triggers on a real exit) never kicks in. The hard timeout guarantees the process
// always exits so the container gets restarted even if a stream never gracefully closes.
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received. Shutting down...`);

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 8_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      logger.info('HTTP server closed.');
    }
    await client.close();
    logger.info('MongoDB connection closed.');
  } catch (err) {
    logger.error('Error during shutdown', { stack: (err as Error)?.stack, message: (err as Error)?.message });
  } finally {
    clearTimeout(forceExit);
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : undefined;
  logger.error('Unhandled Rejection', { stack: err?.stack, reason: err ? undefined : String(reason) });
  shutdown('unhandledRejection');
});

startServer();
