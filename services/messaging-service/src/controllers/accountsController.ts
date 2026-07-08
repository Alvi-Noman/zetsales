import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { SocialAccountDTO } from '@zetsales/shared';
import {
  buildFacebookOAuthUrl,
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  fetchManagedPages,
  fetchLinkedInstagramAccount,
  subscribePageWebhook,
  unsubscribePageWebhook,
} from '../integrations/metaClient.js';

function toAccountDto(doc: any): SocialAccountDTO {
  return {
    id: doc._id.toString(),
    provider: doc.provider,
    externalId: doc.externalId,
    name: doc.name,
    avatarUrl: doc.avatarUrl,
    status: doc.status,
    connectedAt: new Date(doc.connectedAt).toISOString(),
  };
}

export async function capabilities(_req: AuthenticatedRequest, res: Response) {
  res.json({ success: true, metaAppConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET) });
}

// Meta's Send API needs a URL it can fetch directly, not a raw file upload — same reason
// commerce-service serves uploaded product photos over a public /uploads path.
export function uploadMessagingImage(req: AuthenticatedRequest, res: Response) {
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: 'An image file is required' });
    return;
  }
  const base = process.env.PUBLIC_MESSAGING_URL || 'http://localhost:8081/api/v1/messaging';
  res.json({ success: true, url: `${base}/uploads/${file.filename}` });
}

export async function listAccounts(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const accounts = await db.collection('social_accounts').find({ tenantId: req.user!.tenantId }).sort({ connectedAt: -1 }).toArray();
  res.json({ success: true, accounts: accounts.map(toAccountDto) });
}

function redirectUri() {
  return `${process.env.PUBLIC_MESSAGING_URL || 'http://localhost:8081/api/v1/messaging'}/accounts/facebook/oauth/callback`;
}

export async function facebookOAuthStart(req: AuthenticatedRequest, res: Response) {
  const appId = process.env.META_APP_ID;
  if (!appId) {
    res.status(501).json({ success: false, message: 'Facebook messaging is not configured on this server yet. Set META_APP_ID/META_APP_SECRET.' });
    return;
  }

  const state = jwt.sign({ tenantId: req.user!.tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  res.redirect(buildFacebookOAuthUrl(appId, redirectUri(), state));
}

export async function facebookOAuthCallback(req: AuthenticatedRequest, res: Response) {
  const { code, state } = req.query as { code?: string; state?: string };
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  const appUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

  if (!code || !state || !appId || !appSecret) {
    res.redirect(`${appUrl}/integrations?error=facebook`);
    return;
  }

  try {
    const decoded = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };
    const shortLivedToken = await exchangeCodeForUserToken(appId, appSecret, redirectUri(), code);
    const { accessToken: userAccessToken } = await exchangeForLongLivedUserToken(appId, appSecret, shortLivedToken);
    const pages = await fetchManagedPages(userAccessToken);

    const db = getDb();
    const now = new Date();

    for (const page of pages) {
      await subscribePageWebhook(page.id, page.accessToken).catch((err) =>
        logger.warn(`[meta] Could not subscribe webhook for page ${page.id}: ${(err as Error).message}`)
      );

      await db.collection('social_accounts').findOneAndUpdate(
        { provider: 'facebook', externalId: page.id },
        {
          $set: {
            tenantId: decoded.tenantId,
            name: page.name,
            avatarUrl: page.picture,
            status: 'connected',
            accessToken: encryptSecret(page.accessToken),
            updatedAt: now,
          },
          $setOnInsert: { provider: 'facebook', externalId: page.id, connectedAt: now },
        },
        { upsert: true }
      );

      const ig = await fetchLinkedInstagramAccount(page.id, page.accessToken).catch((err) => {
        logger.warn(`[meta] Could not check linked Instagram account for page ${page.id}: ${(err as Error).message}`);
        return null;
      });

      if (ig) {
        await db.collection('social_accounts').findOneAndUpdate(
          { provider: 'instagram', externalId: ig.id },
          {
            $set: {
              tenantId: decoded.tenantId,
              name: ig.username,
              avatarUrl: ig.profilePicture,
              status: 'connected',
              // Instagram DMs are sent/received through the linked Page's access token, not a
              // separate IG-specific one.
              accessToken: encryptSecret(page.accessToken),
              pageId: page.id,
              updatedAt: now,
            },
            $setOnInsert: { provider: 'instagram', externalId: ig.id, connectedAt: now },
          },
          { upsert: true }
        );
      }
    }

    res.redirect(`${appUrl}/integrations?connected=facebook`);
  } catch (err) {
    logger.error(`[meta] OAuth callback failed: ${(err as Error).message}`);
    res.redirect(`${appUrl}/integrations?error=facebook`);
  }
}

export async function removeAccount(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const { accountId } = req.params;
  const account = await db.collection('social_accounts').findOne({ _id: new ObjectId(accountId), tenantId: req.user!.tenantId });
  if (!account) {
    res.status(404).json({ success: false, message: 'Account not found' });
    return;
  }

  // Only a Facebook Page owns the webhook subscription — its linked Instagram account rides on
  // the same subscription, so removing the IG entry alone must not tear that down.
  if (account.provider === 'facebook') {
    await unsubscribePageWebhook(account.externalId, decryptSecret(account.accessToken)).catch((err) =>
      logger.warn(`[meta] Could not unsubscribe webhook for page ${account.externalId}: ${(err as Error).message}`)
    );
    await db.collection('social_accounts').deleteOne({ provider: 'instagram', pageId: account.externalId, tenantId: req.user!.tenantId });
  }

  await db.collection('social_accounts').deleteOne({ _id: account._id });
  res.json({ success: true });
}
