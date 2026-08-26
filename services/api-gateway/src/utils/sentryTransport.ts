import * as Sentry from '@sentry/node';
import TransportStream from 'winston-transport';

interface LogInfo {
  level: string;
  message: string;
  stack?: string;
  reason?: unknown;
  [key: string]: unknown;
}

// Bridges Winston into Sentry so every logger.error(...) call in the codebase — not just ones
// that pass through Express's error-handling middleware — also shows up in Sentry with grouping,
// alerting, and stack traces, instead of only ever living in the local log files.
export class SentryTransport extends TransportStream {
  log(info: LogInfo, callback: () => void) {
    setImmediate(() => this.emit('logged', info));

    const error = new Error(info.message);
    if (typeof info.stack === 'string') error.stack = info.stack;
    Sentry.captureException(error, { extra: { reason: info.reason } });

    callback();
  }
}
