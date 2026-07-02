import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { OrderDTO, OrderRiskDTO, RiskLabel } from '@zetsales/shared';
import { fetchShopifyOrderCount, fetchShopifyOrders } from '../integrations/shopifyClient.js';
import { getValidShopifyAccessToken } from '../integrations/shopifyAuth.js';
import { fetchWooOrders } from '../integrations/wooClient.js';
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
    courierPartner: doc.courierPartner ?? null,
    courierTrackingId: doc.courierTrackingId ?? null,
    deliveryZone: doc.deliveryZone ?? null,
    callAttempts: doc.callAttempts ?? 0,
    history: (doc.history ?? []).map((h: any) => ({ label: h.label, detail: h.detail, at: new Date(h.at).toISOString() })),
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

const SEED_FIELDS = {
  holdReason: null,
  cancelReason: null,
  note: null,
  courierPartner: null,
  courierTrackingId: null,
  deliveryZone: null,
  heldFromStage: null,
  callAttempts: 0,
};

// Once a human has manually set an order's stage (Flag, Hold, Out for Delivery, etc. — concepts
// Shopify/WooCommerce can't tell us about), a later webhook re-sync should not silently clobber
// that judgment call. The one exception is the platform reporting the order as truly cancelled,
// which always wins since that's an objective fact, not a workflow nuance. Every real stage
// transition (synced or manual) is logged to `history` so the drawer can show a real timeline.
export async function upsertShopifyOrder(tenantId: string, storeId: string, order: ShopifyOrderWebhook) {
  const db = getDb();
  const now = new Date();
  const existing = await db.collection('orders').findOne({ tenantId, storeId, externalId: String(order.id) }, { projection: { stageSource: 1, stage: 1 } });

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
  if (canRestage && newStage === 'Pending') {
    autoFlagReason = await computeAutoFlagReason(tenantId, setFields.customerPhone as string | null, setFields.total as number);
    if (autoFlagReason) newStage = 'Flagged';
  }

  const stageChanging = canRestage && newStage !== existing?.stage;
  if (canRestage) {
    setFields.stage = newStage;
    setFields.stageSource = 'synced';
    setFields.flagReason = autoFlagReason;
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
    update.$push = { history: { label: newStage, detail: autoFlagReason || 'Synced from Shopify', at: now } };
  }

  await db.collection('orders').updateOne({ tenantId, storeId, externalId: String(order.id) }, update, { upsert: true });
}

export async function upsertWooOrder(tenantId: string, storeId: string, order: WooOrderWebhook) {
  const db = getDb();
  const now = new Date();
  const existing = await db.collection('orders').findOne({ tenantId, storeId, externalId: String(order.id) }, { projection: { stageSource: 1, stage: 1 } });

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
  if (canRestage && newStage === 'Pending') {
    autoFlagReason = await computeAutoFlagReason(tenantId, setFields.customerPhone as string | null, setFields.total as number);
    if (autoFlagReason) newStage = 'Flagged';
  }

  const stageChanging = canRestage && newStage !== existing?.stage;
  if (canRestage) {
    setFields.stage = newStage;
    setFields.stageSource = 'synced';
    setFields.flagReason = autoFlagReason;
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
    update.$push = { history: { label: newStage, detail: autoFlagReason || 'Synced from WooCommerce', at: now } };
  }

  await db.collection('orders').updateOne({ tenantId, storeId, externalId: String(order.id) }, update, { upsert: true });
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
export const TAB_KEYS = ['all', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'codDue', 'hold', 'cancelled'] as const;
export type TabKey = (typeof TAB_KEYS)[number];

function tabMatch(tab: string | undefined): Record<string, unknown> {
  switch (tab) {
    case 'pending':
      return { stage: { $in: ['Pending', 'Flagged'] } };
    case 'confirmed':
      return { stage: 'Confirmed' };
    case 'processing':
      return { stage: 'Processing' };
    case 'shipped':
      return { stage: { $in: ['Shipped', 'Out for Delivery'] } };
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

type TrendGranularity = 'hour' | 'day' | 'month';
interface TrendWindow {
  from: Date;
  to: Date;
}

// Maps a date-range preset to a (current window, comparison window, granularity) triple — this is
// the "intelligent" part: a single day compares hour-by-hour against the previous day, a run of N
// days compares against the N days immediately before it, a month compares against the same
// elapsed span of the previous month, and a year compares month-by-month against the previous
// year. Both windows always resolve to the same bucket count so the two lines can be overlaid
// position-for-position (hour 0 vs hour 0, day 3 vs day 3, etc) even though the real calendar
// dates differ.
function resolveTrendConfig(
  range: string,
  customFrom?: string,
  customTo?: string
): { granularity: TrendGranularity; bucketCount: number; current: TrendWindow; comparison: TrendWindow } {
  const now = new Date();
  const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const addDays = (d: Date, n: number) => {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
  };
  const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

  const daySpan = (n: number) => {
    const from = addDays(startOfDay(now), -(n - 1));
    return {
      granularity: 'day' as const,
      bucketCount: n,
      current: { from, to: now },
      comparison: { from: addDays(from, -n), to: from },
    };
  };

  switch (range) {
    case 'today': {
      const from = startOfDay(now);
      return { granularity: 'hour', bucketCount: 24, current: { from, to: now }, comparison: { from: addDays(from, -1), to: addDays(now, -1) } };
    }
    case 'yesterday': {
      const to = startOfDay(now);
      const from = addDays(to, -1);
      return { granularity: 'hour', bucketCount: 24, current: { from, to }, comparison: { from: addDays(from, -1), to: addDays(to, -1) } };
    }
    case 'last7':
      return daySpan(7);
    case 'last14':
      return daySpan(14);
    case 'last30':
      return daySpan(30);
    case 'last90':
      return daySpan(90);
    case 'thisMonth': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevFrom = addMonths(from, -1);
      const daysSoFar = Math.floor((startOfDay(now).getTime() - from.getTime()) / 86_400_000) + 1;
      return { granularity: 'day', bucketCount: daysSoFar, current: { from, to: now }, comparison: { from: prevFrom, to: addDays(prevFrom, daysSoFar) } };
    }
    case 'lastMonth': {
      const from = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -1);
      const to = new Date(now.getFullYear(), now.getMonth(), 1);
      const bucketCount = Math.round((to.getTime() - from.getTime()) / 86_400_000);
      const prevFrom = addMonths(from, -1);
      return { granularity: 'day', bucketCount, current: { from, to }, comparison: { from: prevFrom, to: from } };
    }
    case 'thisYear': {
      const from = new Date(now.getFullYear(), 0, 1);
      const prevFrom = new Date(now.getFullYear() - 1, 0, 1);
      const monthsSoFar = now.getMonth() + 1;
      return {
        granularity: 'month',
        bucketCount: monthsSoFar,
        current: { from, to: now },
        comparison: { from: prevFrom, to: new Date(now.getFullYear() - 1, monthsSoFar, 1) },
      };
    }
    case 'custom': {
      const from = customFrom ? new Date(customFrom) : addDays(startOfDay(now), -6);
      const to = customTo ? new Date(customTo) : now;
      const spanMs = Math.max(to.getTime() - from.getTime(), 86_400_000);
      const bucketCount = Math.max(1, Math.ceil(spanMs / 86_400_000));
      return { granularity: 'day', bucketCount, current: { from, to }, comparison: { from: new Date(from.getTime() - spanMs), to: from } };
    }
    default:
      return daySpan(7);
  }
}

function bucketDate(granularity: TrendGranularity, from: Date, index: number): Date {
  if (granularity === 'hour') return new Date(from.getTime() + index * 3_600_000);
  if (granularity === 'day') return new Date(from.getTime() + index * 86_400_000);
  return new Date(from.getFullYear(), from.getMonth() + index, 1);
}

function bucketLabel(granularity: TrendGranularity, from: Date, index: number): string {
  const d = bucketDate(granularity, from, index);
  if (granularity === 'hour') return d.toLocaleTimeString('en-US', { hour: 'numeric' });
  if (granularity === 'day') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function bucketIndexExpr(granularity: TrendGranularity, from: Date): Record<string, unknown> {
  if (granularity === 'hour') return { $floor: { $divide: [{ $subtract: ['$createdAt', from] }, 3_600_000] } };
  if (granularity === 'day') return { $floor: { $divide: [{ $subtract: ['$createdAt', from] }, 86_400_000] } };
  return {
    $add: [
      { $multiply: [{ $subtract: [{ $year: '$createdAt' }, from.getFullYear()] }, 12] },
      { $subtract: [{ $month: '$createdAt' }, from.getMonth() + 1] },
    ],
  };
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
  const { granularity, bucketCount, current, comparison } = resolveTrendConfig(range, customFrom, customTo);

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
  res.json({ success: true, order: toOrderDto(doc), risk });
}

const ORDER_STAGES = [
  'Pending', 'Flagged', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery',
  'Delivered', 'Partial Delivered', 'Returned', 'Cancelled', 'On Hold',
] as const;
const HOLD_REASONS = [
  'Payment verification pending', 'Address needs confirmation', 'Stock check needed',
  'Customer requested reschedule', 'Awaiting customer response', 'Other',
] as const;
const CANCEL_REASONS = [
  'Customer unreachable', 'Customer changed mind', 'Duplicate order', 'Out of stock',
  'Fraud suspected', 'Wrong address', 'Price/payment dispute', 'Other',
] as const;

const updateOrderSchema = z.object({
  stage: z.enum(ORDER_STAGES).optional(),
  resume: z.boolean().optional(),
  holdReason: z.enum(HOLD_REASONS).nullable().optional(),
  cancelReason: z.enum(CANCEL_REASONS).nullable().optional(),
  flagReason: z.string().trim().max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  courierPartner: z.string().trim().max(100).nullable().optional(),
  courierTrackingId: z.string().trim().max(100).nullable().optional(),
  deliveryZone: z.string().trim().max(100).nullable().optional(),
  shippingFee: z.number().nonnegative().optional(),
  incrementCallAttempt: z.boolean().optional(),
});
type UpdateOrderPatch = z.infer<typeof updateOrderSchema>;

// Shared by the single-order PATCH and the bulk endpoint — same manual-stage marking, same
// heldFromStage capture/restore, same history logging, so a bulk action behaves identically to
// doing the same thing one order at a time.
function buildOrderUpdate(current: any, patch: UpdateOrderPatch) {
  const { stage, resume, incrementCallAttempt, ...rest } = patch;
  const now = new Date();
  const setFields: Record<string, unknown> = { ...rest, updatedAt: now };

  let historyEntry: { label: string; detail: string; at: Date } | null = null;
  if (resume) {
    const restored = current.heldFromStage || 'Pending';
    setFields.stage = restored;
    setFields.stageSource = 'manual';
    setFields.heldFromStage = null;
    setFields.holdReason = null;
    historyEntry = { label: restored, detail: 'Resumed from hold', at: now };
  } else if (stage) {
    setFields.stage = stage;
    setFields.stageSource = 'manual';
    if (stage === 'On Hold') setFields.heldFromStage = current.stage;
    historyEntry = { label: stage, detail: rest.note || rest.holdReason || rest.cancelReason || rest.flagReason || 'Updated manually', at: now };
  }

  const update: Record<string, unknown> = { $set: setFields };
  if (historyEntry) update.$push = { history: historyEntry };
  if (incrementCallAttempt) update.$inc = { callAttempts: 1 };
  return update;
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

  const update = buildOrderUpdate(current, parsed.data);
  const result = await db.collection('orders').findOneAndUpdate({ _id: new ObjectId(req.params.id), tenantId }, update, { returnDocument: 'after' });

  if (!result) {
    res.status(404).json({ success: false, message: 'Order not found' });
    return;
  }

  res.json({ success: true, order: toOrderDto(result) });
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
      const update = buildOrderUpdate(current, parsed.data.patch);
      await db.collection('orders').updateOne({ _id: new ObjectId(orderId), tenantId }, update);
      results.push({ orderId, success: true });
    } catch (err) {
      results.push({ orderId, success: false, error: (err as Error).message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  res.json({ success: successCount > 0, results });
}
