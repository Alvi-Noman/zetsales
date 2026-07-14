import logger from '../utils/logger.js';

// Logs into steadfast.com.bd's merchant DASHBOARD (not the official Steadfast order API — that
// uses a separate Api-Key/Secret-Key pair, per tenant, in steadfastClient.ts) to call their
// undocumented per-phone-number fraud-check endpoint: GET /user/frauds/check/{phone}. Confirmed
// by hand (2026-07-14): it's a plain JSON endpoint behind a session cookie, not a scraped HTML
// form. The login endpoint itself is throttled (Laravel's default auth throttle, ~5/window); the
// fraud-check endpoint showed no rate-limit headers and survived a 10-request rapid burst in
// testing, but that's not proof there's truly no limit at higher volume — Cloudflare can apply
// invisible thresholds. This is an unofficial integration against a real merchant login, not a
// documented API — accepted risk, per explicit instruction.

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

export interface SteadfastFraudCheckResult {
  totalDelivered: number;
  totalCancelled: number;
}

let sessionCookie: string | null = null;
let loggedInAt: number | null = null;
let disabledUntil: number | null = null;

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
    return false;
  }

  try {
    const loginPageRes = await fetch(LOGIN_URL, { headers: { 'User-Agent': UA } });
    const html = await loginPageRes.text();
    const tokenMatch = html.match(/name="_token" value="([^"]+)"/);
    if (!tokenMatch) {
      logger.error('[steadfastFraud] login page did not contain a CSRF token — page layout may have changed');
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
      logger.error(`[steadfastFraud] login failed, unexpected status ${loginRes.status}`);
      return false;
    }
    const sessionCookies = extractCookiePairs(loginRes.headers.getSetCookie?.() ?? []);
    if (!sessionCookies.steadfast_courier_session) {
      logger.error('[steadfastFraud] login redirected but no session cookie was set');
      return false;
    }

    sessionCookie = cookieHeader({ ...initialCookies, ...sessionCookies });
    loggedInAt = Date.now();
    return true;
  } catch (err) {
    logger.error(`[steadfastFraud] login request failed: ${(err as Error).message}`);
    return false;
  }
}

async function fetchFraudCheck(phone: string): Promise<SteadfastFraudCheckResult | null> {
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
  if (res.status !== 200) return null;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return null;

  const data = (await res.json()) as { total_delivered?: unknown; total_cancelled?: unknown };
  if (typeof data.total_delivered !== 'number' || typeof data.total_cancelled !== 'number') return null;
  return { totalDelivered: data.total_delivered, totalCancelled: data.total_cancelled };
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

    let result = await fetchFraudCheck(phone);
    if (result === null) {
      // Could just be a dead session (expected, not a failure worth disabling over) — one re-login
      // and one retry before giving up for real.
      const ok = await loginToSteadfastPortal();
      if (!ok) {
        disabledUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
      result = await fetchFraudCheck(phone);
      if (result === null) {
        logger.error('[steadfastFraud] fraud-check endpoint returned an unexpected response after re-login — disabling for cooldown');
        disabledUntil = Date.now() + COOLDOWN_MS;
        return null;
      }
    }
    return result;
  } catch (err) {
    logger.error(`[steadfastFraud] request failed: ${(err as Error).message} — disabling for cooldown`);
    disabledUntil = Date.now() + COOLDOWN_MS;
    return null;
  }
}
