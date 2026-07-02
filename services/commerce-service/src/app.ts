import express, { type Application, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';

import storesRoutes from './routes/storesRoutes.js';
import productsRoutes from './routes/productsRoutes.js';
import ordersRoutes from './routes/ordersRoutes.js';
import webhooksRoutes from './routes/webhooksRoutes.js';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Application = express();

app.set('trust proxy', 1);

const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || CORS_ORIGINS.includes(origin)) return cb(null, true);
      logger.warn(`[CORS] blocked origin: ${origin}`);
      return cb(null, false);
    },
    credentials: true,
  })
);

app.get('/health', (_req: Request, res: Response) => res.status(200).json({ status: 'ok' }));

// Webhook routes need the raw body for HMAC verification, so they're mounted before the global
// JSON body parser (which would otherwise consume the stream).
app.use('/api/v1/commerce', webhooksRoutes);

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

app.use('/api/v1/commerce', apiLimiter);
app.use('/api/v1/commerce', storesRoutes);
app.use('/api/v1/commerce', productsRoutes);
app.use('/api/v1/commerce', ordersRoutes);

if (!isProd) {
  app.use('/', (req: Request, res: Response) => {
    logger.warn(`[ROUTE 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found', path: req.originalUrl });
  });
}

app.use(errorHandler);

export default app;
