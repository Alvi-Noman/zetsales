import type { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import { encryptSecret } from '../utils/crypto.js';
import {
  buildMetaAdsOAuthUrl,
  exchangeMetaAdsCode,
  exchangeForLongLivedToken,
  fetchAdAccounts as fetchMetaAdAccounts,
} from '../integrations/metaAdsClient.js';
import { buildTikTokOAuthUrl, exchangeTikTokCode, fetchAdvertiserNames } from '../integrations/tiktokAdsClient.js';
import { buildGoogleAdsOAuthUrl, exchangeGoogleCode, refreshGoogleAccessToken, listAccessibleCustomers, fetchCustomerDescriptiveName } from '../integrations/googleAdsClient.js';

const APP_URL = () => process.env.PUBLIC_APP_URL || 'http://localhost:3000';
// Full externally-reachable path including the /api/v1/ads prefix — see installController.ts.
const SELF_URL = () => process.env.PUBLIC_ADS_URL || 'http://localhost:8081/api/v1/ads';

type AdPlatform = 'meta' | 'tiktok' | 'google';

// The short-lived token /embed/overview mints for a merchant's browser session inside this
// service (see embedController.ts) — carried forward on every link/form on the rendered page,
// the same "pass a token on every request" shape App Bridge uses via Authorization headers, just
// via query params here since this is plain server-rendered HTML, not a JS SPA.
function verifyAdsToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { tenantId: string };
    return payload.tenantId;
  } catch {
    return null;
  }
}

async function upsertAdAccount(tenantId: string, platform: AdPlatform, externalAccountId: string, displayName: string, credentials: Record<string, string>) {
  await getDb().collection('adAccounts').findOneAndUpdate(
    { tenantId, platform, externalAccountId },
    {
      $set: { displayName, status: 'connected', credentials, updatedAt: new Date() },
      $setOnInsert: { tenantId, platform, externalAccountId, lastSyncedAt: null, createdAt: new Date() },
    },
    { upsert: true }
  );
}

export async function listAdAccounts(tenantId: string) {
  return getDb().collection('adAccounts').find({ tenantId }).toArray();
}

export async function removeAdAccount(req: Request, res: Response) {
  const tenantId = verifyAdsToken(req.query.adsToken as string | undefined);
  if (!tenantId) {
    res.status(401).send('Session expired — reopen the ZetSales Ads app.');
    return;
  }
  await getDb().collection('adAccounts').deleteOne({ _id: new ObjectId(req.params.id), tenantId });
  res.redirect(`/api/v1/ads/embed/overview?adsToken=${encodeURIComponent(req.query.adsToken as string)}`);
}

// --- Meta ---

export function metaOAuthStart(req: Request, res: Response) {
  const tenantId = verifyAdsToken(req.query.adsToken as string | undefined);
  if (!tenantId) {
    res.status(401).send('Session expired — reopen the ZetSales Ads app.');
    return;
  }
  const appId = process.env.META_APP_ID;
  if (!appId) {
    res.status(501).send('Meta Ads is not configured on this server.');
    return;
  }
  const state = jwt.sign({ tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  const redirectUri = `${SELF_URL()}/oauth/meta/callback`;
  res.redirect(buildMetaAdsOAuthUrl(appId, redirectUri, state));
}

export async function metaOAuthCallback(req: Request, res: Response) {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    if (!code || !state || !appId || !appSecret) throw new Error('Missing OAuth params');
    const { tenantId } = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };

    const redirectUri = `${SELF_URL()}/oauth/meta/callback`;
    const shortLived = await exchangeMetaAdsCode(appId, appSecret, redirectUri, code);
    const { accessToken } = await exchangeForLongLivedToken(appId, appSecret, shortLived);
    const accounts = await fetchMetaAdAccounts(accessToken);
    for (const account of accounts) {
      await upsertAdAccount(tenantId, 'meta', account.id, account.name, { accessToken: encryptSecret(accessToken) });
    }
    res.redirect(`${APP_URL()}/apps/zetSalesAds?connected=meta`);
  } catch {
    res.redirect(`${APP_URL()}/apps/zetSalesAds?error=meta`);
  }
}

// --- TikTok ---

export function tiktokOAuthStart(req: Request, res: Response) {
  const tenantId = verifyAdsToken(req.query.adsToken as string | undefined);
  if (!tenantId) {
    res.status(401).send('Session expired — reopen the ZetSales Ads app.');
    return;
  }
  const appId = process.env.TIKTOK_APP_ID;
  if (!appId) {
    res.status(501).send('TikTok Ads is not configured on this server.');
    return;
  }
  const state = jwt.sign({ tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  const redirectUri = `${SELF_URL()}/oauth/tiktok/callback`;
  res.redirect(buildTikTokOAuthUrl(appId, redirectUri, state));
}

export async function tiktokOAuthCallback(req: Request, res: Response) {
  try {
    const { auth_code, state } = req.query as { auth_code?: string; state?: string };
    const appId = process.env.TIKTOK_APP_ID;
    const secret = process.env.TIKTOK_APP_SECRET;
    if (!auth_code || !state || !appId || !secret) throw new Error('Missing OAuth params');
    const { tenantId } = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };

    const { accessToken, advertiserIds } = await exchangeTikTokCode(appId, secret, auth_code);
    const names = await fetchAdvertiserNames(accessToken, advertiserIds);
    for (const advertiserId of advertiserIds) {
      await upsertAdAccount(tenantId, 'tiktok', advertiserId, names.get(advertiserId) ?? advertiserId, { accessToken: encryptSecret(accessToken) });
    }
    res.redirect(`${APP_URL()}/apps/zetSalesAds?connected=tiktok`);
  } catch {
    res.redirect(`${APP_URL()}/apps/zetSalesAds?error=tiktok`);
  }
}

// --- Google ---

export function googleOAuthStart(req: Request, res: Response) {
  const tenantId = verifyAdsToken(req.query.adsToken as string | undefined);
  if (!tenantId) {
    res.status(401).send('Session expired — reopen the ZetSales Ads app.');
    return;
  }
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    res.status(501).send('Google Ads is not configured on this server.');
    return;
  }
  const state = jwt.sign({ tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  const redirectUri = `${SELF_URL()}/oauth/google/callback`;
  res.redirect(buildGoogleAdsOAuthUrl(clientId, redirectUri, state));
}

export async function googleOAuthCallback(req: Request, res: Response) {
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
    const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    if (!code || !state || !clientId || !clientSecret || !developerToken) throw new Error('Missing OAuth params');
    const { tenantId } = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };

    const redirectUri = `${SELF_URL()}/oauth/google/callback`;
    const { refreshToken } = await exchangeGoogleCode(clientId, clientSecret, redirectUri, code);
    if (!refreshToken) throw new Error('No refresh token returned');

    // listAccessibleCustomers/fetchCustomerDescriptiveName need a short-lived access token, not
    // the refresh token itself — same two-step pattern adCampaignsController.ts uses at call time.
    const { accessToken } = await refreshGoogleAccessToken(clientId, clientSecret, refreshToken);
    const resourceNames = await listAccessibleCustomers(accessToken, developerToken);
    for (const resourceName of resourceNames) {
      const customerId = resourceName.replace('customers/', '');
      const name = await fetchCustomerDescriptiveName(accessToken, developerToken, customerId);
      await upsertAdAccount(tenantId, 'google', customerId, name ?? customerId, { refreshToken: encryptSecret(refreshToken) });
    }
    res.redirect(`${APP_URL()}/apps/zetSalesAds?connected=google`);
  } catch {
    res.redirect(`${APP_URL()}/apps/zetSalesAds?error=google`);
  }
}
