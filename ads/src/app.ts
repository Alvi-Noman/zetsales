import express, { type Application, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';

import installRoutes from './routes/installRoutes.js';
import adAccountsRoutes from './routes/adAccountsRoutes.js';
import embedRoutes from './routes/embedRoutes.js';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';

const app: Application = express();

app.set('trust proxy', 1);

// This service's pages render inside an iframe hosted by ZetSales's own frontend origin, and its
// OAuth callbacks are hit directly by the browser after redirects from Meta/TikTok/Google/
// ZetSales itself — CORS is permissive by necessity (no cookies are used for auth, only signed
// tokens carried in the URL, so this doesn't expose anything credential-bearing cross-origin).
app.use(cors({ origin: true, credentials: false }));

app.get('/health', (_req: Request, res: Response) => res.status(200).json({ status: 'ok' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
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

app.use('/api/v1/ads', apiLimiter);
app.use('/api/v1/ads', installRoutes);
app.use('/api/v1/ads', adAccountsRoutes);
app.use('/api/v1/ads', embedRoutes);

if (!isProd) {
  app.use('/', (req: Request, res: Response) => {
    logger.warn(`[ROUTE 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found', path: req.originalUrl });
  });
}

app.use(errorHandler);

export default app;
