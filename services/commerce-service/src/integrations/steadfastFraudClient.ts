import logger from '../utils/logger.js';
import { getDb } from '../utils/db.js';

// Logs into steadfast.com.bd's merchant DASHBOARD (not the official Steadfast order API — that
// uses a separate Api-Key/Secret-Key pair, per tenant, in steadfastClient.ts) to call their
// undocumented per-phone-number fraud-check endpoint: GET /user/frauds/check/{phone}. Confirmed
// by hand (2026-07-14): it's a plain JSON endpoint behind a session cookie, not a scraped HTML
// form. The login endpoint itself is throttled (Laravel's default auth throttle, ~5/window); the
// fraud-check endpoint showed no rate-limit headers and survived a 10-request rapid burst in
// testing, but that's not proof there's truly no limit at higher volume — Cloudflare can apply
// invisible thresholds. This is an unofficial integration against a real merchant login, not a
// documented API — accepted risk, per explicit instruction.
//
// Every attempt (success or failure) is recorded to the `steadfastFraudStatus` collection (one
// singleton doc, see recordEvent below) specifically so a real diagnosis is possible after the
// fact — "why did it stop working" shouldn't require guessing or re-triggering a live check.

const LOGIN_URL = 'https://steadfast.com.bd/login';
const FRAUD_CHECK_BASE = 'https://steadfast.com.bd/user/frauds/check/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// Once a login or a fraud-check request comes back with something other than the expected shape
// (unexpected status, redirect, non-JSON body, CAPTCHA-looking content, or a network error), stop
// entirely for this long instead of retrying — better to show nothing for a while than hammer a
// broken/blocked login and make things worse.
const COOLDOWN_MS = 30 * 60 * 1000;
// Re-login proactively before the ~2h session cookie actually expires, so a real request never
// has to discover it's stale.
const SESSION_MAX_AGE_MS = 90 * 60 * 1000;
const STATUS_DOC_ID = 'steadfast';
const MAX_RECENT_EVENTS = 30;

export interface SteadfastFraudCheckResult {
  totalDelivered: number;
  totalCancelled: number;
}

let sessionCookie: string | null = null;
let loggedInAt: number | null = null;
let disabledUntil: number | null = null;

type EventType = 'login_success' | 'login_failure' | 'check_success' | 'check_failure';

// Best-effort — a failure to write the status log must never break the actual check it's
// describing. Keeps a capped rolling window of recent events plus running counters, so "what's
// wrong" can be answered by reading one document instead of grepping container logs (which don't
// survive a restart anyway).
async function recordEvent(type: EventType, detail: Record<string, unknown> = {}) {
  try {
    const now = new Date();
    const isFailure = type.endsWith('_failure');
    await getDb()
      .collection('steadfastFraudStatus')
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
    logger.error(`[steadfastFraud] failed to record status event: ${(err as Error).message}`);
  }
}

// Read-only lookup for diagnosing "why did it stop working" — reports the same data recordEvent
// writes, in one place.
export async function getSteadfastFraudStatus() {
  return getDb().collection('steadfastFraudStatus').findOne({ _id: STATUS_DOC_ID as any });
}

function extractCookiePairs(setCookieHeaders: string[]): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const header of setCookieHeaders) {
    const [pair] = header.split(';');
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    pairs[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return pairs;
}

function cookieHeader(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function loginToSteadfastPortal(): Promise<boolean> {
  const email = process.env.STEADFAST_PORTAL_EMAIL;
  const password = process.env.STEADFAST_PORTAL_PASSWORD;
  if (!email || !password) {
    logger.warn('[steadfastFraud] STEADFAST_PORTAL_EMAIL/PASSWORD not set — skipping');
    void recordEvent('login_failure', { reason: 'credentials_not_configured' });
    return false;
  }

  try {
    const loginPageRes = await fetch(LOGIN_URL, { headers: { 'User-Agent': UA } });
    const html = await loginPageRes.text();
    const tokenMatch = html.match(/name="_token" value="([^"]+)"/);
    if (!tokenMatch) {
      logger.error('[steadfastFraud] login page did not contain a CSRF token — page layout may have changed');
      void recordEvent('login_failure', {
        reason: 'no_csrf_token_on_login_page',
        httpStatus: loginPageRes.status,
        bodySnippet: html.slice(0, 300),
      });
      return false;
    }
    const initialCookies = extractCookiePairs(loginPageRes.headers.getSetCookie?.() ?? []);

    const body = new URLSearchParams({ _token: tokenMatch[1], email, password });
    const loginRes = await fetch(LOGIN_URL, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookieHeader(initialCookies),
        Referer: LOGIN_URL,
      },
      body,
    });

    // A successful login redirects (302) to /home; anything else (200 back on the login page with
    // validation errors, a 419 CSRF mismatch, etc.) means the credentials or the token didn't work.
    if (loginRes.status !== 302) {
      const bodySnippet = (await loginRes.text().catch(() => '')).slice(0, 300);
      logger.error(`[steadfastFraud] login failed, unexpected status ${loginRes.status}`);
      void recordEvent('login_failure', { reason: 'unexpected_login_status', httpStatus: loginRes.status, bodySnippet });
      return false;
    }
    const sessionCookies = extractCookiePairs(loginRes.headers.getSetCookie?.() ?? []);
    if (!sessionCookies.steadfast_courier_session) {
      logger.error('[steadfastFraud] login redirected but no session cookie was set');
      void recordEvent('login_failure', { reason: 'no_session_cookie_after_redirect' });
      return false;
    }

    sessionCookie = cookieHeader({ ...initialCookies, ...sessionCookies });
    loggedInAt = Date.now();
    void recordEvent('login_success');
    return true;
  } catch (err) {
    logger.error(`[steadfastFraud] login request failed: ${(err as Error).message}`);
    void recordEvent('login_failure', { reason: 'network_error', message: (err as Error).message });
    return false;
  }
}

interface FraudCheckAttempt {
  result: SteadfastFraudCheckResult | null;
  failureReason?: string;
  httpStatus?: number;
  bodySnippet?: string;
}

async function fetchFraudCheck(phone: string): Promise<FraudCheckAttempt> {
  const res = await fetch(`${FRAUD_CHECK_BASE}${encodeURIComponent(phone)}`, {
    redirect: 'manual',
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      Cookie: sessionCookie ?? '',
    },
  });
  // A 3xx here almost always means the session died and we got redirected back to /login.
  if (res.status !== 200) {
    const bodySnippet = (await res.text().catch(() => '')).slice(0, 300);
    return { result: null, failureReason: res.status >= 300 && res.status < 400 ? 'redirected_session_likely_dead' : 'unexpected_http_status', httpStatus: res.status, bodySnippet };
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const bodySnippet = (await res.text().catch(() => '')).slice(0, 300);
    return { result: null, failureReason: 'non_json_response', httpStatus: res.status, bodySnippet };
  }

  const data = (await res.json()) as { total_delivered?: unknown; total_cancelled?: unknown };
  if (typeof data.total_delivered !== 'number' || typeof data.total_cancelled !== 'number') {
    return { result: null, failureReason: 'unexpected_json_shape', httpStatus: res.status, bodySnippet: JSON.stringify(data).slice(0, 300) };
  }
  return { result: { totalDelivered: data.total_delivered, totalCancelled: data.total_cancelled } };
}

// The one exported entry point. Returns null on anything unexpected — callers treat that as "no
// courier data available right now" rather than surfacing an error to the merchant.
export async function getSteadfastFraudCheck(phone: string | null): Promise<SteadfastFraudCheckResult | null> {
  if (!phone) return null;
  if (disabledUntil && Date.now() < disabledUntil) return null;

  try {
    if (!sessionCookie || !loggedInAt || Date.now() - loggedInAt > SESSION_MAX_AGE_MS) {
      const ok = await loginToSteadfastPortal();
      if (!ok) {
        disabledUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
    }

    let attempt = await fetchFraudCheck(phone);
    if (attempt.result === null) {
      // Could just be a dead session (expected, not a failure worth disabling over) — one re-login
      // and one retry before giving up for real.
      const ok = await loginToSteadfastPortal();
      if (!ok) {
        disabledUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
      attempt = await fetchFraudCheck(phone);
      if (attempt.result === null) {
        logger.error(`[steadfastFraud] fraud-check endpoint returned an unexpected response after re-login (${attempt.failureReason}) — disabling for cooldown`);
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
    logger.error(`[steadfastFraud] request failed: ${(err as Error).message} — disabling for cooldown`);
    void recordEvent('check_failure', { reason: 'network_error', message: (err as Error).message });
    disabledUntil = Date.now() + COOLDOWN_MS;
    return null;
  }
}
