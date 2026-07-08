import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import type { AdAccountDTO, AdAccountPlatform } from '@zetsales/shared';
import { getDb } from '../utils/db.js';
import { encryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { buildMetaAdsOAuthUrl, exchangeMetaAdsCode, exchangeForLongLivedToken, fetchAdAccounts } from '../integrations/metaAdsClient.js';
import { buildTikTokOAuthUrl, exchangeTikTokCode, fetchAdvertiserNames } from '../integrations/tiktokAdsClient.js';
import { buildGoogleAdsOAuthUrl, exchangeGoogleCode, listAccessibleCustomers, fetchCustomerDescriptiveName } from '../integrations/googleAdsClient.js';

const APP_URL = () => process.env.PUBLIC_APP_URL || 'http://localhost:3000';
const COMMERCE_URL = () => process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';

function adAccountDto(doc: any): AdAccountDTO {
  return {
    id: doc._id.toString(),
    platform: doc.platform,
    externalAccountId: doc.externalAccountId,
    displayName: doc.displayName,
    status: doc.status,
    lastSyncedAt: doc.lastSyncedAt ? new Date(doc.lastSyncedAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export async function listAdAccounts(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const accounts = await db.collection('adAccounts').find({ tenantId: req.user!.tenantId }).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, accounts: accounts.map(adAccountDto) });
}

export async function removeAdAccount(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const result = await db.collection('adAccounts').deleteOne({ _id: new ObjectId(req.params.id), tenantId: req.user!.tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Ad account not found.' });
    return;
  }
  res.json({ success: true });
}

async function upsertAdAccount(tenantId: string, platform: AdAccountPlatform, externalAccountId: string, displayName: string, credentials: Record<string, unknown>) {
  const db = getDb();
  const now = new Date();
  await db.collection('adAccounts').findOneAndUpdate(
    { tenantId, platform, externalAccountId },
    { $set: { displayName, status: 'connected', credentials, updatedAt: now }, $setOnInsert: { tenantId, platform, externalAccountId, lastSyncedAt: null, createdAt: now } },
    { upsert: true }
  );
}

// --- Meta ---

export async function metaOAuthStart(req: AuthenticatedRequest, res: Response) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    res.status(501).json({ success: false, message: 'Meta Ads is not configured on this server yet. Set META_APP_ID/META_APP_SECRET and add the Marketing API product to the Meta App.' });
    return;
  }
  const redirectUri = `${COMMERCE_URL()}/marketing/ad-accounts/meta/oauth/callback`;
  const state = jwt.sign({ tenantId: req.user!.tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  res.redirect(buildMetaAdsOAuthUrl(appId, redirectUri, state));
}

export async function metaOAuthCallback(req: AuthenticatedRequest, res: Response) {
  const { code, state } = req.query as { code?: string; state?: string };
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!code || !state || !appId || !appSecret) {
    res.redirect(`${APP_URL()}/integrations?error=meta`);
    return;
  }
  try {
    const decoded = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };
    const redirectUri = `${COMMERCE_URL()}/marketing/ad-accounts/meta/oauth/callback`;
    const shortLivedToken = await exchangeMetaAdsCode(appId, appSecret, redirectUri, code);
    const { accessToken } = await exchangeForLongLivedToken(appId, appSecret, shortLivedToken);
    const adAccounts = await fetchAdAccounts(accessToken);

    if (adAccounts.length === 0) {
      res.redirect(`${APP_URL()}/integrations?error=meta`);
      return;
    }
    // One connection per ad account the user grants access to — a Business Manager often manages
    // several, and collapsing them into one row would hide spend for all but one.
    await Promise.all(adAccounts.map((a) => upsertAdAccount(decoded.tenantId, 'meta', a.id, a.name, { accessToken: encryptSecret(accessToken) })));

    res.redirect(`${APP_URL()}/integrations?connected=meta`);
  } catch (err) {
    logger.warn(`[meta ads oauth] callback failed: ${(err as Error).message}`);
    res.redirect(`${APP_URL()}/integrations?error=meta`);
  }
}

// --- TikTok ---

export async function tiktokOAuthStart(req: AuthenticatedRequest, res: Response) {
  const appId = process.env.TIKTOK_APP_ID;
  if (!appId) {
    res.status(501).json({ success: false, message: 'TikTok Ads is not configured on this server yet. Set TIKTOK_APP_ID/TIKTOK_APP_SECRET.' });
    return;
  }
  const redirectUri = `${COMMERCE_URL()}/marketing/ad-accounts/tiktok/oauth/callback`;
  const state = jwt.sign({ tenantId: req.user!.tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  res.redirect(buildTikTokOAuthUrl(appId, redirectUri, state));
}

export async function tiktokOAuthCallback(req: AuthenticatedRequest, res: Response) {
  const { auth_code: authCode, state } = req.query as { auth_code?: string; state?: string };
  const appId = process.env.TIKTOK_APP_ID;
  const secret = process.env.TIKTOK_APP_SECRET;
  if (!authCode || !state || !appId || !secret) {
    res.redirect(`${APP_URL()}/integrations?error=tiktok`);
    return;
  }
  try {
    const decoded = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };
    const { accessToken, advertiserIds } = await exchangeTikTokCode(appId, secret, authCode);

    if (advertiserIds.length === 0) {
      res.redirect(`${APP_URL()}/integrations?error=tiktok`);
      return;
    }
    const names = await fetchAdvertiserNames(accessToken, advertiserIds);
    await Promise.all(
      advertiserIds.map((id) => upsertAdAccount(decoded.tenantId, 'tiktok', id, names.get(id) ?? `TikTok Advertiser ${id}`, { accessToken: encryptSecret(accessToken) }))
    );

    res.redirect(`${APP_URL()}/integrations?connected=tiktok`);
  } catch (err) {
    logger.warn(`[tiktok ads oauth] callback failed: ${(err as Error).message}`);
    res.redirect(`${APP_URL()}/integrations?error=tiktok`);
  }
}

// --- Google Ads ---

export async function googleOAuthStart(req: AuthenticatedRequest, res: Response) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  if (!clientId) {
    res.status(501).json({ success: false, message: 'Google Ads is not configured on this server yet. Set GOOGLE_ADS_CLIENT_ID/GOOGLE_ADS_CLIENT_SECRET/GOOGLE_ADS_DEVELOPER_TOKEN.' });
    return;
  }
  const redirectUri = `${COMMERCE_URL()}/marketing/ad-accounts/google/oauth/callback`;
  const state = jwt.sign({ tenantId: req.user!.tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  res.redirect(buildGoogleAdsOAuthUrl(clientId, redirectUri, state));
}

export async function googleOAuthCallback(req: AuthenticatedRequest, res: Response) {
  const { code, state } = req.query as { code?: string; state?: string };
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!code || !state || !clientId || !clientSecret || !developerToken) {
    res.redirect(`${APP_URL()}/integrations?error=google`);
    return;
  }
  try {
    const decoded = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };
    const redirectUri = `${COMMERCE_URL()}/marketing/ad-accounts/google/oauth/callback`;
    const { accessToken, refreshToken } = await exchangeGoogleCode(clientId, clientSecret, redirectUri, code);

    if (!refreshToken) {
      // Happens if the user previously granted consent and Google skipped re-issuing one —
      // buildGoogleAdsOAuthUrl already sends prompt=consent to avoid this, but if it still occurs
      // there's no way to keep this connection working unattended, so surface it as an error
      // rather than silently storing a connection that will stop working within the hour.
      res.redirect(`${APP_URL()}/integrations?error=google`);
      return;
    }

    const customerResourceNames = await listAccessibleCustomers(accessToken, developerToken);
    if (customerResourceNames.length === 0) {
      res.redirect(`${APP_URL()}/integrations?error=google`);
      return;
    }

    await Promise.all(
      customerResourceNames.map(async (resourceName) => {
        const customerId = resourceName.replace('customers/', '');
        const descriptiveName = await fetchCustomerDescriptiveName(accessToken, developerToken, customerId);
        await upsertAdAccount(decoded.tenantId, 'google', customerId, descriptiveName ?? `Google Ads ${customerId}`, { refreshToken: encryptSecret(refreshToken) });
      })
    );

    res.redirect(`${APP_URL()}/integrations?connected=google`);
  } catch (err) {
    logger.warn(`[google ads oauth] callback failed: ${(err as Error).message}`);
    res.redirect(`${APP_URL()}/integrations?error=google`);
  }
}
