import type { Response } from 'express';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { AbandonedCheckoutDTO, AbandonedCheckoutStatsDTO } from '@zetsales/shared';
import {
  wooOrderAddress,
  wooOrderSubtotal,
  shopifyCheckoutAddress,
  type WooOrderWebhook,
  type ShopifyCheckoutWebhook,
} from '../integrations/orderStatusMapper.js';
import { attachRiskLabels } from './ordersController.js';

function toAbandonedCheckoutDto(doc: any): AbandonedCheckoutDTO {
  return {
    id: doc._id.toString(),
    storeId: doc.storeId,
    platform: doc.platform,
    externalId: doc.externalId,
    customerName: doc.customerName ?? null,
    customerPhone: doc.customerPhone ?? null,
    customerEmail: doc.customerEmail ?? null,
    address: doc.address ?? null,
    lineItems: doc.lineItems ?? [],
    subtotal: doc.subtotal ?? doc.total,
    total: doc.total,
    currency: doc.currency,
    reason: doc.reason,
    checkoutUrl: doc.checkoutUrl ?? null,
    riskLabel: doc.riskLabel ?? null,
    riskSuccessRate: doc.riskSuccessRate ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

// Called from upsertWooOrder (ordersController.ts) the first time a Woo order is seen still at an
// incomplete status — see WOO_INCOMPLETE_STATUSES for why only brand-new orders land here.
export async function upsertWooAbandonedCheckout(tenantId: string, storeId: string, order: WooOrderWebhook) {
  const db = getDb();
  const now = new Date();
  await db.collection('abandonedCheckouts').updateOne(
    { tenantId, storeId, externalId: String(order.id) },
    {
      $set: {
        platform: 'woocommerce',
        customerName: [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ') || null,
        customerPhone: order.billing?.phone || null,
        customerEmail: order.billing?.email || null,
        address: wooOrderAddress(order),
        lineItems: order.line_items.map((li) => ({
          title: li.name,
          variant: null,
          quantity: li.quantity,
          price: li.price,
          sku: li.sku,
          image: null,
          variantId: li.variation_id ? String(li.variation_id) : null,
        })),
        subtotal: wooOrderSubtotal(order),
        total: Number(order.total) || 0,
        currency: order.currency,
        reason: order.status,
        checkoutUrl: null,
        updatedAt: now,
      },
      $setOnInsert: { tenantId, storeId, externalId: String(order.id), createdAt: new Date(order.date_created_gmt || order.date_created) },
    },
    { upsert: true }
  );
}

// Called from shopifyCheckoutWebhook (webhooksController.ts) for both checkouts/create and
// checkouts/update — a completed_at means the customer finished checking out, so the row is
// recovered rather than still abandoned; the real order arrives separately via the orders webhook.
export async function upsertShopifyAbandonedCheckout(tenantId: string, storeId: string, checkout: ShopifyCheckoutWebhook) {
  const db = getDb();
  if (checkout.completed_at) {
    await db.collection('abandonedCheckouts').deleteOne({ tenantId, storeId, externalId: String(checkout.id) });
    return;
  }

  const now = new Date();
  await db.collection('abandonedCheckouts').updateOne(
    { tenantId, storeId, externalId: String(checkout.id) },
    {
      $set: {
        platform: 'shopify',
        customerName: [checkout.customer?.first_name, checkout.customer?.last_name].filter(Boolean).join(' ') || null,
        customerPhone: checkout.phone || checkout.customer?.phone || checkout.billing_address?.phone || null,
        customerEmail: checkout.email || checkout.customer?.email || null,
        address: shopifyCheckoutAddress(checkout),
        lineItems: checkout.line_items.map((li) => ({
          title: li.title,
          variant: li.variant_title ?? null,
          quantity: li.quantity,
          price: li.price,
          sku: li.sku,
          image: null,
          variantId: li.variant_id ? String(li.variant_id) : null,
        })),
        subtotal: Number(checkout.total_price) || 0,
        total: Number(checkout.total_price) || 0,
        currency: checkout.currency,
        reason: 'checkout_abandoned',
        checkoutUrl: checkout.abandoned_checkout_url ?? null,
        updatedAt: now,
      },
      $setOnInsert: { tenantId, storeId, externalId: String(checkout.id), createdAt: new Date(checkout.created_at) },
    },
    { upsert: true }
  );
}

export async function listAbandonedCheckouts(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const match: Record<string, unknown> = { tenantId };
  if (typeof req.query.storeId === 'string' && req.query.storeId !== 'all') match.storeId = req.query.storeId;
  if (typeof req.query.platform === 'string' && req.query.platform !== 'all') match.platform = req.query.platform;

  if (typeof req.query.dateFrom === 'string' || typeof req.query.dateTo === 'string') {
    const range: Record<string, Date> = {};
    if (typeof req.query.dateFrom === 'string') range.$gte = new Date(req.query.dateFrom);
    if (typeof req.query.dateTo === 'string') range.$lte = new Date(req.query.dateTo);
    match.createdAt = range;
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    match.$or = [{ customerName: re }, { customerPhone: re }, { customerEmail: re }];
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

  const pipeline = [
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await db.collection('abandonedCheckouts').aggregate(pipeline).toArray();
  const checkouts = (result?.data ?? []).map(toAbandonedCheckoutDto);
  const total = result?.totalCount?.[0]?.count ?? 0;

  await attachRiskLabels(db, tenantId, checkouts);

  res.json({ success: true, checkouts, total, page, pageSize });
}

export async function getAbandonedCheckoutStats(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const rows = await db
    .collection('abandonedCheckouts')
    .aggregate<{ _id: string; count: number; value: number }>([
      { $match: { tenantId } },
      { $group: { _id: '$platform', count: { $sum: 1 }, value: { $sum: '$total' } } },
    ])
    .toArray();

  const byPlatform: AbandonedCheckoutStatsDTO['byPlatform'] = { shopify: 0, woocommerce: 0 };
  let totalCount = 0;
  let totalValue = 0;
  for (const row of rows) {
    if (row._id === 'shopify' || row._id === 'woocommerce') byPlatform[row._id] = row.count;
    totalCount += row.count;
    totalValue += row.value;
  }

  const stats: AbandonedCheckoutStatsDTO = { totalCount, totalValue, byPlatform };
  res.json({ success: true, ...stats });
}
