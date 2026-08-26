import express, { type Application, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';

import accountsRoutes from './routes/accountsRoutes.js';
import conversationsRoutes from './routes/conversationsRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import logger from './utils/logger.js';
import * as Sentry from '@sentry/node';
import { errorHandler } from './middleware/errorHandler.js';
import { UPLOAD_DIR } from './middleware/upload.js';

const app: Application = express();

app.set('trust proxy', 1);

const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || CORS_ORIGINS.includes(origin)) return true;

  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return CORS_ORIGINS.some((allowed) => {
      const allowedHost = new URL(allowed).hostname.toLowerCase().replace(/^www\./, '');
      return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
    });
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      logger.warn(`[CORS] blocked origin: ${origin}`);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.get('/health', (_req: Request, res: Response) => res.status(200).json({ status: 'ok' }));

// Unauthenticated by design: Meta's servers must be able to fetch these images directly to
// deliver them via the Send API, same reasoning as commerce-service's product-image uploads.
app.use('/api/v1/messaging/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));

// Webhook routes need the raw body for HMAC verification, so they're mounted before the global
// JSON body parser (which would otherwise consume the stream).
app.use('/api/v1/messaging', webhookRoutes);

app.use(express.json());
app.use(cookieParser());
app.use(morgan('combined', { stream: { write: (message: string) => logger.http(message.trim()) } }));

const isProd = process.env.NODE_ENV === 'production';
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX_API ?? 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === 'OPTIONS' || !isProd,
});

app.use('/api/v1/messaging', apiLimiter);
app.use('/api/v1/messaging', accountsRoutes);
app.use('/api/v1/messaging', conversationsRoutes);

if (!isProd) {
  app.use('/', (req: Request, res: Response) => {
    logger.warn(`[ROUTE 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found', path: req.originalUrl });
  });
}

// Must be registered before errorHandler below so Sentry captures the original error (message,
// stack, type) — errorHandler only logs a formatted string, which loses that detail.
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export default app;
