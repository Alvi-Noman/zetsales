import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import { resolveRange, bucketDate, bucketLabel, bucketIndexExpr, type TrendGranularity, type TrendWindow } from '../utils/dateRange.js';
import logger from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { OrderDTO, OrderRiskDTO, OrderStage, RiskLabel } from '@zetsales/shared';
import { fetchShopifyOrderCount, fetchShopifyOrders } from '../integrations/shopifyClient.js';
import { getValidShopifyAccessToken } from '../integrations/shopifyAuth.js';
import { fetchWooOrders } from '../integrations/wooClient.js';
import { applyInventoryStageEffect, checkStockForConfirm, recordFulfillmentWarehouse, resolveInventoryState } from '../integrations/inventoryEffects.js';
import { createSteadfastConsignment } from '../integrations/steadfastClient.js';
import { createPathaoOrder } from '../integrations/pathaoClient.js';
import { getConnectedCourier, markCourierUsed, decryptSteadfastCredentials, decryptPathaoCredentials } from './couriersController.js';
import {
  mapShopifyOrderStage,
  mapShopifyPaymentStatus,
  mapWooOrderStage,
  mapWooPaymentStatus,
  normalizePaymentMethod,
  shopifyOrderAddress,
  wooOrderAddress,
  shopifyOrderSubtotal,
  shopifyOrderShippingFee,
  wooOrderSubtotal,
  wooOrderShippingFee,
  type ShopifyOrderWebhook,
  type WooOrderWebhook,
} from '../integrations/orderStatusMapper.js';

function toOrderDto(doc: any): OrderDTO {
  return {
    id: doc._id.toString(),
    storeId: doc.storeId,
    platform: doc.platform,
    externalId: doc.externalId,
    number: doc.number,
    stage: doc.stage,
    heldFromStage: doc.heldFromStage ?? null,
    paymentStatus: doc.paymentStatus,
    paymentMethod: doc.paymentMethod ?? 'Other',
    subtotal: doc.subtotal ?? doc.total,
    shippingFee: doc.shippingFee ?? 0,
    discount: doc.discount ?? 0,
    total: doc.total,
    currency: doc.currency,
    tags: doc.tags ?? [],
    customerName: doc.customerName,
    customerPhone: doc.customerPhone,
    customerEmail: doc.customerEmail ?? null,
    address: doc.address ?? null,
    lineItems: (doc.lineItems ?? []).map((li: any) => ({ ...li, image: li.image ?? null })),
    holdReason: doc.holdReason ?? null,
    cancelReason: doc.cancelReason ?? null,
    flagReason: doc.flagReason ?? null,
    note: doc.note ?? null,
    rescheduledFor: doc.rescheduledFor ? new Date(doc.rescheduledFor).toISOString() : null,
    isPriorityCall: doc.isPriorityCall ?? false,
    priorityNote: doc.priorityNote ?? null,
    isCustomerBlocked: false, // overwritten by attachBlockedFlags where relevant — not knowable from the doc alone
    courierPartner: doc.courierPartner ?? null,
    courierTrackingId: doc.courierTrackingId ?? null,
    courierConsignmentId: doc.courierConsignmentId ?? null,
    courierStatus: doc.courierStatus ?? null,
    courierSyncedAt: doc.courierSyncedAt ? new Date(doc.courierSyncedAt).toISOString() : null,
    courierCharge: doc.courierCharge ?? null,
    deliveryZone: doc.deliveryZone ?? null,
    callAttempts: doc.callAttempts ?? 0,
    history: (doc.history ?? []).map((h: any) => ({ label: h.label, detail: h.detail, at: new Date(h.at).toISOString(), by: h.by ?? null })),
    returnLocation: doc.returnLocation ?? null,
    fulfillmentWarehouseId: doc.fulfillmentWarehouseId ?? null,
    fulfillmentWarehouseName: doc.fulfillmentWarehouseName ?? null,
    cogsTotal: doc.cogsTotal ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

// Flags are system-detected, not manually picked — a human reviews and clears them (via the
// normal "Clear flag & confirm" action), rather than raising them by hand. Reuses the same prior-
// order lookup as risk scoring, so it costs one extra query per newly-synced order, not a
// collection-wide scan.
async function computeAutoFlagReason(tenantId: string, customerPhone: string | null, total: number): Promise<string | null> {
  if (!customerPhone) return null;

  const db = getDb();
  const priorOrders = await db.collection('orders').find({ tenantId, customerPhone }).project({ stage: 1, total: 1 }).toArray();

  if (priorOrders.length === 0) {
    return total > 20_000 ? 'Unusually large order from a first-time customer' : null;
  }

  const deliveredCount = priorOrders.filter((o) => o.stage === 'Delivered' || o.stage === 'Partial Delivered').length;
  const cancelledOrReturnedCount = priorOrders.filter((o) => o.stage === 'Cancelled' || o.stage === 'Returned').length;
  const resolvedCount = deliveredCount + cancelledOrReturnedCount;
  if (resolvedCount >= 2 && deliveredCount / resolvedCount < 0.4) {
    return 'Customer has a low delivery success rate';
  }

  const avgTotal = priorOrders.reduce((sum, o) => sum + (o.total || 0), 0) / priorOrders.length;
  if (avgTotal > 0 && total > avgTotal * 3) {
    return 'Unusually large order compared to this customer’s history';
  }

  return null;
}

// Blocking is a customer fact (by phone), not an order field — it has to be checkable *before* a
// future order even exists, at webhook-sync time, so it can't live on any single order document.
async function isCustomerBlocked(tenantId: string, customerPhone: string | null): Promise<boolean> {
  if (!customerPhone) return false;
  const db = getDb();
  const blocked = await db.collection('blockedCustomers').findOne({ tenantId, phone: customerPhone }, { projection: { _id: 1 } });
  return !!blocked;
}

const SEED_FIELDS = {
  holdReason: null,
  cancelReason: null,
  note: null,
  courierPartner: null,
  courierTrackingId: null,
  courierConsignmentId: null,
  courierStatus: null,
  courierSyncedAt: null,
  deliveryZone: null,
  heldFromStage: null,
  returnLocation: null,
  callAttempts: 0,
  discount: 0,
};

// Once a human has manually set an order's stage (Flag, Hold, Out for Delivery, etc. — concepts
// Shopify/WooCommerce can't tell us about), a later webhook re-sync should not silently clobber
// that judgment call. The one exception is the platform reporting the order as truly cancelled,
// which always wins since that's an objective fact, not a workflow nuance. Every real stage
// transition (synced or manual) is logged to `history` so the drawer can show a real timeline.
export async function upsertShopifyOrder(tenantId: string, storeId: string, order: ShopifyOrderWebhook) {
  const db = getDb();
  const now = new Date();
  const existing = await db.collection('orders').findOne({ tenantId, storeId, externalId: String(order.id) }, { projection: { stageSource: 1, stage: 1, heldFromStage: 1 } });

  const setFields: Record<string, unknown> = {
    number: order.name,
    paymentStatus: mapShopifyPaymentStatus(order),
    paymentMethod: normalizePaymentMethod(order.payment_gateway_names?.[0]),
    subtotal: shopifyOrderSubtotal(order),
    shippingFee: shopifyOrderShippingFee(order),
    total: Number(order.total_price) || 0,
    currency: order.currency,
    tags: (order.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    customerName: [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || null,
    customerPhone: order.customer?.phone || order.shipping_address?.phone || null,
    customerEmail: order.customer?.email || null,
    address: shopifyOrderAddress(order),
    lineItems: order.line_items.map((li) => ({ title: li.title, variant: li.variant_title || null, quantity: li.quantity, price: Number(li.price) || 0, sku: li.sku })),
    createdAt: new Date(order.created_at),
    updatedAt: now,
  };

  let newStage: string = mapShopifyOrderStage(order);
  const canRestage = !existing || existing.stageSource !== 'manual' || order.cancelled_at;
  let autoFlagReason: string | null = null;
  let autoCancelReason: string | null = null;
  if (canRestage && newStage === 'Pending') {
    if (await isCustomerBlocked(tenantId, setFields.customerPhone as string | null)) {
      newStage = 'Cancelled';
      autoCancelReason = 'Blocked customer';
    } else {
      autoFlagReason = await computeAutoFlagReason(tenantId, setFields.customerPhone as string | null, setFields.total as number);
      if (autoFlagReason) newStage = 'Flagged';
    }
  }

  const stageChanging = canRestage && newStage !== existing?.stage;
  if (canRestage) {
    setFields.stage = newStage;
    setFields.stageSource = 'synced';
    setFields.flagReason = autoFlagReason;
    if (autoCancelReason) setFields.cancelReason = 'Blocked customer';
  }

  const update: Record<string, unknown> = {
    $set: setFields,
    $setOnInsert: {
      tenantId, storeId, externalId: String(order.id), platform: 'shopify',
      ...SEED_FIELDS,
      history: [{ label: 'Order placed', detail: 'Synced from Shopify', at: new Date(order.created_at) }],
    },
  };
  if (existing && stageChanging) {
    update.$push = { history: { label: newStage, detail: autoCancelReason || autoFlagReason || 'Synced from Shopify', at: now } };
  }

  await db.collection('orders').updateOne({ tenantId, storeId, externalId: String(order.id) }, update, { upsert: true });

  // A brand-new order (no `existing`) has no prior inventory state to release — it's as if it
  // arrived from 'none', which correctly reserves stock immediately if a webhook's first sighting
  // of an order already has it past Pending (e.g. a historical backfill, or an order that was
  // already confirmed on the platform before ZetSales ever saw it).
  if (stageChanging) {
    const fromState = existing ? resolveInventoryState(existing.stage, existing.heldFromStage) : 'none';
    const toState = resolveInventoryState(newStage as OrderStage, undefined);
    const { cogsDelta, warehouse } = await applyInventoryStageEffect(tenantId, setFields.lineItems as { sku: string | null; variant: string | null; quantity: number }[], fromState, toState);
    if (cogsDelta !== 0) await db.collection('orders').updateOne({ tenantId, storeId, externalId: String(order.id) }, { $inc: { cogsTotal: cogsDelta } });
    await recordFulfillmentWarehouse({ tenantId, storeId, externalId: String(order.id) }, fromState, warehouse);
  }
}

export async function upsertWooOrder(tenantId: string, storeId: string, order: WooOrderWebhook) {
  const db = getDb();
  const now = new Date();
  const existing = await db.collection('orders').findOne({ tenantId, storeId, externalId: String(order.id) }, { projection: { stageSource: 1, stage: 1, heldFromStage: 1 } });

  const setFields: Record<string, unknown> = {
    number: order.number,
    paymentStatus: mapWooPaymentStatus(order),
    paymentMethod: normalizePaymentMethod(order.payment_method_title),
    subtotal: wooOrderSubtotal(order),
    shippingFee: wooOrderShippingFee(order),
    total: Number(order.total) || 0,
    currency: order.currency,
    tags: [] as string[],
    customerName: [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ') || null,
    customerPhone: order.billing?.phone || null,
    customerEmail: order.billing?.email || null,
    address: wooOrderAddress(order),
    lineItems: order.line_items.map((li) => ({ title: li.name, variant: null, quantity: li.quantity, price: li.price, sku: li.sku })),
    createdAt: new Date(order.date_created),
    updatedAt: now,
  };

  let newStage: string = mapWooOrderStage(order);
  const canRestage = !existing || existing.stageSource !== 'manual' || order.status === 'cancelled';
  let autoFlagReason: string | null = null;
  let autoCancelReason: string | null = null;
  if (canRestage && newStage === 'Pending') {
    if (await isCustomerBlocked(tenantId, setFields.customerPhone as string | null)) {
      newStage = 'Cancelled';
      autoCancelReason = 'Blocked customer';
    } else {
      autoFlagReason = await computeAutoFlagReason(tenantId, setFields.customerPhone as string | null, setFields.total as number);
      if (autoFlagReason) newStage = 'Flagged';
    }
  }

  const stageChanging = canRestage && newStage !== existing?.stage;
  if (canRestage) {
    setFields.stage = newStage;
    setFields.stageSource = 'synced';
    setFields.flagReason = autoFlagReason;
    if (autoCancelReason) setFields.cancelReason = 'Blocked customer';
  }

  const update: Record<string, unknown> = {
    $set: setFields,
    $setOnInsert: {
      tenantId, storeId, externalId: String(order.id), platform: 'woocommerce',
      ...SEED_FIELDS,
      history: [{ label: 'Order placed', detail: 'Synced from WooCommerce', at: new Date(order.date_created) }],
    },
  };
  if (existing && stageChanging) {
    update.$push = { history: { label: newStage, detail: autoCancelReason || autoFlagReason || 'Synced from WooCommerce', at: now } };
  }

  await db.collection('orders').updateOne({ tenantId, storeId, externalId: String(order.id) }, update, { upsert: true });

  if (stageChanging) {
    const fromState = existing ? resolveInventoryState(existing.stage, existing.heldFromStage) : 'none';
    const toState = resolveInventoryState(newStage as OrderStage, undefined);
    const { cogsDelta, warehouse } = await applyInventoryStageEffect(tenantId, setFields.lineItems as { sku: string | null; variant: string | null; quantity: number }[], fromState, toState);
    if (cogsDelta !== 0) await db.collection('orders').updateOne({ tenantId, storeId, externalId: String(order.id) }, { $inc: { cogsTotal: cogsDelta } });
    await recordFulfillmentWarehouse({ tenantId, storeId, externalId: String(order.id) }, fromState, warehouse);
  }
}

// Backfills historical orders (everything placed before the webhook subscription existed) via
// the same live-progress SSE pattern as product import — a store can easily have thousands of
// past orders, so the UI needs a real "N of Total" counter rather than a blind spinner.
export async function importStoreOrdersStream(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const store = await db.collection('stores').findOne({ _id: new ObjectId(req.params.storeId), tenantId: req.user!.tenantId });
  if (!store) {
    res.status(404).json({ success: false, message: 'Store not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  let cancelled = false;
  req.on('close', () => {
    cancelled = true;
  });

  const storeId = store._id.toString();
  let imported = 0;

  try {
    if (store.platform === 'shopify') {
      const accessToken = await getValidShopifyAccessToken(store);
      const total = await fetchShopifyOrderCount(store.shopDomain, accessToken);
      send({ type: 'start', total });

      let pageInfo: string | null | undefined;
      do {
        const { orders, nextPageInfo } = await fetchShopifyOrders(store.shopDomain, accessToken, pageInfo || undefined);
        for (const o of orders) {
          if (cancelled) break;
          await upsertShopifyOrder(store.tenantId, storeId, o);
          imported += 1;
          send({ type: 'progress', imported, total, title: o.name });
        }
        pageInfo = cancelled ? null : nextPageInfo;
      } while (pageInfo && imported < 20_000);
    } else {
      const consumerKey = decryptSecret(store.credentials.consumerKey);
      const consumerSecret = decryptSecret(store.credentials.consumerSecret);
      let page = 1;
      let total: number | null = null;
      let batchLength = 0;

      do {
        const result = await fetchWooOrders(store.shopDomain, consumerKey, consumerSecret, page);
        batchLength = result.orders.length;
        if (total === null) {
          total = result.total;
          send({ type: 'start', total: total ?? batchLength });
        }
        for (const o of result.orders) {
          if (cancelled) break;
          await upsertWooOrder(store.tenantId, storeId, o);
          imported += 1;
          send({ type: 'progress', imported, total: total ?? imported, title: o.number });
        }
        page += 1;
      } while (!cancelled && batchLength === 50 && imported < 20_000);
    }

    if (cancelled) return;

    const orderCount = await db.collection('orders').countDocuments({ tenantId: store.tenantId, storeId });
    send({ type: 'done', imported, orderCount });
  } catch (err) {
    send({ type: 'error', message: `Import failed: ${(err as Error).message}` });
  } finally {
    res.end();
  }
}

const SORT_FIELD_MAP: Record<string, string> = {
  number: 'number',
  date: 'createdAt',
  updated: 'updatedAt',
  total: 'total',
};

// Tabs are compound filters a plain stage/paymentStatus dropdown can't express on its own (e.g.
// "COD due" spans several active stages but excludes cancelled/returned ones). Shared between
// listOrders and getOrderStats so the tab counts always match what clicking the tab actually shows.
export const TAB_KEYS = ['all', 'priority', 'pending', 'confirmed', 'processing', 'shipped', 'returning', 'delivered', 'codDue', 'hold', 'cancelled'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

function tabMatch(tab: string | undefined): Record<string, unknown> {
  switch (tab) {
    // Orders that need an outbound call right now, for three unrelated reasons: a reschedule the
    // customer asked for has come due, a not-yet-confirmed cart has enough distinct SKUs that it's
    // worth calling before they lose interest, or someone manually flagged it (a reason the system
    // can't see — a DM asking for a callback, a VIP customer, a hunch). Wrapped in `$and` (not a
    // second top-level `$or`) because `search` below also sets `match.$or` for its own purposes —
    // sharing that key would silently replace one filter with the other instead of combining them.
    // The manual flag excludes terminal stages defensively, even though `isPriorityCall` already
    // auto-clears on every stage change — a courier-webhook stage write bypasses that clearing path.
    case 'priority':
      return {
        $and: [
          {
            $or: [
              { stage: 'On Hold', rescheduledFor: { $ne: null, $lte: new Date() } },
              { stage: { $in: ['Pending', 'Flagged'] }, $expr: { $gte: [{ $size: { $setUnion: ['$lineItems.sku'] } }, 3] } },
              { isPriorityCall: true, stage: { $nin: ['Delivered', 'Partial Delivered', 'Returned', 'Cancelled'] } },
            ],
          },
        ],
      };
    case 'pending':
      return { stage: { $in: ['Pending', 'Flagged'] } };
    case 'confirmed':
      return { stage: 'Confirmed' };
    case 'processing':
      return { stage: 'Processing' };
    case 'shipped':
      return { stage: { $in: ['Shipped', 'Out for Delivery'] } };
    case 'returning':
      return { stage: { $in: ['RTO Initiated', 'QC Pending'] } };
    case 'delivered':
      return { stage: { $in: ['Delivered', 'Partial Delivered'] } };
    case 'codDue':
      return { paymentStatus: 'COD Pending', stage: { $nin: ['Cancelled', 'Returned'] } };
    case 'hold':
      return { stage: 'On Hold' };
    case 'cancelled':
      return { stage: { $in: ['Cancelled', 'Returned'] } };
    default:
      return {};
  }
}

// Order line items never carry an image (Shopify/WooCommerce order webhooks don't include one) —
// but we already sync a product catalog with images separately, keyed by the same SKU. Matching
// on SKU within each order's own store lets the table show a real product thumbnail instead of a
// fabricated one, for the common case where the SKU still resolves to a synced product.
async function attachLineItemImages(db: ReturnType<typeof getDb>, tenantId: string, orders: any[]) {
  const storeIds = [...new Set(orders.map((o) => o.storeId))];
  const skusPresent = orders.some((o) => (o.lineItems ?? []).some((li: any) => li.sku));
  if (storeIds.length === 0 || !skusPresent) return;

  const products = await db
    .collection('products')
    .find({ tenantId, storeId: { $in: storeIds }, 'variants.sku': { $ne: null } })
    .project({ storeId: 1, image: 1, 'variants.sku': 1 })
    .toArray();

  const imageBySkuKey = new Map<string, string>();
  for (const p of products) {
    if (!p.image) continue;
    for (const v of p.variants ?? []) {
      if (v.sku) imageBySkuKey.set(`${p.storeId}::${v.sku}`, p.image);
    }
  }

  for (const order of orders) {
    for (const li of order.lineItems ?? []) {
      li.image = li.sku ? imageBySkuKey.get(`${order.storeId}::${li.sku}`) ?? null : null;
    }
  }
}

// `isCustomerBlocked` isn't stored on the order — it's derived from a lookup against the tenant's
// blocklist, keyed by phone. One query for the whole page/response instead of one per order.
async function attachBlockedFlags(db: ReturnType<typeof getDb>, tenantId: string, orders: OrderDTO[]) {
  const phones = [...new Set(orders.map((o) => o.customerPhone).filter((p): p is string => !!p))];
  if (phones.length === 0) return;

  const blocked = await db.collection('blockedCustomers').find({ tenantId, phone: { $in: phones } }).project({ phone: 1 }).toArray();
  const blockedPhones = new Set(blocked.map((b) => b.phone));
  for (const order of orders) {
    if (order.customerPhone && blockedPhones.has(order.customerPhone)) order.isCustomerBlocked = true;
  }
}

export async function listOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const match: Record<string, unknown> = { tenantId, ...tabMatch(req.query.tab as string | undefined) };
  if (typeof req.query.storeId === 'string' && req.query.storeId !== 'all') match.storeId = req.query.storeId;
  if (typeof req.query.paymentStatus === 'string' && req.query.paymentStatus !== 'all') match.paymentStatus = req.query.paymentStatus;

  if (typeof req.query.dateFrom === 'string' || typeof req.query.dateTo === 'string') {
    const range: Record<string, Date> = {};
    if (typeof req.query.dateFrom === 'string') range.$gte = new Date(req.query.dateFrom);
    if (typeof req.query.dateTo === 'string') range.$lte = new Date(req.query.dateTo);
    match.createdAt = range;
  }

  if (typeof req.query.amountMin === 'string' || typeof req.query.amountMax === 'string') {
    const range: Record<string, number> = {};
    if (typeof req.query.amountMin === 'string' && req.query.amountMin.trim()) range.$gte = Number(req.query.amountMin);
    if (typeof req.query.amountMax === 'string' && req.query.amountMax.trim()) range.$lte = Number(req.query.amountMax);
    if (Object.keys(range).length > 0) match.total = range;
  }

  if (typeof req.query.callAttemptsMin === 'string' && req.query.callAttemptsMin.trim()) {
    match.callAttempts = { $gte: Number(req.query.callAttemptsMin) };
  }

  if (typeof req.query.courierPartner === 'string' && req.query.courierPartner.trim()) {
    const escaped = req.query.courierPartner.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.courierPartner = new RegExp(escaped, 'i');
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    match.$or = [{ number: re }, { customerName: re }, { customerPhone: re }];
  }

  const sortKey = typeof req.query.sortKey === 'string' && req.query.sortKey in SORT_FIELD_MAP ? req.query.sortKey : 'date';
  const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));

  const pipeline = [
    { $match: match },
    { $sort: { [SORT_FIELD_MAP[sortKey]]: sortDir } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await db.collection('orders').aggregate(pipeline).toArray();
  await attachLineItemImages(db, tenantId, result?.data ?? []);
  const orders = (result?.data ?? []).map(toOrderDto);
  await attachBlockedFlags(db, tenantId, orders);
  const total = result?.totalCount?.[0]?.count ?? 0;

  res.json({ success: true, orders, total, page, pageSize });
}

// "Is this KPI trending up or down" — measured as orders *placed* in the last 7 days that match
// `extraMatch` (usually "currently in stage X") vs the 7 days before that. This is a real,
// consistently-computable signal (unlike e.g. "time entered this stage", which most orders never
// got a history event for), even though it's a proxy: a Cancelled-today order counts against
// "cancelled" regardless of when it was placed, which is what a seller actually wants to see.
async function volumeTrend(
  baseMatch: Record<string, unknown>,
  extraMatch: Record<string, unknown>,
  now: Date,
  d7: Date,
  d14: Date,
  sumField?: string
): Promise<number | null> {
  const db = getDb();
  const windowValue = async (from: Date, to: Date) => {
    const [agg] = await db
      .collection('orders')
      .aggregate([
        { $match: { ...baseMatch, ...extraMatch, createdAt: { $gte: from, $lt: to } } },
        { $group: { _id: null, count: { $sum: 1 }, sum: { $sum: sumField ? `$${sumField}` : 0 } } },
      ])
      .toArray();
    return sumField ? agg?.sum ?? 0 : agg?.count ?? 0;
  };
  const current = await windowValue(d7, now);
  const previous = await windowValue(d14, d7);
  if (previous > 0) return Math.round(((current - previous) / previous) * 100);
  return current > 0 ? 100 : null;
}

// Powers the stats row (KPI cards) and the tab count badges in one round trip, so the numbers on
// the tabs always agree with what listOrders would actually return for them.
export async function getOrderStats(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const baseMatch: Record<string, unknown> = { tenantId };
  if (typeof req.query.storeId === 'string' && req.query.storeId !== 'all') baseMatch.storeId = req.query.storeId;
  const scopedMatch: Record<string, unknown> = { ...baseMatch };
  if (typeof req.query.dateFrom === 'string' || typeof req.query.dateTo === 'string') {
    const range: Record<string, Date> = {};
    if (typeof req.query.dateFrom === 'string') range.$gte = new Date(req.query.dateFrom);
    if (typeof req.query.dateTo === 'string') range.$lte = new Date(req.query.dateTo);
    scopedMatch.createdAt = range;
  }

  const tabCountsAgg = await db
    .collection('orders')
    .aggregate([
      { $match: scopedMatch },
      {
        $facet: Object.fromEntries(
          TAB_KEYS.map((key) => [key, [{ $match: tabMatch(key === 'all' ? undefined : key) }, { $count: 'count' }]])
        ),
      },
    ])
    .toArray();

  const tabCounts = Object.fromEntries(
    TAB_KEYS.map((key) => [key, tabCountsAgg[0]?.[key]?.[0]?.count ?? 0])
  ) as Record<TabKey, number>;

  const [oldestPending] = await db
    .collection('orders')
    .aggregate([{ $match: { ...scopedMatch, ...tabMatch('pending') } }, { $sort: { createdAt: 1 } }, { $limit: 1 }, { $project: { createdAt: 1 } }])
    .toArray();
  const oldestPendingMinutes = oldestPending ? Math.round((Date.now() - new Date(oldestPending.createdAt).getTime()) / 60_000) : null;

  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    totalOrdersTrend,
    totalRevenueTrend,
    pendingTrend,
    confirmedTrend,
    processingTrend,
    deliveredTrend,
    rtoTrend,
    cancelledTrend,
    rtoCount,
    cancelledCount,
    codOutstandingAgg,
  ] = await Promise.all([
    volumeTrend(baseMatch, {}, now, d7, d14),
    volumeTrend(baseMatch, {}, now, d7, d14, 'total'),
    volumeTrend(baseMatch, tabMatch('pending'), now, d7, d14),
    volumeTrend(baseMatch, tabMatch('confirmed'), now, d7, d14),
    volumeTrend(baseMatch, tabMatch('processing'), now, d7, d14),
    volumeTrend(baseMatch, tabMatch('delivered'), now, d7, d14),
    volumeTrend(baseMatch, { stage: 'Returned' }, now, d7, d14),
    volumeTrend(baseMatch, { stage: 'Cancelled' }, now, d7, d14),
    db.collection('orders').countDocuments({ ...scopedMatch, stage: 'Returned' }),
    db.collection('orders').countDocuments({ ...scopedMatch, stage: 'Cancelled' }),
    db
      .collection('orders')
      .aggregate([
        { $match: { ...scopedMatch, paymentStatus: 'COD Pending', stage: { $nin: ['Cancelled', 'Returned'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ])
      .toArray(),
  ]);

  const totalsAgg = await db.collection('orders').aggregate([{ $match: scopedMatch }, { $group: { _id: null, totalRevenue: { $sum: '$total' } } } ]).toArray();

  const dailyAgg = await db
    .collection('orders')
    .aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: d14 } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ])
    .toArray();
  const dailySeries: { date: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const found = dailyAgg.find((x) => x._id === key);
    dailySeries.push({ date: key, count: found?.count ?? 0 });
  }

  res.json({
    success: true,
    totalOrders: tabCounts.all,
    totalOrdersTrend,
    totalRevenue: totalsAgg[0]?.totalRevenue ?? 0,
    totalRevenueTrend,
    pendingTrend,
    confirmedTrend,
    oldestPendingMinutes,
    processingTrend,
    deliveredTrend,
    rtoOrders: rtoCount,
    rtoTrend,
    cancelledOrders: cancelledCount,
    cancelledTrend,
    codOutstanding: codOutstandingAgg[0]?.total ?? 0,
    tabCounts,
    dailySeries,
  });
}

async function fetchTrendSeries(baseMatch: Record<string, unknown>, window: TrendWindow, granularity: TrendGranularity, bucketCount: number) {
  const db = getDb();
  const agg = await db
    .collection('orders')
    .aggregate([
      { $match: { ...baseMatch, createdAt: { $gte: window.from, $lt: window.to } } },
      {
        $group: {
          _id: bucketIndexExpr(granularity, window.from),
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          pending: { $sum: { $cond: [{ $in: ['$stage', ['Pending', 'Flagged']] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $eq: ['$stage', 'Confirmed'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$stage', 'Processing'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $in: ['$stage', ['Cancelled', 'Returned']] }, 1, 0] } },
        },
      },
    ])
    .toArray();

  const byIndex = new Map(agg.map((a) => [a._id, a]));
  const points = [];
  for (let i = 0; i < bucketCount; i++) {
    const found = byIndex.get(i);
    points.push({
      index: i,
      label: bucketLabel(granularity, window.from, i),
      date: bucketDate(granularity, window.from, i).toISOString(),
      totalOrders: found?.totalOrders ?? 0,
      totalRevenue: found?.totalRevenue ?? 0,
      pending: found?.pending ?? 0,
      confirmed: found?.confirmed ?? 0,
      processing: found?.processing ?? 0,
      delivered: found?.delivered ?? 0,
      cancelled: found?.cancelled ?? 0,
    });
  }
  return { from: window.from.toISOString(), to: window.to.toISOString(), points };
}

// Powers the per-card trend charts: a full time series for the selected period plus the
// "intelligently" matched comparison period, both bucketed identically so they can be drawn as
// two overlaid lines.
export async function getOrderTrends(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const baseMatch: Record<string, unknown> = { tenantId };
  if (typeof req.query.storeId === 'string' && req.query.storeId !== 'all') baseMatch.storeId = req.query.storeId;

  const range = typeof req.query.range === 'string' ? req.query.range : 'last7';
  const customFrom = typeof req.query.from === 'string' ? req.query.from : undefined;
  const customTo = typeof req.query.to === 'string' ? req.query.to : undefined;
  const { granularity, bucketCount, current, comparison } = resolveRange(range, customFrom, customTo);

  const [currentSeries, comparisonSeries] = await Promise.all([
    fetchTrendSeries(baseMatch, current, granularity, bucketCount),
    fetchTrendSeries(baseMatch, comparison, granularity, bucketCount),
  ]);

  res.json({ success: true, granularity, current: currentSeries, comparison: comparisonSeries });
}

// Computed from real order history for this customer's phone number — not a fabricated score.
// Thresholds are a reasonable starting heuristic for COD sellers: a customer with no delivery
// track record yet is unproven rather than risky, and success rate below 40% is a real red flag.
async function computeOrderRisk(tenantId: string, customerPhone: string | null, excludeOrderId: ObjectId): Promise<OrderRiskDTO> {
  if (!customerPhone) {
    return { label: 'New Customer', totalOrders: 0, deliveredCount: 0, cancelledOrReturnedCount: 0, successRate: null };
  }

  const db = getDb();
  const priorOrders = await db
    .collection('orders')
    .find({ tenantId, customerPhone, _id: { $ne: excludeOrderId } })
    .project({ stage: 1 })
    .toArray();

  const totalOrders = priorOrders.length;
  if (totalOrders === 0) {
    return { label: 'New Customer', totalOrders: 0, deliveredCount: 0, cancelledOrReturnedCount: 0, successRate: null };
  }

  const deliveredCount = priorOrders.filter((o) => o.stage === 'Delivered' || o.stage === 'Partial Delivered').length;
  const cancelledOrReturnedCount = priorOrders.filter((o) => o.stage === 'Cancelled' || o.stage === 'Returned').length;
  const resolvedCount = deliveredCount + cancelledOrReturnedCount;
  const successRate = resolvedCount > 0 ? Math.round((deliveredCount / resolvedCount) * 100) : null;

  let label: RiskLabel = 'Normal';
  if (successRate !== null) {
    if (successRate >= 70) label = 'Trusted';
    else if (successRate < 40) label = 'Risky';
  }

  return { label, totalOrders, deliveredCount, cancelledOrReturnedCount, successRate };
}

export async function getOrder(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const doc = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }

  const risk = await computeOrderRisk(tenantId, doc.customerPhone, doc._id);
  const dto = toOrderDto(doc);
  await attachBlockedFlags(db, tenantId, [dto]);
  res.json({ success: true, order: dto, risk });
}

const ORDER_STAGES = [
  'Pending', 'Flagged', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery',
  'RTO Initiated', 'QC Pending', 'Delivered', 'Partial Delivered', 'Returned', 'Cancelled', 'On Hold',
] as const;
const HOLD_REASONS = [
  'Payment verification pending', 'Address needs confirmation', 'Stock check needed',
  'Customer requested reschedule', 'Awaiting customer response',
  'Stock shortfall found', 'Customer unreachable for delivery', 'Address unclear to courier', 'Courier delay',
  'Attempting redelivery', 'Courier dispute', 'Customer says they never refused it',
  'Other',
] as const;
const CANCEL_REASONS = [
  'Customer unreachable', 'Customer changed mind', 'Duplicate order', 'Out of stock',
  'Fraud suspected', 'Wrong address', 'Price/payment dispute', 'Blocked customer', 'Other',
] as const;
// What actually happened on a confirmation call — a plain attempt counter can't tell "rang out"
// from "customer picked up and confirmed", which is the difference call-outcome analytics need.
const CALL_OUTCOMES = ['Confirmed', 'Rescheduled', 'Customer Cancelled', 'No Answer', 'Wrong Number', 'Switched Off', 'Busy'] as const;

const updateOrderSchema = z.object({
  stage: z.enum(ORDER_STAGES).optional(),
  resume: z.boolean().optional(),
  holdReason: z.enum(HOLD_REASONS).nullable().optional(),
  cancelReason: z.enum(CANCEL_REASONS).nullable().optional(),
  flagReason: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  rescheduledFor: z.string().nullable().optional(),
  isPriorityCall: z.boolean().optional(),
  priorityNote: z.string().trim().max(500).nullable().optional(),
  courierPartner: z.enum(['Steadfast', 'Pathao']).nullable().optional(),
  courierTrackingId: z.string().trim().max(100).nullable().optional(),
  courierCharge: z.number().nonnegative().nullable().optional(),
  deliveryZone: z.string().trim().max(100).nullable().optional(),
  shippingFee: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  incrementCallAttempt: z.boolean().optional(),
  callOutcome: z.enum(CALL_OUTCOMES).optional(),
});
type UpdateOrderPatch = z.infer<typeof updateOrderSchema>;

// Shared by the single-order PATCH and the bulk endpoint — same manual-stage marking, same
// heldFromStage capture/restore, same history logging, so a bulk action behaves identically to
// doing the same thing one order at a time.
function buildOrderUpdate(current: any, patch: UpdateOrderPatch, actor: string | null = null) {
  const { stage, resume, incrementCallAttempt, callOutcome, ...rest } = patch;
  const now = new Date();
  const setFields: Record<string, unknown> = { ...rest, updatedAt: now };

  // Shipping fee and discount are the only two manual inputs that affect the total — recompute it
  // whenever either changes so "Total" (and "COD to collect") never goes stale relative to what's
  // actually being displayed in the cost breakdown. Discount is a flat amount, not a percentage.
  let codChangeEntry: { label: string; detail: string; at: Date; by: string | null } | null = null;
  if (patch.shippingFee !== undefined || patch.discount !== undefined) {
    const subtotal = current.subtotal ?? current.total ?? 0;
    const shippingFee = patch.shippingFee ?? current.shippingFee ?? 0;
    const discount = patch.discount ?? current.discount ?? 0;
    const nextTotal = Math.max(0, subtotal + shippingFee - discount);
    setFields.total = nextTotal;
    // Recorded separately from the generic stage historyEntry below (this can happen with or
    // without a stage change in the same request) — this is what the "COD amount changed" analytics
    // card and the order timeline both read to show who adjusted the collectible amount and by how
    // much, something that previously went completely untracked.
    const previousTotal = current.total ?? 0;
    if (Math.round(nextTotal * 100) !== Math.round(previousTotal * 100)) {
      codChangeEntry = { label: 'COD amount changed', detail: `৳${previousTotal.toFixed(2)} → ৳${nextTotal.toFixed(2)}`, at: now, by: actor };
    }
  }

  let historyEntry: { label: string; detail: string; at: Date; by: string | null } | null = null;
  if (resume) {
    const restored = current.heldFromStage || 'Pending';
    setFields.stage = restored;
    setFields.stageSource = 'manual';
    setFields.heldFromStage = null;
    setFields.holdReason = null;
    setFields.note = null;
    setFields.rescheduledFor = null;
    if (rest.isPriorityCall === undefined) { setFields.isPriorityCall = false; setFields.priorityNote = null; }
    historyEntry = { label: restored, detail: 'Resumed from hold', at: now, by: actor };
  } else if (stage) {
    setFields.stage = stage;
    setFields.stageSource = 'manual';
    if (stage === 'On Hold') setFields.heldFromStage = current.stage;
    // `note` only ever gets written by the Hold/Cancel reason menus, as an annotation for that
    // specific hold/cancel — it's not a general-purpose order note. If this transition didn't
    // supply a fresh one (e.g. a plain "Confirm order" / "Mark shipped" click), clear whatever was
    // left over from a previous hold so it doesn't keep showing up as if it still applied.
    if (rest.note === undefined) setFields.note = null;
    if (rest.rescheduledFor === undefined) setFields.rescheduledFor = null;
    // Same reasoning for the manual priority flag — once the order's actually moved on, whatever
    // reason it was flagged for has presumably been dealt with (someone called, stage changed).
    if (rest.isPriorityCall === undefined) { setFields.isPriorityCall = false; setFields.priorityNote = null; }
    const reason = rest.holdReason || rest.cancelReason || rest.flagReason;
    const detail = [reason, rest.note].filter(Boolean).join(' — ') || 'Updated manually';
    historyEntry = { label: stage, detail, at: now, by: actor };
  } else if (rest.isPriorityCall !== undefined) {
    // Marking/unmarking priority on its own, with no stage change — the standalone "Mark priority" /
    // "Unmark priority" action from the drawer. Unmarking always clears the note too, even if this
    // patch didn't explicitly send one — otherwise a stale note would resurface the next time
    // someone re-marks the same order.
    if (!rest.isPriorityCall) setFields.priorityNote = null;
    historyEntry = rest.isPriorityCall
      ? { label: 'Marked priority', detail: rest.priorityNote || 'Flagged for a priority call', at: now, by: actor }
      : { label: 'Priority cleared', detail: 'Unmarked manually', at: now, by: actor };
  }

  // A call attempt is its own event alongside whatever stage change came with it (e.g. "Confirmed"
  // after a call that was answered) — collected into the same $push via $each rather than only
  // ever recording the last one, so time-to-first-contact and per-outcome breakdowns both stay
  // reconstructable from history alone.
  const callEntry = incrementCallAttempt ? { label: 'Call attempt', detail: callOutcome ?? 'No outcome recorded', at: now, by: actor } : null;
  const historyEntries = [historyEntry, callEntry, codChangeEntry].filter((e): e is NonNullable<typeof e> => e !== null);

  const update: Record<string, unknown> = { $set: setFields };
  if (historyEntries.length > 0) update.$push = { history: { $each: historyEntries } };
  if (incrementCallAttempt) update.$inc = { callAttempts: 1 };
  return update;
}

// Fresh-reservation gate — only fires the instant an order would move from having no inventory
// commitment into 'reserved' for the first time (Pending/Flagged -> Confirmed is the only manual
// path that does this). If the best-stocked location can't cover every line item and the matching
// product variant has oversell turned off, this reroutes the whole update to Flagged instead of
// letting it confirm clean — reusing the same "system detected something, a human clears it" stage
// this codebase already has for fraud-risk. Any other case (enough stock, oversell allowed, or not
// a fresh reservation at all) returns the patch untouched.
async function applyOutOfStockPolicy(tenantId: string, current: any, patch: UpdateOrderPatch): Promise<UpdateOrderPatch> {
  if (!patch.stage) return patch;
  const fromState = resolveInventoryState(current.stage, current.heldFromStage);
  const toState = resolveInventoryState(patch.stage, undefined);
  if (fromState !== 'none' || toState !== 'reserved') return patch;

  const shortfalls = await checkStockForConfirm(tenantId, current.lineItems ?? []);
  const blocking = shortfalls.find((s) => s.blocksConfirm);
  if (!blocking) return patch;

  const label = blocking.productTitle ?? blocking.sku;
  return {
    ...patch,
    stage: 'Flagged',
    flagReason: `Out of stock: ${label} (${blocking.free} of ${blocking.needed} available) — oversell is off for this variant`,
  };
}

// Stage/hold/cancel/courier/zone/etc are all local-to-ZetSales — none of this pushes back to
// Shopify/WooCommerce, since those platforms have no matching concepts (confirmation calls,
// courier handover, delivery zones). Setting `stage` here marks it manual so the next webhook
// sync won't silently overwrite the human's call (see upsertShopifyOrder/upsertWooOrder).
export async function updateOrder(req: AuthenticatedRequest, res: Response) {
  const parsed = updateOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid update payload' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const current = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!current) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }

  const patch = await applyOutOfStockPolicy(tenantId, current, parsed.data);
  const update = buildOrderUpdate(current, patch, req.user!.email);
  const result = await db.collection('orders').findOneAndUpdate({ _id: new ObjectId(req.params.id), tenantId }, update, { returnDocument: 'after' });

  if (!result) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }

  if (result.stage !== current.stage || result.heldFromStage !== current.heldFromStage) {
    const fromState = resolveInventoryState(current.stage, current.heldFromStage);
    const toState = resolveInventoryState(result.stage, result.heldFromStage);
    const { cogsDelta, warehouse } = await applyInventoryStageEffect(tenantId, current.lineItems, fromState, toState);
    if (cogsDelta !== 0) {
      await db.collection('orders').updateOne({ _id: result._id }, { $inc: { cogsTotal: cogsDelta } });
      result.cogsTotal = (result.cogsTotal ?? 0) + cogsDelta;
    }
    await recordFulfillmentWarehouse({ _id: result._id, tenantId }, fromState, warehouse);
  }
  if (result.stage === 'Shipped' && current.stage !== 'Shipped') {
    await dispatchCourierConsignment(tenantId, result);
  }

  const dto = toOrderDto(result);
  await attachBlockedFlags(db, tenantId, [dto]);
  res.json({ success: true, order: dto });
}

const blockCustomerSchema = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

// Blocks by the phone on *this* order rather than trusting a client-supplied number — the phone
// always comes from the order document itself, so there's no way to block a number you didn't
// actually see on a real order. Once blocked, any future order synced from Shopify/WooCommerce with
// this same phone gets auto-cancelled at sync time (see isCustomerBlocked in upsertShopifyOrder/
// upsertWooOrder) instead of entering the normal Pending/confirmation workflow.
export async function blockCustomer(req: AuthenticatedRequest, res: Response) {
  const parsed = blockCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid request' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id), tenantId }, { projection: { customerPhone: 1 } });
  if (!order) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }
  if (!order.customerPhone) {
    res.status(400).json({ success: false, message: 'This order has no phone number to block.' });
    return;
  }

  await db.collection('blockedCustomers').updateOne(
    { tenantId, phone: order.customerPhone },
    { $set: { tenantId, phone: order.customerPhone, note: parsed.data.note ?? null, blockedAt: new Date(), blockedBy: req.user!.email } },
    { upsert: true }
  );
  res.json({ success: true });
}

export async function unblockCustomer(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id), tenantId }, { projection: { customerPhone: 1 } });
  if (!order) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }
  if (order.customerPhone) {
    await db.collection('blockedCustomers').deleteOne({ tenantId, phone: order.customerPhone });
  }
  res.json({ success: true });
}

// COD payment status is otherwise entirely driven by the connected store's own financial_status
// (mapShopifyPaymentStatus/mapWooPaymentStatus never produce 'Collected') — for a COD business the
// actual cash usually clears through a courier settlement, a fact Shopify/WooCommerce has no way to
// know. This is the one manual action that records it, with a real timestamp (unlike everything
// that was inferred before this existed) so COD-collection analytics stop having to guess.
export async function markPaymentCollected(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!order) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }
  if (order.paymentMethod !== 'Cash on Delivery') {
    res.status(400).json({ success: false, message: 'Only Cash on Delivery orders can be marked collected here.' });
    return;
  }
  if (order.paymentStatus === 'Collected') {
    res.status(400).json({ success: false, message: 'Already marked collected.' });
    return;
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    $set: { paymentStatus: 'Collected', updatedAt: now },
    $push: { history: { label: 'Payment collected', detail: 'Marked collected manually', at: now, by: req.user!.email } },
  };
  const result = await db.collection('orders').findOneAndUpdate({ _id: order._id }, update, { returnDocument: 'after' });
  const dto = toOrderDto(result!);
  await attachBlockedFlags(db, tenantId, [dto]);
  res.json({ success: true, order: dto });
}

const partialDeliverSchema = z.object({
  splits: z.array(z.object({
    sku: z.string().nullable(),
    variant: z.string().nullable(),
    keptQuantity: z.number().int().nonnegative(),
  })).min(1),
});

// "Partial Delivered" isn't one fact — a customer might keep 1 of 4 shirts and hand the rest
// straight back to the same courier on the doorstep. Treating the whole order's quantity as
// delivered (the old one-click behavior) would wrongly deduct all 4 from stock when only 1 was
// actually sold. This takes the real kept/returned split per line item instead: the kept portion
// is consumed like a normal delivery, and the returned portion enters the exact same RTO Initiated
// pipeline as any other return — physically it's the same event (the courier is bringing it
// straight back), it just happens at the doorstep instead of after a failed delivery attempt.
export async function markPartialDelivered(req: AuthenticatedRequest, res: Response) {
  const parsed = partialDeliverSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A kept quantity for each line item is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const current = await db.collection('orders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!current) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }

  const now = new Date();
  const keptLineItems: any[] = [];
  const returnedLineItems: any[] = [];
  for (const li of current.lineItems ?? []) {
    const split = parsed.data.splits.find((s) => s.sku === li.sku && s.variant === li.variant);
    const keptQuantity = Math.min(li.quantity, Math.max(0, split?.keptQuantity ?? li.quantity));
    const returnedQuantity = li.quantity - keptQuantity;
    if (keptQuantity > 0) keptLineItems.push({ ...li, quantity: keptQuantity });
    if (returnedQuantity > 0) returnedLineItems.push({ ...li, quantity: returnedQuantity });
  }

  const fromState = resolveInventoryState(current.stage, current.heldFromStage);
  // Returned units simply stay held (a same-state call is a no-op) — same as a full RTO, they
  // aren't available again until QC confirms them back. Kept units move to consumed like a normal
  // delivery. Two separate calls because a single order can't have two different outcomes applied
  // to the same lineItems array in one pass.
  let cogsDelta = 0;
  if (returnedLineItems.length > 0) cogsDelta += (await applyInventoryStageEffect(tenantId, returnedLineItems, fromState, 'reserved')).cogsDelta;
  if (keptLineItems.length > 0) cogsDelta += (await applyInventoryStageEffect(tenantId, keptLineItems, fromState, 'consumed')).cogsDelta;

  const keptTotal = keptLineItems.reduce((sum, li) => sum + li.quantity, 0);
  const returnedTotal = returnedLineItems.reduce((sum, li) => sum + li.quantity, 0);
  const update: Record<string, unknown> = {
    $set: {
      stage: 'Partial Delivered',
      stageSource: 'manual',
      updatedAt: now,
      partialReturn: returnedLineItems.length > 0 ? { lineItems: returnedLineItems, status: 'RTO Initiated', returnLocation: null, updatedAt: now } : null,
    },
    $push: { history: { label: 'Partial Delivered', detail: `${keptTotal} kept, ${returnedTotal} returned`, at: now } },
  };
  if (cogsDelta !== 0) update.$inc = { cogsTotal: cogsDelta };
  const result = await db.collection('orders').findOneAndUpdate({ _id: current._id }, update, { returnDocument: 'after' });

  const dto = toOrderDto(result!);
  await attachBlockedFlags(db, tenantId, [dto]);
  res.json({ success: true, order: dto });
}

const bulkUpdateSchema = z.object({
  orderIds: z.array(z.string()).min(1).max(500),
  patch: updateOrderSchema,
});

export async function bulkUpdateOrders(req: AuthenticatedRequest, res: Response) {
  const parsed = bulkUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid bulk update payload' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const results: { orderId: string; success: boolean; error?: string }[] = [];

  for (const orderId of parsed.data.orderIds) {
    try {
      const current = await db.collection('orders').findOne({ _id: new ObjectId(orderId), tenantId });
      if (!current) {
        results.push({ orderId, success: false, error: 'Order not found' });
        continue;
      }
      const patch = await applyOutOfStockPolicy(tenantId, current, parsed.data.patch);
      const update = buildOrderUpdate(current, patch, req.user!.email);
      const result = await db.collection('orders').findOneAndUpdate({ _id: new ObjectId(orderId), tenantId }, update, { returnDocument: 'after' });
      if (result && (result.stage !== current.stage || result.heldFromStage !== current.heldFromStage)) {
        const fromState = resolveInventoryState(current.stage, current.heldFromStage);
        const toState = resolveInventoryState(result.stage, result.heldFromStage);
        const { cogsDelta, warehouse } = await applyInventoryStageEffect(tenantId, current.lineItems, fromState, toState);
        if (cogsDelta !== 0) await db.collection('orders').updateOne({ _id: result._id }, { $inc: { cogsTotal: cogsDelta } });
        await recordFulfillmentWarehouse({ _id: result._id, tenantId }, fromState, warehouse);
      }
      if (result && result.stage === 'Shipped' && current.stage !== 'Shipped') {
        await dispatchCourierConsignment(tenantId, result);
      }
      results.push({ orderId, success: true });
    } catch (err) {
      results.push({ orderId, success: false, error: (err as Error).message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  res.json({ success: successCount > 0, results });
}

// Fires once per order the moment it's marked Shipped — hands the parcel to whichever courier is
// set on the order. Soft-fails on purpose: a missing credential or a courier-side error shouldn't
// block the order from shipping locally, it just means that particular order falls back to manual
// courier tracking (the courierPartner/courierTrackingId fields staff can still edit by hand).
async function dispatchCourierConsignment(tenantId: string, order: any) {
  if (!order.courierPartner || order.courierConsignmentId) return;

  try {
    const codAmount = order.paymentMethod === 'Cash on Delivery' ? order.total : 0;
    let consignmentId: string;
    let trackingCode: string | null = null;
    let chargeRate: number | null = null;

    if (order.courierPartner === 'Steadfast') {
      const courier = await getConnectedCourier(tenantId, 'steadfast');
      if (!courier) return;
      const result = await createSteadfastConsignment(decryptSteadfastCredentials(courier), {
        invoice: order.number,
        recipientName: order.customerName ?? 'Customer',
        recipientPhone: order.customerPhone ?? '',
        recipientAddress: order.address ?? '',
        codAmount,
      });
      consignmentId = result.consignmentId;
      trackingCode = result.trackingCode;
      chargeRate = courier.deliveryChargeRate ?? null;
      await markCourierUsed(courier._id);
    } else if (order.courierPartner === 'Pathao') {
      const courier = await getConnectedCourier(tenantId, 'pathao');
      if (!courier) return;
      const result = await createPathaoOrder(decryptPathaoCredentials(courier), {
        invoice: order.number,
        recipientName: order.customerName ?? 'Customer',
        recipientPhone: order.customerPhone ?? '',
        recipientAddress: order.address ?? '',
        codAmount,
      });
      consignmentId = result.consignmentId;
      chargeRate = courier.deliveryChargeRate ?? null;
      await markCourierUsed(courier._id);
    } else {
      return;
    }

    const db = getDb();
    await db.collection('orders').updateOne(
      { _id: order._id, tenantId },
      {
        $set: {
          courierConsignmentId: consignmentId,
          courierTrackingId: trackingCode ?? order.courierTrackingId ?? null,
          courierStatus: 'pending',
          courierSyncedAt: new Date(),
          // Snapshotted now, not looked up later — a rate change afterward shouldn't rewrite what
          // this specific order was actually charged.
          courierCharge: chargeRate,
        },
      }
    );
  } catch (err) {
    logger.warn(`[courier] auto-consignment creation failed for order ${order._id?.toString()} via ${order.courierPartner} — order still ships locally: ${(err as Error).message}`);
  }
}

// A courier is only ever allowed to move an order while it's within the courier's own leg of the
// journey — a stale or out-of-order webhook can't reach into stages it has no business touching
// (Cancelled, On Hold, QC Pending, Returned, etc.), the same way upsertShopifyOrder/upsertWooOrder
// refuse to clobber a manually-set stage.
const COURIER_ELIGIBLE_STAGES: OrderStage[] = ['Shipped', 'Out for Delivery', 'RTO Initiated'];

// Called by the Steadfast/Pathao webhook handlers once a raw status has been mapped to an
// OrderStage — looks the order up by the consignment id the courier returned when it was created,
// and if the resolved stage is new and in-bounds, applies it exactly like a manual update would
// (history entry, inventory effect), tagged stageSource: 'courier' so the timeline is honest about
// who made the change.
export async function applyCourierStatusUpdate(tenantId: string, courierConsignmentId: string, rawStatus: string, mappedStage: OrderStage | null) {
  const db = getDb();
  const current = await db.collection('orders').findOne({ courierConsignmentId, tenantId });
  if (!current) {
    logger.warn(`[courier] webhook for unknown consignment ${courierConsignmentId} — ignored`);
    return;
  }

  const now = new Date();
  const setFields: Record<string, unknown> = { courierStatus: rawStatus, courierSyncedAt: now, updatedAt: now };
  let historyEntry: { label: string; detail: string; at: Date } | null = null;

  const canRestage = mappedStage != null && mappedStage !== current.stage && COURIER_ELIGIBLE_STAGES.includes(current.stage);
  if (canRestage) {
    setFields.stage = mappedStage;
    setFields.stageSource = 'courier';
    historyEntry = { label: mappedStage as string, detail: `Synced from courier (${rawStatus})`, at: now };
  }

  const update: Record<string, unknown> = { $set: setFields };
  if (historyEntry) update.$push = { history: historyEntry };

  const result = await db.collection('orders').findOneAndUpdate({ _id: current._id }, update, { returnDocument: 'after' });
  if (!result) return;

  if (result.stage !== current.stage) {
    const fromState = resolveInventoryState(current.stage, current.heldFromStage);
    const toState = resolveInventoryState(result.stage, result.heldFromStage);
    const { cogsDelta, warehouse } = await applyInventoryStageEffect(current.tenantId, current.lineItems, fromState, toState);
    if (cogsDelta !== 0) await db.collection('orders').updateOne({ _id: result._id }, { $inc: { cogsTotal: cogsDelta } });
    await recordFulfillmentWarehouse({ _id: result._id, tenantId: current.tenantId }, fromState, warehouse);
  }
}
