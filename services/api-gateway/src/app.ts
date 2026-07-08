import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { ClientRequest, IncomingMessage } from 'http';
import logger from './utils/logger.js';

type NodeErr = Error & { code?: string };

const app: Application = express();

app.set('trust proxy', 1);
app.set('etag', false);

// Health Endpoint
app.get('/health', (_req: Request, res: Response) =>
  res.status(200).json({ status: 'ok' }),
);

// Logging Middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  logger.http(`[API Gateway] ${req.method} ${req.originalUrl}`);
  next();
});

// CORS Config
const RAW_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    if (!origin || RAW_ORIGINS.includes(origin)) {
      return cb(null, true);
    }
    logger.warn(`[GATEWAY CORS] blocked origin: ${origin}`);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['ETag'],
  maxAge: 86400,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Proxy Targets
const AUTH_TARGET = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const COMMERCE_TARGET = process.env.COMMERCE_SERVICE_URL || 'http://localhost:3002';
const MESSAGING_TARGET = process.env.MESSAGING_SERVICE_URL || 'http://localhost:3003';
logger.info(`[GATEWAY] AUTH_SERVICE_URL=${AUTH_TARGET}`);
logger.info(`[GATEWAY] COMMERCE_SERVICE_URL=${COMMERCE_TARGET}`);
logger.info(`[GATEWAY] MESSAGING_SERVICE_URL=${MESSAGING_TARGET}`);

function makeProxy(target: string, label: string, reserializeJson: boolean) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    xfwd: true,
    ws: false,
    onProxyReq: reserializeJson
      ? (proxyReq: ClientRequest, req: Request & { body?: unknown }) => {
          const method = (req.method || 'GET').toUpperCase();
          if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;

          const hasBody = req.body && Object.keys(req.body as Record<string, unknown>).length > 0;
          if (!hasBody) return;

          const ct = (proxyReq.getHeader('content-type') as string | undefined) || '';
          if (!ct.includes('application/json')) return;

          const body = JSON.stringify(req.body);
          proxyReq.setHeader('content-length', Buffer.byteLength(body));
          proxyReq.write(body);
        }
      : undefined,
    onProxyRes(proxyRes: IncomingMessage, _req: Request, res: Response) {
      try {
        if (proxyRes.headers) {
          delete proxyRes.headers.etag;
          delete proxyRes.headers['last-modified'];
          proxyRes.headers['cache-control'] = 'no-store';
        }
        res.removeHeader('ETag');
        res.setHeader('Cache-Control', 'no-store');
      } catch {
        // noop
      }
    },
    onError(err: NodeErr, req: Request, res: Response) {
      const code = err.code ?? 'UNKNOWN';
      logger.error(`[PROXY][${label}] ${req.method} ${req.originalUrl} -> ${target} error: ${code} ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({ message: `Bad gateway (${label} unavailable)`, code });
      }
    },
  });
}

// Webhook routes are signed over the exact raw bytes the platform sent (Shopify/WooCommerce/Meta
// HMAC verification) — this must be registered *before* express.json() below so the request
// body streams straight through to the downstream service unparsed and unmodified.
app.use('/api/v1/commerce/webhooks', makeProxy(COMMERCE_TARGET, 'commerce-service-webhooks', false));
app.use('/api/v1/messaging/webhooks', makeProxy(MESSAGING_TARGET, 'messaging-service-webhooks', false));

app.use(express.json({ limit: '2mb' }));

app.use('/api/v1/auth', makeProxy(AUTH_TARGET, 'auth-service', true));
app.use('/api/v1/commerce', makeProxy(COMMERCE_TARGET, 'commerce-service', true));
app.use('/api/v1/messaging', makeProxy(MESSAGING_TARGET, 'messaging-service', true));

// 404 Tracer for unknown routes
if (process.env.NODE_ENV !== 'production') {
  app.use('/', (req: Request, res: Response) => {
    logger.warn(`[GATEWAY 404] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Route not found', path: req.originalUrl });
  });
}

export default app;
