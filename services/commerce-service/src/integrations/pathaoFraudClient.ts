import logger from '../utils/logger.js';
import { getDb } from '../utils/db.js';

// Logs into merchant.pathao.com (Pathao's merchant DASHBOARD — not the official Pathao Developer
// API, which uses OAuth2 client_id/client_secret against api-hermes.pathao.com and has no
// fraud-check feature at all, confirmed against their full published docs). Calls an undocumented
// per-phone customer-success endpoint. Confirmed by hand (2026-07-14): a plain JSON API behind a
// bearer token, not a scraped HTML form — same shape as the Steadfast integration, different
// login/token mechanism. This is unofficial, same accepted risk as steadfastFraudClient.ts.

const LOGIN_URL = 'https://merchant.pathao.com/api/v1/login';
const SUCCESS_URL = 'https://merchant.pathao.com/api/v1/user/success';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const COOLDOWN_MS = 30 * 60 * 1000;
// Pathao's own token carries a real expires_in (seen ~90 days in testing) — re-login once there's
// less than a day of validity left rather than hardcoding an assumed lifetime.
const REFRESH_BEFORE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const STATUS_DOC_ID = 'pathao';
const MAX_RECENT_EVENTS = 30;

export interface PathaoFraudCheckResult {
  totalDelivered: number;
  totalCancelled: number;
}

let accessToken: string | null = null;
let tokenExpiresAt: number | null = null;
let disabledUntil: number | null = null;

type EventType = 'login_success' | 'login_failure' | 'check_success' | 'check_failure';

async function recordEvent(type: EventType, detail: Record<string, unknown> = {}) {
  try {
    const now = new Date();
    const isFailure = type.endsWith('_failure');
    await getDb()
      .collection('pathaoFraudStatus')
      .updateOne(
        { _id: STATUS_DOC_ID as any },
        {
          $set: {
            lastEventAt: now,
            lastEventType: type,
            ...(isFailure ? { lastFailureAt: now, lastFailureDetail: detail } : { lastSuccessAt: now }),
            ...(type === 'check_success' ? { consecutiveFailures: 0 } : {}),
            disabledUntil: disabledUntil ? new Date(disabledUntil) : null,
          },
          $inc: {
            totalEvents: 1,
            ...(isFailure ? { totalFailures: 1, consecutiveFailures: 1 } : { totalSuccesses: 1 }),
            ...(type === 'check_success' ? { totalChecks: 1 } : {}),
          },
          $push: {
            recentEvents: { $each: [{ type, at: now, ...detail }], $slice: -MAX_RECENT_EVENTS },
          } as any,
        },
        { upsert: true }
      );
  } catch (err) {
    logger.error(`[pathaoFraud] failed to record status event: ${(err as Error).message}`);
  }
}

export async function getPathaoFraudStatus() {
  return getDb().collection('pathaoFraudStatus').findOne({ _id: STATUS_DOC_ID as any });
}

async function loginToPathaoPortal(): Promise<boolean> {
  const username = process.env.PATHAO_PORTAL_USERNAME;
  const password = process.env.PATHAO_PORTAL_PASSWORD;
  if (!username || !password) {
    logger.warn('[pathaoFraud] PATHAO_PORTAL_USERNAME/PASSWORD not set — skipping');
    void recordEvent('login_failure', { reason: 'credentials_not_configured' });
    return false;
  }

  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (res.status !== 200) {
      const bodySnippet = (await res.text().catch(() => '')).slice(0, 300);
      logger.error(`[pathaoFraud] login failed, unexpected status ${res.status}`);
      void recordEvent('login_failure', { reason: 'unexpected_login_status', httpStatus: res.status, bodySnippet });
      return false;
    }

    const data = (await res.json()) as { access_token?: unknown; expires_in?: unknown };
    if (typeof data.access_token !== 'string' || !data.access_token) {
      logger.error('[pathaoFraud] login succeeded but no access_token in response');
      void recordEvent('login_failure', { reason: 'no_access_token_in_response' });
      return false;
    }

    accessToken = data.access_token;
    const expiresInMs = (typeof data.expires_in === 'number' ? data.expires_in : 3600) * 1000;
    tokenExpiresAt = Date.now() + expiresInMs;
    void recordEvent('login_success');
    return true;
  } catch (err) {
    logger.error(`[pathaoFraud] login request failed: ${(err as Error).message}`);
    void recordEvent('login_failure', { reason: 'network_error', message: (err as Error).message });
    return false;
  }
}

interface FraudCheckAttempt {
  result: PathaoFraudCheckResult | null;
  failureReason?: string;
  httpStatus?: number;
  bodySnippet?: string;
}

async function fetchFraudCheck(phone: string): Promise<FraudCheckAttempt> {
  const res = await fetch(SUCCESS_URL, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ phone }),
  });

  if (res.status !== 200) {
    const bodySnippet = (await res.text().catch(() => '')).slice(0, 300);
    return {
      result: null,
      failureReason: res.status === 401 ? 'token_likely_expired' : 'unexpected_http_status',
      httpStatus: res.status,
      bodySnippet,
    };
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const bodySnippet = (await res.text().catch(() => '')).slice(0, 300);
    return { result: null, failureReason: 'non_json_response', httpStatus: res.status, bodySnippet };
  }

  const data = (await res.json()) as {
    data?: { customer?: { total_delivery?: unknown; successful_delivery?: unknown }; customer_rating?: unknown };
  };
  const customer = data.data?.customer;
  if (!customer) {
    // v2 omits the `customer` object entirely for phones Pathao has never seen before, returning
    // `customer_rating: "new_customer"` instead — that's a real "no history" result, not a failure.
    if (data.data?.customer_rating === 'new_customer') {
      return { result: { totalDelivered: 0, totalCancelled: 0 } };
    }
    return { result: null, failureReason: 'unexpected_json_shape', httpStatus: res.status, bodySnippet: JSON.stringify(data).slice(0, 300) };
  }
  if (typeof customer.total_delivery !== 'number' || typeof customer.successful_delivery !== 'number') {
    return { result: null, failureReason: 'unexpected_json_shape', httpStatus: res.status, bodySnippet: JSON.stringify(data).slice(0, 300) };
  }
  return {
    result: {
      totalDelivered: customer.successful_delivery,
      totalCancelled: customer.total_delivery - customer.successful_delivery,
    },
  };
}

// The one exported entry point. Returns null on anything unexpected — callers treat that as "no
// courier data available right now" rather than surfacing an error to the merchant.
export async function getPathaoFraudCheck(phone: string | null): Promise<PathaoFraudCheckResult | null> {
  if (!phone) return null;
  if (disabledUntil && Date.now() < disabledUntil) return null;

  try {
    if (!accessToken || !tokenExpiresAt || Date.now() > tokenExpiresAt - REFRESH_BEFORE_EXPIRY_MS) {
      const ok = await loginToPathaoPortal();
      if (!ok) {
        disabledUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
    }

    let attempt = await fetchFraudCheck(phone);
    if (attempt.result === null) {
      // Could just be a dead/expired token (expected, not a failure worth disabling over) — one
      // re-login and one retry before giving up for real.
      const ok = await loginToPathaoPortal();
      if (!ok) {
        disabledUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
      attempt = await fetchFraudCheck(phone);
      if (attempt.result === null) {
        logger.error(`[pathaoFraud] check endpoint returned an unexpected response after re-login (${attempt.failureReason}) — disabling for cooldown`);
        void recordEvent('check_failure', {
          reason: attempt.failureReason,
          httpStatus: attempt.httpStatus,
          bodySnippet: attempt.bodySnippet,
          afterReLogin: true,
        });
        disabledUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
    }
    void recordEvent('check_success');
    return attempt.result;
  } catch (err) {
    logger.error(`[pathaoFraud] request failed: ${(err as Error).message} — disabling for cooldown`);
    void recordEvent('check_failure', { reason: 'network_error', message: (err as Error).message });
    disabledUntil = Date.now() + COOLDOWN_MS;
    return null;
  }
}
