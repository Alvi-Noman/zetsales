import type { Request, Response } from 'express';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import type { ShopifyOrderWebhook, WooOrderWebhook } from '../integrations/orderStatusMapper.js';
import { upsertShopifyOrder, upsertWooOrder, applyCourierStatusUpdate } from './ordersController.js';
import { upsertShopifyProductFromWebhook, deleteShopifyProductFromWebhook } from './productsController.js';
import type { ShopifyProduct } from '../integrations/shopifyClient.js';
import { mapSteadfastStatus, mapPathaoStatus } from '../integrations/courierStatusMapper.js';
import { findCourierByWebhookSecret } from './couriersController.js';

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

// Store-scoped custom apps (client-credentials auth) each have their own distinct Client Secret,
// which is what Shopify signs webhooks with — so we use the secret saved for this specific store
// rather than one shared global value. Classic OAuth apps share a single app-wide secret across
// every install, so those fall back to the env var instead.
function shopifyWebhookSecret(store: any): string {
  return store.credentials?.authMethod === 'client-credentials' && store.credentials?.clientSecret
    ? decryptSecret(store.credentials.clientSecret)
    : process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_CLIENT_SECRET || '';
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

  const secret = shopifyWebhookSecret(store);
  if (!secret || !verifyHmac(raw, signature, secret)) {
    logger.warn('[webhook] Shopify signature verification failed');
    res.status(401).send('Invalid signature');
    return;
  }

  const order = JSON.parse(raw.toString('utf8')) as ShopifyOrderWebhook;
  await upsertShopifyOrder(store.tenantId, storeId, order);

  res.status(200).send('ok');
}

// Handles both products/create and products/update — same normalize-and-upsert either way.
export async function shopifyProductWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  const signature = req.header('X-Shopify-Hmac-Sha256');
  const { storeId } = req.params;

  const db = getDb();
  const store = await db.collection('stores').findOne({ _id: new ObjectId(storeId) });
  if (!store) {
    res.status(404).send('Unknown store');
    return;
  }

  const secret = shopifyWebhookSecret(store);
  if (!secret || !verifyHmac(raw, signature, secret)) {
    logger.warn('[webhook] Shopify signature verification failed');
    res.status(401).send('Invalid signature');
    return;
  }

  const product = JSON.parse(raw.toString('utf8')) as ShopifyProduct;
  await upsertShopifyProductFromWebhook(store.tenantId, storeId, store.shopDomain, product);

  res.status(200).send('ok');
}

// Fires when a product is deleted directly in Shopify's admin — removes the matching local copy
// so it doesn't linger as a ghost record ZetSales can no longer delete via the Admin API.
export async function shopifyProductDeleteWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  const signature = req.header('X-Shopify-Hmac-Sha256');
  const { storeId } = req.params;

  const db = getDb();
  const store = await db.collection('stores').findOne({ _id: new ObjectId(storeId) });
  if (!store) {
    res.status(404).send('Unknown store');
    return;
  }

  const secret = shopifyWebhookSecret(store);
  if (!secret || !verifyHmac(raw, signature, secret)) {
    logger.warn('[webhook] Shopify signature verification failed');
    res.status(401).send('Invalid signature');
    return;
  }

  const { id } = JSON.parse(raw.toString('utf8')) as { id: number };
  await deleteShopifyProductFromWebhook(store.tenantId, storeId, String(id));

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

// Courier webhooks are account-level, not per-store (one Steadfast/Pathao account ships orders
// from every connected store), so unlike Shopify/WooCommerce there's no :storeId in the route.
// Each tenant connects their own courier account under Integrations → Courier Integration and
// pastes the secret we generate for them into that courier's webhook settings — so instead of a
// single shared env-var secret, the incoming secret is matched against every connected tenant's
// stored secret to find out whose account this call belongs to (see couriersController.ts). Once
// matched, the order is found by the consignment id the courier returned when the parcel was
// created, scoped to that same tenant.
//
// Steadfast's exact webhook payload shape hasn't been observed live yet (no sandbox credentials
// configured at the time this was written) — field names follow their published API docs. Logs
// the full raw payload on anything unrecognized so the shape can be corrected once real webhooks
// start arriving.
export async function steadfastWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  const token = (req.header('Authorization') || '').replace(/^Bearer\s+/i, '');

  const courier = await findCourierByWebhookSecret('steadfast', token);
  if (!courier) {
    logger.warn('[webhook] Steadfast signature verification failed');
    res.status(401).send('Invalid signature');
    return;
  }

  let payload: any;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).send('Invalid payload');
    return;
  }

  const consignmentId = String(payload.consignment_id ?? payload.consignment?.consignment_id ?? '');
  const rawStatus = String(payload.status ?? payload.delivery_status ?? '');
  if (!consignmentId || !rawStatus) {
    logger.warn(`[steadfast] webhook payload missing consignment_id/status: ${JSON.stringify(payload)}`);
    res.status(200).send('ok');
    return;
  }

  await applyCourierStatusUpdate(courier.tenantId, consignmentId, rawStatus, mapSteadfastStatus(rawStatus));
  res.status(200).send('ok');
}

// Pathao requires the response to echo the webhook secret back in a specific header within 10s
// (see their published webhook docs) — done below regardless of whether the payload turns out to
// be usable, since that acknowledgement is what keeps Pathao from disabling the webhook.
export async function pathaoWebhook(req: Request, res: Response) {
  const raw = req.body as Buffer;
  const signature = req.header('X-PATHAO-Signature') || '';

  const courier = await findCourierByWebhookSecret('pathao', signature);
  if (!courier) {
    logger.warn('[webhook] Pathao signature verification failed');
    res.status(401).send('Invalid signature');
    return;
  }

  res.setHeader('X-Pathao-Merchant-Webhook-Integration-Secret', signature);

  let payload: any;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    res.status(400).send('Invalid payload');
    return;
  }

  const consignmentId = String(payload.consignment_id ?? '');
  const rawStatus = String(payload.order_status ?? payload.status ?? '');
  if (!consignmentId || !rawStatus) {
    logger.warn(`[pathao] webhook payload missing consignment_id/order_status: ${JSON.stringify(payload)}`);
    res.status(200).send('ok');
    return;
  }

  await applyCourierStatusUpdate(courier.tenantId, consignmentId, rawStatus, mapPathaoStatus(rawStatus));
  res.status(200).send('ok');
}
