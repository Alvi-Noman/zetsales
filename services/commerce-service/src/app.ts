import express, { type Application, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';

import storesRoutes from './routes/storesRoutes.js';
import courierRoutes from './routes/courierRoutes.js';
import productsRoutes from './routes/productsRoutes.js';
import ordersRoutes from './routes/ordersRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import preOrdersRoutes from './routes/preOrdersRoutes.js';
import printTemplatesRoutes from './routes/printTemplatesRoutes.js';
import warehousesRoutes from './routes/warehousesRoutes.js';
import deliveryZonesRoutes from './routes/deliveryZonesRoutes.js';
import accountingRoutes from './routes/accountingRoutes.js';
import suppliersRoutes from './routes/suppliersRoutes.js';
import purchaseOrdersRoutes from './routes/purchaseOrdersRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import reportsRoutes from './routes/reportsRoutes.js';
import callCenterRoutes from './routes/callCenterRoutes.js';
import adPerformanceRoutes from './routes/adPerformanceRoutes.js';
import adAccountsRoutes from './routes/adAccountsRoutes.js';
import adCampaignsRoutes from './routes/adCampaignsRoutes.js';
import hrmRoutes from './routes/hrmRoutes.js';
import hrmPunchRoutes from './routes/hrmPunchRoutes.js';
import appsRoutes from './routes/appsRoutes.js';
import brandingRoutes from './routes/brandingRoutes.js';
import oauthRoutes from './routes/oauthRoutes.js';
import webhooksRoutes from './routes/webhooksRoutes.js';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { wrapAsyncRouter } from './middleware/asyncHandler.js';
import { UPLOAD_DIR } from './middleware/upload.js';

const app: Application = express();

app.set('trust proxy', 1);

const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000')
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
  })
);

app.get('/health', (_req: Request, res: Response) => res.status(200).json({ status: 'ok' }));

// Mounted at the full gateway-visible path (not bare /uploads) — the gateway's proxy preserves the
// full incoming path rather than stripping its mount prefix, same as every other route here.
// Unauthenticated by design: Shopify/WooCommerce must be able to fetch these images themselves.
app.use('/api/v1/commerce/uploads', express.static(UPLOAD_DIR, { maxAge: '30d' }));

// Webhook routes need the raw body for HMAC verification, so they're mounted before the global
// JSON body parser (which would otherwise consume the stream).
app.use('/api/v1/commerce', wrapAsyncRouter(webhooksRoutes));

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
const commerceRouters = [
  storesRoutes,
  courierRoutes,
  productsRoutes,
  inventoryRoutes,
  preOrdersRoutes,
  printTemplatesRoutes,
  warehousesRoutes,
  deliveryZonesRoutes,
  accountingRoutes,
  suppliersRoutes,
  purchaseOrdersRoutes,
  customerRoutes,
  ordersRoutes,
  analyticsRoutes,
  reportsRoutes,
  callCenterRoutes,
  adPerformanceRoutes,
  adAccountsRoutes,
  adCampaignsRoutes,
  hrmRoutes,
  hrmPunchRoutes,
  appsRoutes,
  brandingRoutes,
];
for (const router of commerceRouters) {
  app.use('/api/v1/commerce', wrapAsyncRouter(router));
}
app.use('/api/v1/oauth', wrapAsyncRouter(oauthRoutes));

if (!isProd) {
  app.use('/', (req: Request, res: Response) => {
    logger.warn(`[ROUTE 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found', path: req.originalUrl });
  });
}

app.use(errorHandler);

export default app;
