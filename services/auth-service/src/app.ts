import express, { type Application, type Request, type Response } from 'express';
import rateLimit, { ValueDeterminingMiddleware } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';

import authRoutes from './routes/authRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Application = express();

app.set('trust proxy', 1);

const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://localhost:8080')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin || CORS_ORIGINS.includes(origin) || origin.startsWith('chrome-extension://')) return true;

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
      // chrome-extension:// origins can only be sent by an actual installed extension (a webpage
      // can't spoof one), so the ZetSales Product Importer extension is allowed unconditionally
      // rather than requiring its per-install extension id to be added to CORS_ORIGIN.
      if (isAllowedOrigin(origin)) return cb(null, true);
      logger.warn(`[CORS] blocked origin: ${origin}`);
      return cb(null, false);
    },
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

app.use(express.json());
app.use(cookieParser());
app.use(
  morgan('combined', {
    stream: { write: (message: string) => logger.http(message.trim()) },
  })
);

const isProd = process.env.NODE_ENV === 'production';
const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const MAX_API = Number(process.env.RATE_LIMIT_MAX_API ?? 300);
const MAX_AUTH = Number(process.env.RATE_LIMIT_MAX_AUTH ?? 20);

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

const skipCommon: ValueDeterminingMiddleware<boolean> = (req: Request) =>
  req.method === 'OPTIONS' || !isProd;

const apiLimiter = rateLimit({
  windowMs,
  max: MAX_API,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipCommon,
  keyGenerator: (req: Request) => getClientIp(req),
});

const authLimiter = rateLimit({
  windowMs,
  max: MAX_AUTH,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipCommon,
  message: { message: 'Too many requests, please try again later.' },
  keyGenerator: (req: Request) => getClientIp(req),
});

// Apply rate limiters
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/signup', authLimiter);
app.use('/api/v1', apiLimiter);

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/auth/team', teamRoutes);

if (!isProd) {
  app.use('/api/v1', (req: Request, res: Response) => {
    logger.warn(`[ROUTE 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found', path: req.originalUrl });
  });
}

app.use(errorHandler);

export default app;
