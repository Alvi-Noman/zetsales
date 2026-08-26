// Must be imported before anything else in server.ts so Sentry's instrumentation wraps every
// subsequent import (express, http-proxy-middleware, etc.). Leaving SENTRY_DSN unset is safe —
// the SDK just no-ops instead of sending anything.
import { config } from 'dotenv';
import * as Sentry from '@sentry/node';

// api-gateway has no @zetsales/config/validateEnv (unlike auth/commerce/messaging) to load .env
// as an earlier import, so this module loads it directly — it must run before Sentry.init reads
// process.env.SENTRY_DSN below.
config();

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
  // server.ts already owns its own shutdown handling on SIGINT/SIGTERM/server error — Sentry's
  // default uncaught-exception/unhandled-rejection handlers aren't needed on top of that and
  // would just add a second reporting path for the same failure.
  integrations: (defaults) =>
    defaults.filter((i) => i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection'),
});
