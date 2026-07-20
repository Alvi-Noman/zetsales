// Must be imported before anything else in server.ts so Sentry's instrumentation wraps every
// subsequent import (express, mongodb, etc.). Leaving SENTRY_DSN unset is safe — the SDK just
// no-ops instead of sending anything.
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
  // server.ts already owns uncaughtException/unhandledRejection handling (logs via Winston, then
  // drives its own graceful shutdown) — Sentry's default handlers for those would double-report
  // the same error (once here, once via the Winston->Sentry transport) and race our shutdown
  // sequencing, so they're switched off in favor of the single Winston-driven path.
  integrations: (defaults) =>
    defaults.filter((i) => i.name !== 'OnUncaughtException' && i.name !== 'OnUnhandledRejection'),
});
