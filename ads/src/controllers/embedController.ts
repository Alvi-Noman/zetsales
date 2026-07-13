import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { listAdAccounts } from './adAccountsController.js';

// All internal links must carry the full /api/v1/ads prefix — the iframe's origin is this
// service's own external URL (see PUBLIC_ADS_URL), so a bare "/oauth/..." relative link would
// resolve against that origin's root, not this route's own path.
const BASE = '/api/v1/ads';

type AdPlatform = 'meta' | 'tiktok' | 'google';
const PLATFORM_LABEL: Record<AdPlatform, string> = { meta: 'Meta Ads', tiktok: 'TikTok Ads', google: 'Google Ads' };
const PLATFORM_COLOR: Record<AdPlatform, string> = { meta: '#0866FF', tiktok: '#010101', google: '#4285F4' };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function page(body: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ZetSales Ads</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1e293b; background: #fff; }
  .card { display: flex; align-items: center; justify-content: space-between; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px 20px; margin-bottom: 12px; }
  .badge { width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 13px; margin-right: 12px; }
  .row { display: flex; align-items: center; }
  .title { font-weight: 600; font-size: 14px; }
  .muted { color: #94a3b8; font-size: 12px; margin-top: 2px; }
  .btn { display: inline-block; background: #0f172a; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; }
  .btn-ghost { background: #f1f5f9; color: #94a3b8; }
  .btn-danger { background: #fff; color: #e11d48; border: 1px solid #fecdd3; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin: 24px 0 8px; }
  form { display: inline; }
</style>
</head>
<body>${body}</body>
</html>`;
}

// Mints the longer-lived (30m) token that every subsequent link/form on this page carries
// forward — a session_token from ZetSales's own createSessionToken only lives 60s, too short for
// a merchant to click through an external OAuth consent flow. This mirrors the "carry a token on
// every request" shape App Bridge uses via Authorization headers, adapted to plain links/forms
// since this is server-rendered HTML, not a JS SPA.
function mintAdsToken(tenantId: string): string {
  return jwt.sign({ tenantId }, env.JWT_SECRET, { expiresIn: '30m' });
}

export async function overview(req: Request, res: Response) {
  const sessionToken = req.query.session_token as string | undefined;
  const existingAdsToken = req.query.adsToken as string | undefined;

  let tenantId: string;
  try {
    if (existingAdsToken) {
      tenantId = (jwt.verify(existingAdsToken, env.JWT_SECRET) as { tenantId: string }).tenantId;
    } else if (sessionToken) {
      tenantId = (jwt.verify(sessionToken, env.JWT_SECRET) as { tenantId: string }).tenantId;
    } else {
      throw new Error('No token');
    }
  } catch {
    res.status(401).send(page('<p>Session expired. Please reopen ZetSales Ads from your ZetSales sidebar.</p>'));
    return;
  }

  const adsToken = mintAdsToken(tenantId);
  const accounts = await listAdAccounts(tenantId);
  const connected = req.query.connected as string | undefined;
  const error = req.query.error as string | undefined;

  const platforms: AdPlatform[] = ['meta', 'tiktok', 'google'];
  const configured: Record<AdPlatform, boolean> = {
    meta: !!process.env.META_APP_ID,
    tiktok: !!process.env.TIKTOK_APP_ID,
    google: !!process.env.GOOGLE_ADS_CLIENT_ID,
  };

  let body = '<h1>ZetSales Ads</h1><p class="muted">Connect your Facebook, TikTok, and Google Ads accounts to sync spend and campaigns automatically.</p>';
  if (connected) body += `<p style="color:#059669;font-size:13px;">Connected ${escapeHtml(connected)} successfully.</p>`;
  if (error) body += `<p style="color:#e11d48;font-size:13px;">Could not connect ${escapeHtml(error)}. Please try again.</p>`;

  body += '<h2>Platforms</h2>';
  for (const platform of platforms) {
    const count = accounts.filter((a) => a.platform === platform).length;
    body += `<div class="card"><div class="row"><span class="badge" style="background:${PLATFORM_COLOR[platform]}">${platform[0]!.toUpperCase()}</span><div><div class="title">${PLATFORM_LABEL[platform]}</div><div class="muted">${
      !configured[platform] ? 'Not configured on this server' : count > 0 ? `${count} account${count === 1 ? '' : 's'} connected` : 'Not connected'
    }</div></div></div>${
      configured[platform] ? `<a class="btn" href="${BASE}/oauth/${platform}/start?adsToken=${encodeURIComponent(adsToken)}">Connect</a>` : '<span class="btn btn-ghost">Not configured</span>'
    }</div>`;
  }

  if (accounts.length > 0) {
    body += '<h2>Connected accounts</h2>';
    for (const a of accounts) {
      body += `<div class="card"><div class="row"><span class="badge" style="background:${PLATFORM_COLOR[a.platform as AdPlatform]}">${(a.platform as string)[0]!.toUpperCase()}</span><div><div class="title">${escapeHtml(a.displayName)}</div><div class="muted">${PLATFORM_LABEL[a.platform as AdPlatform]} · ${escapeHtml(a.externalAccountId)}</div></div></div><form method="post" action="${BASE}/accounts/${a._id.toString()}/remove?adsToken=${encodeURIComponent(adsToken)}"><button class="btn btn-danger" type="submit">Disconnect</button></form></div>`;
    }
  }

  res.status(200).send(page(body));
}
