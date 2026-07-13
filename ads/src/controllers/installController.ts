import type { Request, Response } from 'express';
import axios from 'axios';
import { getDb } from '../utils/db.js';
import { encryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';

const APP_URL = () => process.env.PUBLIC_APP_URL || 'http://localhost:3000';
// Must be the full externally-reachable path INCLUDING the /api/v1/ads prefix — the gateway
// preserves the full incoming path when proxying rather than stripping its mount prefix, same
// convention every other service's PUBLIC_*_URL follows (see commerce-service's
// PUBLIC_COMMERCE_URL).
const SELF_URL = () => process.env.PUBLIC_ADS_URL || 'http://localhost:8081/api/v1/ads';
// Internal, service-to-service — not through the gateway, same convention every other backend
// service already uses for its own database access (direct, no proxy hop needed inside the
// compose network).
const COMMERCE_URL = () => process.env.COMMERCE_SERVICE_URL || 'http://commerce-service:3002';

// Completes this app's own installation into a ZetSales tenant — the ZetSales-platform OAuth
// (this service as the OAuth *client*, ZetSales as the *authorization server*), distinct from
// the ad-platform OAuth in adAccountsController.ts (this service as OAuth client to
// Meta/TikTok/Google). ZetSales's GET /oauth/authorize redirects the merchant's browser here
// with a `code` after they click Install in the App Store.
export async function oauthCallback(req: Request, res: Response) {
  try {
    const { code } = req.query as { code?: string };
    if (!code) throw new Error('Missing code');

    const clientId = process.env.ADS_APP_CLIENT_ID;
    const clientSecret = process.env.ADS_APP_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('This service is not configured with its own OAuth client credentials');

    const tokenRes = await axios.post(`${COMMERCE_URL()}/api/v1/oauth/access_token`, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${SELF_URL()}/oauth/callback`,
    });
    const { access_token, tenantId } = tokenRes.data as { access_token: string; tenantId: string };

    await getDb().collection('ads_installs').updateOne(
      { tenantId },
      { $set: { accessToken: encryptSecret(access_token), installedAt: new Date() } },
      { upsert: true }
    );

    res.redirect(`${APP_URL()}/apps/zetSalesAds`);
  } catch (err) {
    logger.error(`[install] OAuth callback failed: ${(err as Error).message}`);
    res.redirect(`${APP_URL()}/settings/apps?error=zetSalesAds`);
  }
}
