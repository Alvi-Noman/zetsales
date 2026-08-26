import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { StoreDTO } from '@zetsales/shared';
import {
  normalizeShopDomain,
  verifyShopifyToken,
  buildShopifyOAuthUrl,
  exchangeShopifyCode,
  exchangeShopifyClientCredentials,
  registerShopifyWebhook,
  fetchShopifyCheckouts,
} from '../integrations/shopifyClient.js';
import { normalizeSiteUrl, verifyWooKeys, buildWooAuthUrl, registerWooWebhook } from '../integrations/wooClient.js';
import { getValidShopifyAccessToken } from '../integrations/shopifyAuth.js';
import { buildZetSiteAuthorizeUrl, exchangeZetSiteCode, registerZetSiteWebhook } from '../integrations/zetsiteClient.js';
import { upsertShopifyAbandonedCheckout } from './abandonedCheckoutsController.js';

const APP_NAME = 'ZetSales';

// Best-effort: registers the product webhooks that let newly added/edited products flow in
// automatically after the initial import. Never blocks store connection on failure (e.g. a
// localhost PUBLIC_COMMERCE_URL that Shopify can't reach) — the merchant can still import
// manually, they just won't get live updates until this succeeds on a reachable address.
async function registerShopifyProductWebhooks(shopDomain: string, accessToken: string, storeId: string) {
  const base = process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';
  const address = `${base}/webhooks/shopify/${storeId}/products`;
  try {
    await Promise.all([
      registerShopifyWebhook(shopDomain, accessToken, 'products/create', address),
      registerShopifyWebhook(shopDomain, accessToken, 'products/update', address),
      registerShopifyWebhook(shopDomain, accessToken, 'products/delete', `${address}/delete`),
    ]);
  } catch (err) {
    logger.warn(`[shopify] Could not register product webhooks for ${shopDomain}: ${(err as Error).message}`);
  }
}

// Same as above but for orders — without this, new orders placed after connecting never reach
// ZetSales at all (the receiving endpoint in webhooksController.ts has nothing to call it). Both
// topics point at the same handler: 'updated' fires on essentially any change (payment, fulfillment,
// cancellation), so a single upsertShopifyOrder path covers create and every later status change.
async function registerShopifyOrderWebhooks(shopDomain: string, accessToken: string, storeId: string) {
  const base = process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';
  const address = `${base}/webhooks/shopify/${storeId}/orders`;
  try {
    await Promise.all([
      registerShopifyWebhook(shopDomain, accessToken, 'orders/create', address),
      registerShopifyWebhook(shopDomain, accessToken, 'orders/updated', address),
    ]);
  } catch (err) {
    logger.warn(`[shopify] Could not register order webhooks for ${shopDomain}: ${(err as Error).message}`);
  }
}

// Abandoned checkouts are a separate Shopify object from orders, with their own topics — without
// this, a cart abandoned before becoming an order never reaches ZetSales at all. Requires the
// merchant's app to have "protected customer data" access approved in Shopify's app settings, since
// checkout payloads carry customer PII; falls back to no abandoned-checkout data (not a hard failure)
// if Shopify rejects the registration for that reason, same best-effort pattern as the siblings above.
async function registerShopifyCheckoutWebhooks(shopDomain: string, accessToken: string, storeId: string) {
  const base = process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';
  const address = `${base}/webhooks/shopify/${storeId}/checkouts`;
  try {
    await Promise.all([
      registerShopifyWebhook(shopDomain, accessToken, 'checkouts/create', address),
      registerShopifyWebhook(shopDomain, accessToken, 'checkouts/update', address),
    ]);
  } catch (err) {
    logger.warn(`[shopify] Could not register checkout webhooks for ${shopDomain}: ${(err as Error).message}`);
  }
}

// WooCommerce order webhooks need PUBLIC_COMMERCE_URL to be a real public HTTPS address the
// merchant's site can reach — same constraint as image fetching in wooClient.ts. Best-effort like
// the Shopify registrations above: never blocks the connection on failure.
async function registerWooOrderWebhooks(siteUrl: string, consumerKey: string, consumerSecret: string, storeId: string) {
  const base = process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';
  const address = `${base}/webhooks/woocommerce/${storeId}/orders`;
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn(`[woocommerce] WOOCOMMERCE_WEBHOOK_SECRET not set — skipping order webhook registration for ${siteUrl}`);
    return;
  }
  try {
    await Promise.all([
      registerWooWebhook(siteUrl, consumerKey, consumerSecret, 'order.created', address, secret),
      registerWooWebhook(siteUrl, consumerKey, consumerSecret, 'order.updated', address, secret),
    ]);
  } catch (err) {
    logger.warn(`[woocommerce] Could not register order webhooks for ${siteUrl}: ${(err as Error).message}`);
  }
}

// Mirrors registerShopifyProductWebhooks: without this, a product added or edited directly in
// WooCommerce after the initial import never reaches ZetSales until the merchant manually re-runs
// the import. Same best-effort/HTTPS-callback constraints as the order registration above.
async function registerWooProductWebhooks(siteUrl: string, consumerKey: string, consumerSecret: string, storeId: string) {
  const base = process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';
  const address = `${base}/webhooks/woocommerce/${storeId}/products`;
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn(`[woocommerce] WOOCOMMERCE_WEBHOOK_SECRET not set — skipping product webhook registration for ${siteUrl}`);
    return;
  }
  try {
    await Promise.all([
      registerWooWebhook(siteUrl, consumerKey, consumerSecret, 'product.created', address, secret),
      registerWooWebhook(siteUrl, consumerKey, consumerSecret, 'product.updated', address, secret),
      registerWooWebhook(siteUrl, consumerKey, consumerSecret, 'product.deleted', `${address}/delete`, secret),
    ]);
  } catch (err) {
    logger.warn(`[woocommerce] Could not register product webhooks for ${siteUrl}: ${(err as Error).message}`);
  }
}

// Registers where zetsite should deliver live product/order events for this store — a single
// registration covers every event, since zetsite dispatches one unified envelope shape rather than
// per-resource webhook topics the way Shopify/WooCommerce do (see the siblings above). Best-effort
// like those, same reasoning: never blocks the connection over a registration hiccup.
async function registerZetSiteWebhooks(accessToken: string, storeId: string) {
  const base = process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';
  const address = `${base}/webhooks/zetsite/${storeId}`;
  try {
    await registerZetSiteWebhook(accessToken, address, ['products/create', 'products/update', 'products/delete', 'orders/create', 'orders/updated']);
  } catch (err) {
    logger.warn(`[zetsite] Could not register webhooks for store ${storeId}: ${(err as Error).message}`);
  }
}

function toStoreDto(doc: any, orderCount = 0, productCount = doc.productCount ?? 0): StoreDTO {
  return {
    id: doc._id.toString(),
    platform: doc.platform,
    displayName: doc.displayName,
    shopDomain: doc.shopDomain,
    status: doc.status,
    connectionMethod: doc.connectionMethod,
    lastSyncedAt: doc.lastSyncedAt ? new Date(doc.lastSyncedAt).toISOString() : null,
    productCount,
    orderCount,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

// Counts are computed live so webhook/manual import writes cannot leave stale store badges.
export async function listStores(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const [stores, orderCounts, productCounts] = await Promise.all([
    db.collection('stores').find({ tenantId }).sort({ createdAt: -1 }).toArray(),
    db.collection('orders').aggregate([{ $match: { tenantId } }, { $group: { _id: '$storeId', count: { $sum: 1 } } }]).toArray(),
    db.collection('products').aggregate([{ $match: { tenantId } }, { $group: { _id: '$storeId', count: { $sum: 1 } } }]).toArray(),
  ]);
  const orderCountByStore = new Map(orderCounts.map((o) => [o._id as string, o.count as number]));
  const productCountByStore = new Map(productCounts.map((p) => [p._id as string, p.count as number]));
  res.json({
    success: true,
    stores: stores.map((s) => {
      const storeId = s._id.toString();
      return toStoreDto(s, orderCountByStore.get(storeId) ?? 0, productCountByStore.get(storeId) ?? 0);
    }),
  });
}

export async function capabilities(_req: AuthenticatedRequest, res: Response) {
  res.json({
    success: true,
    shopifyOAuthEnabled: Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET),
    metaAdsOAuthEnabled: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    tiktokAdsOAuthEnabled: Boolean(process.env.TIKTOK_APP_ID && process.env.TIKTOK_APP_SECRET),
    googleAdsOAuthEnabled: Boolean(process.env.GOOGLE_ADS_CLIENT_ID && process.env.GOOGLE_ADS_CLIENT_SECRET && process.env.GOOGLE_ADS_DEVELOPER_TOKEN),
  });
}

// The catch-all store CSV-imported orders land in when the merchant doesn't attribute them to a
// real connected storefront (see csvOrderImportController.ts). One per tenant, created lazily on
// first use — its displayName ("CSV Import") deterministically drives its own invoice-number
// prefix (buildStoreBillPrefix in invoiceNumbers.ts), so it never collides with a real store's
// numbering.
export async function getOrCreateCsvImportStore(tenantId: string) {
  const db = getDb();
  const now = new Date();
  const result = await db.collection('stores').findOneAndUpdate(
    { tenantId, platform: 'csv' },
    {
      $setOnInsert: {
        tenantId,
        platform: 'csv',
        displayName: 'CSV Import',
        shopDomain: null,
        status: 'connected',
        connectionMethod: 'manual',
        productCount: 0,
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return result!;
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

// One-time backfill for a store that connected before the checkouts/create|update subscription
// existed — pulls whatever's currently sitting abandoned in the last 30 days so the merchant isn't
// stuck starting from zero. 30 days, not "all time": Shopify's own abandoned-checkout recovery
// flow gives up well before that, so anything older is no longer an actionable lead.
async function backfillShopifyAbandonedCheckouts(tenantId: string, storeId: string, shopDomain: string, accessToken: string) {
  const createdAtMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let pageInfo: string | null = null;
  let imported = 0;
  do {
    const { checkouts, nextPageInfo } = await fetchShopifyCheckouts(shopDomain, accessToken, createdAtMin, pageInfo ?? undefined);
    for (const checkout of checkouts) {
      if (!checkout.completed_at) imported += 1;
      await upsertShopifyAbandonedCheckout(tenantId, storeId, checkout);
    }
    pageInfo = nextPageInfo;
  } while (pageInfo);
  return imported;
}

// Re-registers every webhook for a store (idempotent — registerShopifyWebhook/registerWooWebhook
// both skip an already-existing registration) and, for Shopify, backfills recently-abandoned
// checkouts. Exists for stores connected before a webhook topic existed (e.g. this feature's
// checkouts/create|update topics) — reconnecting via the connect flow already does this, but
// forcing a full reconnect just to pick up a new topic is unnecessary friction.
export async function resyncStore(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { storeId } = req.params;

  const store = await db.collection('stores').findOne({ _id: new ObjectId(storeId), tenantId });
  if (!store) {
    res.status(404).json({ success: false, message: 'Store not found' });
    return;
  }

  try {
    if (store.platform === 'shopify') {
      const accessToken = await getValidShopifyAccessToken(store);
      await registerShopifyProductWebhooks(store.shopDomain, accessToken, storeId);
      await registerShopifyOrderWebhooks(store.shopDomain, accessToken, storeId);
      await registerShopifyCheckoutWebhooks(store.shopDomain, accessToken, storeId);
      const checkoutsImported = await backfillShopifyAbandonedCheckouts(tenantId, storeId, store.shopDomain, accessToken);
      res.json({ success: true, checkoutsImported });
    } else if (store.platform === 'woocommerce') {
      const consumerKey = decryptSecret(store.credentials.consumerKey);
      const consumerSecret = decryptSecret(store.credentials.consumerSecret);
      await registerWooProductWebhooks(store.shopDomain, consumerKey, consumerSecret, storeId);
      await registerWooOrderWebhooks(store.shopDomain, consumerKey, consumerSecret, storeId);
      res.json({ success: true, checkoutsImported: 0 });
    } else if (store.platform === 'zetsite') {
      const accessToken = decryptSecret(store.credentials.accessToken);
      await registerZetSiteWebhooks(accessToken, storeId);
      res.json({ success: true, checkoutsImported: 0 });
    } else {
      res.status(400).json({ success: false, message: 'This store type has no webhooks to resync.' });
    }
  } catch (err) {
    logger.warn(`[resync] Failed for store ${storeId}: ${(err as Error).message}`);
    res.status(502).json({ success: false, message: 'Could not resync this store. Check its credentials are still valid.' });
  }
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

    await registerShopifyProductWebhooks(shopDomain, accessToken, result!._id.toString());
    await registerShopifyOrderWebhooks(shopDomain, accessToken, result!._id.toString());
    await registerShopifyCheckoutWebhooks(shopDomain, accessToken, result!._id.toString());

    res.json({ success: true, store: toStoreDto(result) });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error('[shopify connect] request failed:', err.response?.status, err.response?.data, err.config?.url);
    } else {
      console.error('[shopify connect] request failed:', err);
    }
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
    const result = await db.collection('stores').findOneAndUpdate(
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
      { upsert: true, returnDocument: 'after' }
    );

    await registerShopifyProductWebhooks(shopDomain, accessToken, result!._id.toString());
    await registerShopifyOrderWebhooks(shopDomain, accessToken, result!._id.toString());
    await registerShopifyCheckoutWebhooks(shopDomain, accessToken, result!._id.toString());

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

    await registerWooProductWebhooks(siteUrl, parsed.data.consumerKey, parsed.data.consumerSecret, result!._id.toString());
    await registerWooOrderWebhooks(siteUrl, parsed.data.consumerKey, parsed.data.consumerSecret, result!._id.toString());

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
  await registerWooProductWebhooks(session.siteUrl, consumerKey, consumerSecret, result!._id.toString());
  await registerWooOrderWebhooks(session.siteUrl, consumerKey, consumerSecret, result!._id.toString());

  res.json({ success: true, status: 'connected', store: toStoreDto(result) });
}

// --- zetsite: real OAuth authorization-code flow, one static trusted partner -------------------
//
// zetsite (a separate storefront-builder product the same operator owns) has no dynamic OAuth-client
// registry — it trusts one hardcoded partner identified by a shared secret, so this is simpler than
// Shopify's OAuth start: no shop-domain lookup, no per-install client id, just a signed state token
// (same jwt.sign pattern shopifyOAuthStart uses) carrying which tenant initiated the connect.

export async function zetsiteOAuthStart(req: AuthenticatedRequest, res: Response) {
  if (!process.env.ZETSITE_API_URL || !process.env.ZETSITE_INTEGRATION_SECRET) {
    res.status(501).json({
      success: false,
      message: 'ZetSite integration is not configured on this server yet. Set ZETSITE_API_URL and ZETSITE_INTEGRATION_SECRET.',
    });
    return;
  }

  const state = jwt.sign({ tenantId: req.user!.tenantId }, env.JWT_SECRET, { expiresIn: '15m' });
  res.redirect(buildZetSiteAuthorizeUrl(state));
}

export async function zetsiteOAuthCallback(req: AuthenticatedRequest, res: Response) {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error) {
    res.redirect(`${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/integrations?error=zetsite`);
    return;
  }
  if (!code || !state) {
    res.status(400).send('Invalid ZetSite OAuth callback.');
    return;
  }

  try {
    const decoded = jwt.verify(state, env.JWT_SECRET) as { tenantId: string };
    const exchanged = await exchangeZetSiteCode(code);

    const db = getDb();
    const now = new Date();
    const result = await db.collection('stores').findOneAndUpdate(
      { tenantId: decoded.tenantId, platform: 'zetsite', shopDomain: exchanged.storeSlug },
      {
        $set: {
          displayName: exchanged.storeName,
          status: 'connected',
          connectionMethod: 'oauth',
          // zetsite's own storeId, kept alongside the access token — needed if a future feature
          // ever has to disambiguate beyond what the token itself already scopes requests to.
          credentials: { accessToken: encryptSecret(exchanged.accessToken), zetSiteStoreId: exchanged.storeId },
          updatedAt: now,
        },
        $setOnInsert: { tenantId: decoded.tenantId, platform: 'zetsite', shopDomain: exchanged.storeSlug, productCount: 0, lastSyncedAt: null, createdAt: now },
      },
      { upsert: true, returnDocument: 'after' }
    );

    await registerZetSiteWebhooks(exchanged.accessToken, result!._id.toString());

    res.redirect(`${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/integrations?connected=zetsite`);
  } catch (err) {
    logger.warn(`[zetsite connect] callback failed: ${(err as Error).message}`);
    res.redirect(`${process.env.PUBLIC_APP_URL || 'http://localhost:3000'}/integrations?error=zetsite`);
  }
}
