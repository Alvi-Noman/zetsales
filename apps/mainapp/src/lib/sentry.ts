import * as Sentry from '@sentry/react';

// Leaving VITE_SENTRY_DSN unset (local dev, PR previews) is intentional — init() is simply
// skipped rather than sending events nowhere or throwing.
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Fraction of page loads/navigations to capture a full performance trace for. Kept low by
    // default — this only affects trace volume, error capture always happens regardless.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.2),
  });
}

export { Sentry };
