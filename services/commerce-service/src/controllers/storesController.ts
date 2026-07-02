import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { StoreDTO } from '@zetsales/shared';
import {
  normalizeShopDomain,
  verifyShopifyToken,
  buildShopifyOAuthUrl,
  exchangeShopifyCode,
  exchangeShopifyClientCredentials,
} from '../integrations/shopifyClient.js';
import { normalizeSiteUrl, verifyWooKeys, buildWooAuthUrl } from '../integrations/wooClient.js';

const APP_NAME = 'ZetSales';

function toStoreDto(doc: any, orderCount = 0): StoreDTO {
  return {
    id: doc._id.toString(),
    platform: doc.platform,
    displayName: doc.displayName,
    shopDomain: doc.shopDomain,
    status: doc.status,
    connectionMethod: doc.connectionMethod,
    lastSyncedAt: doc.lastSyncedAt ? new Date(doc.lastSyncedAt).toISOString() : null,
    productCount: doc.productCount ?? 0,
    orderCount,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

// orderCount is computed live (not stored on the store doc, unlike productCount) so it never
// drifts out of sync with orders arriving continuously via webhook — the Orders/Products pages
// use it to only show the "import your history" prompt for a store that's genuinely never been
// imported, instead of every time the page loads.
export async function listStores(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const [stores, orderCounts] = await Promise.all([
    db.collection('stores').find({ tenantId }).sort({ createdAt: -1 }).toArray(),
    db.collection('orders').aggregate([{ $match: { tenantId } }, { $group: { _id: '$storeId', count: { $sum: 1 } } }]).toArray(),
  ]);
  const orderCountByStore = new Map(orderCounts.map((o) => [o._id as string, o.count as number]));
  res.json({ success: true, stores: stores.map((s) => toStoreDto(s, orderCountByStore.get(s._id.toString()) ?? 0)) });
}

export async function capabilities(_req: AuthenticatedRequest, res: Response) {
  res.json({
    success: true,
    shopifyOAuthEnabled: Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
  });
}

export async function removeStore(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const { storeId } = req.params;
  const result = await db.collection('stores').deleteOne({ _id: new ObjectId(storeId), tenantId: req.user!.tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Store not found' });
    return;
  }
  await db.collection('products').deleteMany({ storeId });
  res.json({ success: true });
}

// --- Shopify: self-service custom app, no Partner account needed ------------------------------
//
// Shopify retired the old "single static token" custom-app flow for any store setting one up
// after Jan 2026 — new custom apps (built via the merchant's own Dev Dashboard) hand out a
// Client ID + Client Secret instead, and the real access token has to be requested via the
// OAuth client_credentials grant and refreshed periodically (it expires every ~24h). Stores that
// already had a pre-2026 custom app still just have a plain, non-expiring token. We accept either.

const shopifyTokenSchema = z
  .object({
    shopDomain: z.string().trim().min(3),
    displayName: z.string().trim().optional(),
    accessToken: z.string().trim().min(10).optional(),
    clientId: z.string().trim().min(5).optional(),
    clientSecret: z.string().trim().min(5).optional(),
  })
  .refine((data) => Boolean(data.accessToken) || Boolean(data.clientId && data.clientSecret), {
    message: 'Provide either an access token, or both a Client ID and Client Secret.',
  });

export async function connectShopifyToken(req: AuthenticatedRequest, res: Response) {
  const parsed = shopifyTokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'shopDomain and (accessToken or clientId+clientSecret) are required' });
    return;
  }

  const shopDomain = normalizeShopDomain(parsed.data.shopDomain);

  try {
    let accessToken: string;
    let credentials: Record<string, unknown>;

    if (parsed.data.accessToken) {
      accessToken = parsed.data.accessToken;
      credentials = { authMethod: 'legacy-token', accessToken: encryptSecret(accessToken) };
    } else {
      const { clientId, clientSecret } = parsed.data as { clientId: string; clientSecret: string };
      const exchanged = await exchangeShopifyClientCredentials(shopDomain, clientId, clientSecret);
      accessToken = exchanged.accessToken;
      credentials = {
        authMethod: 'client-credentials',
        clientId: encryptSecret(clientId),
        clientSecret: encryptSecret(clientSecret),
        accessToken: encryptSecret(accessToken),
        tokenExpiresAt: new Date(Date.now() + exchanged.expiresInSeconds * 1000).toISOString(),
      };
    }

    const shop = await verifyShopifyToken(shopDomain, accessToken);

    const db = getDb();
    const now = new Date();
    const result = await db.collection('stores').findOneAndUpdate(
      { tenantId: req.user!.tenantId, platform: 'shopify', shopDomain },
      {
        $set: {
          displayName: parsed.data.displayName || shop.name,
          status: 'connected',
          connectionMethod: 'token',
          credentials,
          updatedAt: now,
        },
        $setOnInsert: { tenantId: req.user!.tenantId, platform: 'shopify', shopDomain, productCount: 0, lastSyncedAt: null, createdAt: now },
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, store: toStoreDto(result) });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Could not verify this Shopify store. Check the domain and credentials.' });
  }
}

export async function shopifyOAuthStart(req: AuthenticatedRequest, res: Response) {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const shop = typeof req.query.shop === 'string' ? normalizeShopDomain(req.query.shop) : '';

  if (!clientId) {
    res.status(501).json({
      success: false,
      message: 'Shopify OAuth is not configured on this server yet. Use "Connect with access token" instead, or set SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET.',
    });
    return;
  }
  if (!shop) {
    res.status(400).json({ success: false, message: 'Missing shop parameter' });
    return;
  }

  const redirectUri = `${process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce'}/stores/shopify/oauth/callback`;
  const state = jwt.sign({ tenantId: req.user!.tenantId, shop }, env.JWT_SECRET, { expiresIn: '15m' });

  res.redirect(buildShopifyOAuthUrl(shop, clientId, redirectUri, state));
}

export async function shopifyOAuthCallback(req: AuthenticatedRequest, res: Response) {
  const { code, state, shop } = req.query as { code?: string; state?: string; shop?: string };
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  if (!code || !state || !shop || !clientId || !clientSecret) {
    res.status(400).send('Invalid Shopify OAuth callback.');
    return;
  }

  try {
    const decoded = jwt.verify(state, env.JWT_SECRET) as { tenantId: string; shop: string };
    const shopDomain = normalizeShopDomain(shop);
    const accessToken = await exchangeShopifyCode(shopDomain, clientId, clientSecret, code);
    const shopInfo = await verifyShopifyToken(shopDomain, accessToken);

    const db = getDb();
    const now = new Date();
    await db.collection('stores').findOneAndUpdate(
      { tenantId: decoded.tenantId, platform: 'shopify', shopDomain },
      {
        $set: {
          displayName: shopInfo.name,
          status: 'connected',
          connectionMethod: 'oauth',
          credentials: { authMethod: 'oauth', accessToken: encryptSecret(accessToken) },
          updatedAt: now,
        },
        $setOnInsert: { tenantId: decoded.tenantId, platform: 'shopify', shopDomain, productCount: 0, lastSyncedAt: null, createdAt: now },
      },
      { upsert: true }
    );

    res.redirect(`${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/integrations?connected=shopify`);
  } catch (err) {
    res.redirect(`${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/integrations?error=shopify`);
  }
}

// --- WooCommerce: manual consumer key/secret ---------------------------------------------------

const wooKeysSchema = z.object({
  siteUrl: z.string().trim().min(4),
  consumerKey: z.string().trim().min(5),
  consumerSecret: z.string().trim().min(5),
  displayName: z.string().trim().optional(),
});

export async function connectWooKeys(req: AuthenticatedRequest, res: Response) {
  const parsed = wooKeysSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'siteUrl, consumerKey and consumerSecret are required' });
    return;
  }

  const siteUrl = normalizeSiteUrl(parsed.data.siteUrl);

  try {
    await verifyWooKeys(siteUrl, parsed.data.consumerKey, parsed.data.consumerSecret);

    const db = getDb();
    const now = new Date();
    const result = await db.collection('stores').findOneAndUpdate(
      { tenantId: req.user!.tenantId, platform: 'woocommerce', shopDomain: siteUrl },
      {
        $set: {
          displayName: parsed.data.displayName || new URL(siteUrl).hostname,
          status: 'connected',
          connectionMethod: 'keys',
          credentials: {
            consumerKey: encryptSecret(parsed.data.consumerKey),
            consumerSecret: encryptSecret(parsed.data.consumerSecret),
          },
          updatedAt: now,
        },
        $setOnInsert: { tenantId: req.user!.tenantId, platform: 'woocommerce', shopDomain: siteUrl, productCount: 0, lastSyncedAt: null, createdAt: now },
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, store: toStoreDto(result) });
  } catch (err) {
    res.status(400).json({ success: false, message: 'Could not verify these WooCommerce keys. Check the site URL and REST API permissions.' });
  }
}

// --- WooCommerce: one-click Application Authentication -----------------------------------------

const wooAuthStartSchema = z.object({ siteUrl: z.string().trim().min(4) });

export async function wooAuthStart(req: AuthenticatedRequest, res: Response) {
  const parsed = wooAuthStartSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'siteUrl is required' });
    return;
  }

  const callbackBase = process.env.PUBLIC_COMMERCE_URL;
  if (!callbackBase || !callbackBase.startsWith('https://')) {
    res.status(501).json({
      success: false,
      message: 'One-click WooCommerce connect needs a public HTTPS callback URL (WooCommerce requires HTTPS). Set PUBLIC_COMMERCE_URL to a deployed HTTPS address, or use "Connect with API keys" instead for local development.',
    });
    return;
  }

  const siteUrl = normalizeSiteUrl(parsed.data.siteUrl);
  const db = getDb();
  const session = await db.collection('woo_auth_sessions').insertOne({
    tenantId: req.user!.tenantId,
    siteUrl,
    consumerKey: null,
    consumerSecret: null,
    completed: false,
    createdAt: new Date(),
  });

  const sessionId = session.insertedId.toString();
  const returnUrl = `${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/integrations?wooSession=${sessionId}`;
  const callbackUrl = `${callbackBase}/stores/woocommerce/auth/callback`;

  res.json({ success: true, sessionId, authorizeUrl: buildWooAuthUrl(siteUrl, APP_NAME, sessionId, returnUrl, callbackUrl) });
}

// Public endpoint — WooCommerce POSTs the generated keys here directly, no JWT available.
export async function wooAuthCallback(req: AuthenticatedRequest, res: Response) {
  const { user_id, consumer_key, consumer_secret } = req.body as {
    user_id?: string;
    consumer_key?: string;
    consumer_secret?: string;
  };
  if (!user_id || !consumer_key || !consumer_secret) {
    res.status(400).json({ success: false, message: 'Invalid WooCommerce callback payload' });
    return;
  }

  const db = getDb();
  await db.collection('woo_auth_sessions').updateOne(
    { _id: new ObjectId(user_id) },
    { $set: { consumerKey: encryptSecret(consumer_key), consumerSecret: encryptSecret(consumer_secret), completed: true } }
  );

  res.json({ success: true });
}

export async function wooAuthStatus(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const session = await db.collection('woo_auth_sessions').findOne({ _id: new ObjectId(req.params.sessionId), tenantId: req.user!.tenantId });
  if (!session) {
    res.status(404).json({ success: false, message: 'Session not found or expired' });
    return;
  }

  if (!session.completed) {
    res.json({ success: true, status: 'pending' });
    return;
  }

  const consumerKey = decryptSecret(session.consumerKey);
  const consumerSecret = decryptSecret(session.consumerSecret);

  const now = new Date();
  const result = await db.collection('stores').findOneAndUpdate(
    { tenantId: session.tenantId, platform: 'woocommerce', shopDomain: session.siteUrl },
    {
      $set: {
        displayName: new URL(session.siteUrl).hostname,
        status: 'connected',
        connectionMethod: 'oauth',
        credentials: { consumerKey: encryptSecret(consumerKey), consumerSecret: encryptSecret(consumerSecret) },
        updatedAt: now,
      },
      $setOnInsert: { tenantId: session.tenantId, platform: 'woocommerce', shopDomain: session.siteUrl, productCount: 0, lastSyncedAt: null, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );

  await db.collection('woo_auth_sessions').deleteOne({ _id: session._id });

  res.json({ success: true, status: 'connected', store: toStoreDto(result) });
}
