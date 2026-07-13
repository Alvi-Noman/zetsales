import type { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import { hashToken } from '../middleware/appAuthMiddleware.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// Standard OAuth 2.0 authorization-code grant — ZetSales is the authorization server (the
// Shopify role), an installed standalone service is the client. Session-authenticated: the
// merchant is already logged into ZetSales when they click "Install" on an oauth-type app.
export async function authorize(req: AuthenticatedRequest, res: Response) {
  const { client_id, redirect_uri, state, response_type } = req.query as Record<string, string | undefined>;
  if (response_type !== 'code' || !client_id || !redirect_uri) {
    res.status(400).json({ success: false, message: 'Invalid authorization request' });
    return;
  }

  const app = await getDb().collection('oauth_apps').findOne({ clientId: client_id });
  if (!app || !app.redirectUris.includes(redirect_uri)) {
    res.status(400).json({ success: false, message: 'Unknown client_id or redirect_uri' });
    return;
  }

  // Single-use authorization code: a random jti tracked server-side, plus a short-lived signed
  // JWT so the code itself is self-verifying (same state-as-JWT convention adAccountsController
  // already uses for OAuth `state`).
  const jti = crypto.randomBytes(16).toString('hex');
  await getDb().collection('oauth_codes').insertOne({
    jti,
    tenantId: req.user!.tenantId,
    appKey: app.appKey,
    redirectUri: redirect_uri,
    used: false,
    createdAt: new Date(),
  });
  const code = jwt.sign({ jti }, env.JWT_SECRET, { expiresIn: '60s' });

  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (state) redirectUrl.searchParams.set('state', state);
  res.redirect(redirectUrl.toString());
}

// Public — the standalone service calls this directly (server-to-server), not the merchant's
// browser. Standard OAuth2 token-request shape: grant_type, client_id, client_secret, code,
// redirect_uri.
export async function accessToken(req: Request, res: Response) {
  const { grant_type, client_id, client_secret, code, redirect_uri } = req.body ?? {};
  if (grant_type !== 'authorization_code' || !client_id || !client_secret || !code || !redirect_uri) {
    res.status(400).json({ error: 'invalid_request' });
    return;
  }

  const app = await getDb().collection('oauth_apps').findOne({ clientId: client_id });
  if (!app || app.clientSecretHash !== crypto.createHash('sha256').update(client_secret).digest('hex')) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  let jti: string;
  try {
    const payload = jwt.verify(code, env.JWT_SECRET) as { jti: string };
    jti = payload.jti;
  } catch {
    res.status(400).json({ error: 'invalid_grant' });
    return;
  }

  // Atomically claim the code — the findOneAndUpdate filter on used:false means a replayed code
  // can only ever win this race once.
  const claimed = await getDb()
    .collection('oauth_codes')
    .findOneAndUpdate({ jti, used: false }, { $set: { used: true, usedAt: new Date() } });
  if (!claimed || claimed.appKey !== app.appKey || claimed.redirectUri !== redirect_uri) {
    res.status(400).json({ error: 'invalid_grant' });
    return;
  }

  const accessTokenValue = crypto.randomBytes(32).toString('hex');
  await getDb().collection('installed_apps').updateOne(
    { tenantId: claimed.tenantId, appKey: app.appKey },
    {
      $set: { status: 'installed', accessTokenHash: hashToken(accessTokenValue), updatedAt: new Date() },
      $setOnInsert: { tenantId: claimed.tenantId, appKey: app.appKey, installedAt: new Date(), scopes: [], subscribedTopics: [] },
    },
    { upsert: true }
  );
  await getDb()
    .collection('businesses')
    .updateOne({ _id: new ObjectId(claimed.tenantId) }, { $addToSet: { installedPlugins: app.appKey } });

  // tenantId is required so the installing app knows which tenant it was installed for — without
  // it, an oauth-type app has no way to scope its own subsequent work (e.g. writing to a shared
  // collection, or associating its install record) to the right merchant.
  res.status(200).json({ access_token: accessTokenValue, token_type: 'bearer', scope: '', tenantId: claimed.tenantId });
}
