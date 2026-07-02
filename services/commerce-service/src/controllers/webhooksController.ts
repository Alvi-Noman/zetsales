import type { Request, Response } from 'express';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import type { ShopifyOrderWebhook, WooOrderWebhook } from '../integrations/orderStatusMapper.js';
import { upsertShopifyOrder, upsertWooOrder } from './ordersController.js';

// Webhook bodies arrive as a raw Buffer (see routes/webhooksRoutes.ts) so we can verify the
// signature over the exact bytes sent, before trusting/parsing the JSON.
function verifyHmac(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function shopifyOrderWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  const signature = req.header('X-Shopify-Hmac-Sha256');
  const { storeId } = req.params;

  const db = getDb();
  const store = await db.collection('stores').findOne({ _id: new ObjectId(storeId) });
  if (!store) {
    res.status(404).send('Unknown store');
    return;
  }

  // Store-scoped custom apps (client-credentials auth) each have their own distinct Client
  // Secret, which is what Shopify signs webhooks with — so we use the secret saved for this
  // specific store rather than one shared global value. Classic OAuth apps share a single
  // app-wide secret across every install, so those fall back to the env var instead.
  const secret =
    store.credentials?.authMethod === 'client-credentials' && store.credentials?.clientSecret
      ? decryptSecret(store.credentials.clientSecret)
      : process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET || '';

  if (!secret || !verifyHmac(raw, signature, secret)) {
    logger.warn('[webhook] Shopify signature verification failed');
    res.status(401).send('Invalid signature');
    return;
  }

  const order = JSON.parse(raw.toString('utf8')) as ShopifyOrderWebhook;
  await upsertShopifyOrder(store.tenantId, storeId, order);

  res.status(200).send('ok');
}

export async function wooOrderWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  const secret = process.env.WOOCOMMERCE_WEBHOOK_SECRET || '';
  const signature = req.header('X-WC-Webhook-Signature');

  if (!secret || !verifyHmac(raw, signature, secret)) {
    logger.warn('[webhook] WooCommerce signature verification failed');
    res.status(401).send('Invalid signature');
    return;
  }

  const { storeId } = req.params;
  const order = JSON.parse(raw.toString('utf8')) as WooOrderWebhook;

  const db = getDb();
  const store = await db.collection('stores').findOne({ _id: new ObjectId(storeId) });
  if (!store) {
    res.status(404).send('Unknown store');
    return;
  }

  await upsertWooOrder(store.tenantId, storeId, order);

  res.status(200).send('ok');
}
