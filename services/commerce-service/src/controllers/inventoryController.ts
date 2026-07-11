import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { applyInventoryStageEffect, resolveInventoryState, RESERVED_STAGES } from '../integrations/inventoryEffects.js';
import type { OrderStage } from '@zetsales/shared';

const countSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  warehouseId: z.string().min(1),
  warehouseName: z.string().trim().min(1),
  bin: z.string().trim().min(1),
  quantity: z.number().int().nonnegative(),
  reason: z.enum(['Opening balance', 'Cycle count', 'Manual adjustment', 'Damaged stock', 'Lost', 'Wrong entry', 'Found stock']),
  // Same landed-cost breakdown as an incoming shipment (unit price + shipping + duties) — an
  // Opening balance is still real stock with a real cost, just not framed as "a shipment."
  unitPrice: z.number().nonnegative().optional(),
  shippingCost: z.number().nonnegative().optional(),
  dutiesCost: z.number().nonnegative().optional(),
  // Only meaningful for Opening balance — stock going down (Damaged/Lost/etc.) already has a cost
  // basis and no purchase behind it, so setInventoryCount ignores this outside that one reason.
  supplierId: z.string().trim().optional().or(z.literal('')),
  supplierName: z.string().trim().optional().or(z.literal('')),
  note: z.string().trim().optional().or(z.literal('')),
});

const transferSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  fromWarehouseId: z.string().min(1),
  fromWarehouseName: z.string().trim().min(1),
  fromBin: z.string().trim().min(1),
  toWarehouseId: z.string().min(1),
  toWarehouseName: z.string().trim().min(1),
  toBin: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  note: z.string().trim().optional().or(z.literal('')),
});

const inboundSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  warehouseId: z.string().min(1),
  warehouseName: z.string().trim().min(1),
  bin: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  // The real landed cost is the supplier's unit price plus this shipment's shipping and customs
  // duties, spread across the units in it — not just the invoice price. Split into three fields
  // instead of one flat "cost per unit" so the business can actually see where the money went
  // (and so the server derives the per-unit figure itself rather than trusting client arithmetic).
  unitPrice: z.number().nonnegative().optional(),
  shippingCost: z.number().nonnegative().optional(),
  dutiesCost: z.number().nonnegative().optional(),
  supplierId: z.string().trim().optional().or(z.literal('')),
  supplierName: z.string().trim().optional().or(z.literal('')),
  expectedAt: z.string().trim().optional().or(z.literal('')),
  note: z.string().trim().optional().or(z.literal('')),
});

const supplierSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  leadTimeDays: z.number().int().nonnegative().optional(),
  paymentTerms: z.string().trim().optional().or(z.literal('')),
  // Defaults to 'prepaid' — the common case for this system's actual users (COD sellers typically
  // pay a supplier upfront before a shipment ships), not 'credit' (money owed, unpaid). This is what
  // lets "committed to suppliers" reporting split real liabilities from already-spent cash sitting
  // in transit without asking anyone to classify it per shipment — set once per supplier instead.
  paymentType: z.enum(['prepaid', 'credit']).optional(),
  note: z.string().trim().optional().or(z.literal('')),
});

const reorderPointSchema = z.object({ reorderPoint: z.number().int().nonnegative().nullable() });

function levelDto(doc: any) {
  return {
    id: doc._id.toString(),
    productId: doc.productId ?? null,
    variantId: doc.variantId ?? null,
    sku: doc.sku ?? null,
    productTitle: doc.productTitle ?? null,
    productImage: doc.productImage ?? null,
    variantLabel: doc.variantLabel ?? null,
    warehouseId: doc.warehouseId,
    warehouseName: doc.warehouseName,
    bin: doc.bin,
    onHand: doc.onHand,
    reserved: doc.reserved ?? 0,
    inbound: doc.inbound ?? 0,
    unitCost: doc.unitCost ?? null,
    // Weighted-average landed cost of whatever's still marked `inbound` (not yet received) — kept
    // separate from `unitCost` (the onHand average) so logging a new shipment at a different price
    // never corrupts the valuation of stock you already physically hold.
    pendingUnitCost: doc.pendingUnitCost ?? null,
    reorderPoint: doc.reorderPoint ?? null,
    updatedAt: new Date(doc.updatedAt).toISOString(),
    createdAt: new Date(doc.createdAt ?? doc.updatedAt).toISOString(),
  };
}

function movementDto(doc: any) {
  return {
    id: doc._id.toString(),
    productId: doc.productId ?? null,
    variantId: doc.variantId ?? null,
    sku: doc.sku ?? null,
    productTitle: doc.productTitle ?? null,
    variantLabel: doc.variantLabel ?? null,
    warehouseId: doc.warehouseId,
    warehouseName: doc.warehouseName,
    bin: doc.bin,
    quantityBefore: doc.quantityBefore,
    quantityAfter: doc.quantityAfter,
    delta: doc.delta,
    // The real unit count this event concerns — independent of `delta`, since a few reasons
    // (a short-shipped inbound write-off, a bad post-delivery return) have zero onHand impact but
    // still represent a real number of units. Falls back to |delta| for movements written before
    // this field existed.
    quantity: doc.quantity ?? Math.abs(doc.delta ?? 0),
    unitCost: doc.unitCost ?? null,
    valueDelta: doc.valueDelta ?? null,
    reason: doc.reason,
    note: doc.note ?? null,
    createdBy: doc.createdBy ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

function supplierDto(doc: any) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    leadTimeDays: doc.leadTimeDays ?? null,
    paymentTerms: doc.paymentTerms ?? null,
    paymentType: doc.paymentType ?? 'prepaid',
    note: doc.note ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

function variantLabelOf(variant: any): string {
  return variant.optionValues?.length ? variant.optionValues.join(' / ') : variant.title;
}

// productId+variantId is the source of truth (always unique); this is a best-effort display
// snapshot that goes stale/null if the product/variant is later deleted, not a lookup key.
async function resolveVariantInfo(db: ReturnType<typeof getDb>, tenantId: string, productId: string, variantId: string) {
  if (!ObjectId.isValid(productId)) return null;
  const product = await db.collection('products').findOne({ _id: new ObjectId(productId), tenantId });
  if (!product) return null;
  const variant = (product.variants ?? []).find((v: any) => v.id === variantId);
  if (!variant) return null;
  return {
    productTitle: product.title as string,
    productImage: (product.image ?? null) as string | null,
    variantLabel: variantLabelOf(variant),
    sku: (variant.sku || null) as string | null,
  };
}

export async function listSuppliers(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const suppliers = await db.collection('suppliers').find({ tenantId }).sort({ name: 1 }).toArray();
  res.json({ success: true, suppliers: suppliers.map(supplierDto) });
}

export async function createSupplier(req: AuthenticatedRequest, res: Response) {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Supplier name is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();
  const input = parsed.data;

  const result = await db.collection('suppliers').findOneAndUpdate(
    { tenantId, name: input.name },
    {
      $set: {
        phone: input.phone || null,
        email: input.email || null,
        leadTimeDays: input.leadTimeDays ?? null,
        paymentTerms: input.paymentTerms || null,
        paymentType: input.paymentType || 'prepaid',
        note: input.note || null,
        updatedAt: now,
      },
      $setOnInsert: { tenantId, name: input.name, createdAt: now },
    },
    { upsert: true, returnDocument: 'after', collation: { locale: 'en', strength: 2 } }
  );

  res.json({ success: true, supplier: supplierDto(result!) });
}

// Flat list of every variant in the catalog (a variant without a SKU is still listed — SKU is no
// longer the tracking key, just a display label — labeled "No SKU" for clarity). Backs the variant
// picker in the count/inbound modals and the "needs an opening count" sidebar list.
export async function listInventorySkus(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const match: Record<string, unknown> = { tenantId };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    match.$or = [{ title: re }, { 'variants.sku': re }];
  }

  const products = await db.collection('products').find(match).project({ title: 1, image: 1, variants: 1 }).limit(200).toArray();

  const options: { productId: string; variantId: string; sku: string | null; productTitle: string; productImage: string | null; variantLabel: string }[] = [];
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      options.push({
        productId: product._id.toString(),
        variantId: variant.id,
        sku: variant.sku || null,
        productTitle: product.title,
        productImage: product.image ?? null,
        variantLabel: variantLabelOf(variant),
      });
    }
  }

  res.json({ success: true, options: options.slice(0, 200) });
}

// Bins aren't required anywhere in this system — most small businesses using this don't maintain
// them at all, so this never pretends there's a fixed list to pick from. It suggests bin names
// from two sources: ones a warehouse has been explicitly pre-defined with (see warehousesController
// for businesses that plan their layout ahead of time), and ones that have simply been used before
// in a real count or return (for everyone else, who just typed something once). Either way, typing
// something brand new always still works.
export async function listBins(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId : '';
  if (!warehouseId) {
    res.json({ success: true, bins: [] });
    return;
  }

  const warehouseFilter: Record<string, unknown> = { _id: warehouseId, tenantId };
  const [warehouse, levelBins, orderBins, partialBins] = await Promise.all([
    db.collection('warehouses').findOne(warehouseFilter),
    db.collection('inventoryLevels').distinct('bin', { tenantId, warehouseId }),
    db.collection('orders').distinct('returnLocation.bin', { tenantId, 'returnLocation.warehouseId': warehouseId }),
    db.collection('orders').distinct('partialReturn.returnLocation.bin', { tenantId, 'partialReturn.returnLocation.warehouseId': warehouseId }),
  ]);

  const bins = [...new Set([...(warehouse?.bins ?? []), ...levelBins, ...orderBins, ...partialBins].filter(Boolean))].sort();
  res.json({ success: true, bins });
}

// Sales velocity is computed live from real order history, not stored — matches how this service
// already computes order stats live (getOrderStats) rather than caching. Trailing 30 days, units
// per day. Matched by SKU+variant-label text since order line items only carry those two fields
// (not a stable variant id) — best-effort when a SKU is shared across sibling variants, which is
// common in this catalog; falls back to matching by SKU alone when the variant label doesn't line
// up (e.g. the platform's own line-item title formatting differs slightly from ours).
async function computeVelocityByVariantId(db: ReturnType<typeof getDb>, tenantId: string, levels: any[]): Promise<Record<string, number>> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { tenantId, createdAt: { $gte: thirtyDaysAgo }, stage: { $nin: ['Cancelled', 'Returned'] } } },
      { $unwind: '$lineItems' },
      { $match: { 'lineItems.sku': { $exists: true, $nin: [null, ''] } } },
      { $group: { _id: { sku: '$lineItems.sku', variant: '$lineItems.variant' }, totalQty: { $sum: '$lineItems.quantity' } } },
    ])
    .toArray();

  const levelsBySku = new Map<string, any[]>();
  for (const level of levels) {
    if (!level.sku) continue;
    const list = levelsBySku.get(level.sku) ?? [];
    list.push(level);
    levelsBySku.set(level.sku, list);
  }

  const velocityByVariantId: Record<string, number> = {};
  for (const row of rows) {
    const candidates = levelsBySku.get(row._id.sku) ?? [];
    const match = candidates.find((c) => row._id.variant && c.variantLabel && c.variantLabel.toLowerCase() === String(row._id.variant).toLowerCase()) ?? candidates[0];
    if (!match) continue;
    const unitsPerDay = Math.round((row.totalQty / 30) * 100) / 100;
    velocityByVariantId[match.variantId] = (velocityByVariantId[match.variantId] ?? 0) + unitsPerDay;
  }
  return velocityByVariantId;
}

const STOCK_STATUS = (l: any): 'out' | 'reorder' | 'ok' | 'unset' => {
  const available = (l.onHand ?? 0) - (l.reserved ?? 0);
  if (available <= 0) return 'out';
  if (l.reorderPoint == null) return 'unset';
  return available <= l.reorderPoint ? 'reorder' : 'ok';
};

const DEAD_STOCK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
function isDeadLevel(l: any, unitsPerDay: number | undefined): boolean {
  if ((l.onHand ?? 0) <= 0) return false;
  if (Date.now() - new Date(l.createdAt).getTime() < DEAD_STOCK_WINDOW_MS) return false;
  return !unitsPerDay || unitsPerDay <= 0;
}

function levelLocationKey(l: any): string {
  return `${l.productId}::${l.variantId}::${l.warehouseId}::${l.bin}`;
}

// This page used to fetch and ship every one of a tenant's inventoryLevels documents on every
// load, full detail included (image URLs, cost history, everything) — fine when a tenant had a
// handful of tracked variants, but once every synced product started getting a real inventory
// record (see productsController.ts's ensureVariantsTracked), a real catalog means tens of
// thousands of documents on every single page view. Two things fix that: (1) the "light" pass
// below only ever pulls the handful of fields needed to compute filter-tab counts, the velocity
// map, and cross-tab lookups (Transfer stock's location picker, Stock Shortfalls' location
// cross-reference) — never the heavy display-only fields; (2) the actual table only ever fetches
// full documents for the one page of rows currently being shown, not the whole matching set.
export async function listInventory(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const warehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId.trim() : '';
  const bin = typeof req.query.bin === 'string' ? req.query.bin.trim() : '';
  const focus = typeof req.query.focus === 'string' ? req.query.focus : 'all';
  const sortMode = req.query.sortMode === 'title' ? 'title' : 'onHand';
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  const overdueKeys = new Set(
    typeof req.query.overdueKeys === 'string' && req.query.overdueKeys ? req.query.overdueKeys.split(',').filter(Boolean) : []
  );

  const searchMatch: Record<string, unknown> = { tenantId };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    searchMatch.$or = [{ sku: re }, { productTitle: re }, { variantLabel: re }];
  }

  const [allLevelsLight, movements] = await Promise.all([
    db
      .collection('inventoryLevels')
      .find(searchMatch)
      .project({
        productId: 1, variantId: 1, sku: 1, productTitle: 1, variantLabel: 1,
        warehouseId: 1, warehouseName: 1, bin: 1, onHand: 1, reserved: 1, inbound: 1,
        unitCost: 1, reorderPoint: 1, createdAt: 1, updatedAt: 1,
      })
      .toArray(),
    db.collection('inventoryMovements').find({ tenantId }).sort({ createdAt: -1 }).limit(50).toArray(),
  ]);

  const velocityByVariantId = await computeVelocityByVariantId(db, tenantId, allLevelsLight);

  const counts = { all: 0, reorder: 0, overdue: 0, reserved: 0, dead: 0, inbound: 0 };
  const matchesLocation = (l: any) => (!warehouseId || l.warehouseId === warehouseId) && (!bin || l.bin === bin);
  for (const l of allLevelsLight) {
    if (!matchesLocation(l)) continue;
    counts.all++;
    if (['reorder', 'out'].includes(STOCK_STATUS(l))) counts.reorder++;
    if (overdueKeys.has(levelLocationKey(l))) counts.overdue++;
    if ((l.reserved ?? 0) > 0) counts.reserved++;
    if (isDeadLevel(l, l.variantId ? velocityByVariantId[l.variantId] : undefined)) counts.dead++;
    if ((l.inbound ?? 0) > 0) counts.inbound++;
  }

  const matchesFocus = (l: any) => {
    if (!matchesLocation(l)) return false;
    switch (focus) {
      case 'reorder':
        return ['reorder', 'out'].includes(STOCK_STATUS(l));
      case 'overdue':
        return overdueKeys.has(levelLocationKey(l));
      case 'reserved':
        return (l.reserved ?? 0) > 0;
      case 'dead':
        return isDeadLevel(l, l.variantId ? velocityByVariantId[l.variantId] : undefined);
      case 'inbound':
        return (l.inbound ?? 0) > 0;
      default:
        return true;
    }
  };

  const tableCandidates = allLevelsLight.filter(matchesFocus);
  tableCandidates.sort((a, b) => {
    if (sortMode === 'onHand') return (b.onHand ?? 0) - (a.onHand ?? 0);
    const nameOf = (l: any) => String(l.productTitle ?? l.variantLabel ?? '').toLowerCase();
    return nameOf(a).localeCompare(nameOf(b));
  });
  const total = tableCandidates.length;
  const pageIds = tableCandidates.slice((page - 1) * pageSize, page * pageSize).map((l: any) => l._id);

  const pageLevels = pageIds.length > 0 ? await db.collection('inventoryLevels').find({ _id: { $in: pageIds } }).toArray() : [];
  const orderById = new Map(pageIds.map((id: any, i: number) => [id.toString(), i]));
  pageLevels.sort((a, b) => (orderById.get(a._id.toString()) ?? 0) - (orderById.get(b._id.toString()) ?? 0));

  const summary = allLevelsLight.reduce(
    (acc, l) => {
      if (!matchesLocation(l)) return acc;
      acc.onHand += l.onHand ?? 0;
      acc.inbound += l.inbound ?? 0;
      acc.value += l.unitCost != null ? (l.onHand ?? 0) * l.unitCost : 0;
      return acc;
    },
    { onHand: 0, inbound: 0, value: 0 }
  );

  // A variant stocked at more than one warehouse/bin can't get the automatic cycle-count
  // correction (order line items don't carry a location) — flagging it needs comparing counts
  // across every one of a variant's locations, not just the current page, so it has to be computed
  // from the same full (light) pass everything else here already uses. Returned as just the id
  // list, not full documents — the one piece of "the answer needs the whole catalog" that's
  // actually cheap to ship back.
  const locationCountByVariantId = new Map<string, number>();
  for (const l of allLevelsLight) {
    if (!l.variantId) continue;
    locationCountByVariantId.set(l.variantId, (locationCountByVariantId.get(l.variantId) ?? 0) + 1);
  }
  const multiLocationVariantIds = [...locationCountByVariantId.entries()].filter(([, count]) => count > 1).map(([variantId]) => variantId);

  res.json({
    success: true,
    levels: pageLevels.map(levelDto),
    total,
    page,
    pageSize,
    counts,
    summary,
    multiLocationVariantIds,
    movements: movements.map(movementDto),
    velocityByVariantId,
  });
}

// Open demand (not yet delivered/returned) that cannot be covered by physical on-hand stock. This
// stays in Inventory because the output is a supplier purchase need, even though the source signal
// is orders. Walks Pending/Flagged orders *and* RESERVED_STAGES orders (Confirmed, Processing,
// Shipped, Out for Delivery, RTO Initiated, QC Pending) against raw onHand — not onHand minus
// reserved — because every one of those orders is now enumerated explicitly as a competing claim
// on the same stock; subtracting `reserved` first and then walking these same orders again would
// double-count them. Oldest-first walk means an order that was confirmed against real stock (so
// the ones ahead of it in time already consumed onHand) reads as covered, while a later one
// confirmed with nothing left (oversold, continueSellingWhenOutOfStock allowed the confirm through
// anyway) correctly reads as short even after confirmation, instead of silently disappearing from
// this view once its stage left Pending.
function normalizeComparable(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function matchesVariantLabel(level: any, variant: string | null | undefined) {
  const normalizedVariant = normalizeComparable(variant);
  if (!normalizedVariant) return false;
  return normalizeComparable(level.variantLabel) === normalizedVariant;
}

function shortfallOrderStage(order: any): OrderStage {
  return order.stage === 'On Hold' ? (order.heldFromStage ?? 'Pending') : order.stage;
}

export async function listStockShortfalls(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const orders = await db
    .collection('orders')
    .find({
      tenantId,
      'lineItems.sku': { $exists: true, $nin: [null, ''] },
      $or: [
        { stage: { $in: ['Pending', 'Flagged', ...RESERVED_STAGES] } },
        { stage: 'On Hold', heldFromStage: { $in: ['Pending', 'Flagged', ...RESERVED_STAGES] } },
      ],
    })
    .project({
      number: 1,
      stage: 1,
      heldFromStage: 1,
      customerName: 1,
      customerPhone: 1,
      lineItems: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ createdAt: 1 })
    .toArray();

  // A shortfall can only ever involve a SKU that's actually sitting in one of these open orders —
  // scoping the inventoryLevels lookup to just those SKUs (usually a handful) instead of the whole
  // tenant catalog (which can now be tens of thousands of rows post-sync) is what actually made
  // this endpoint slow; the orders fetch above was already this narrow.
  const openOrderSkus = [...new Set(orders.flatMap((o) => (o.lineItems ?? []).map((li: any) => li.sku).filter(Boolean)))];
  const levels = openOrderSkus.length > 0 ? await db.collection('inventoryLevels').find({ tenantId, sku: { $in: openOrderSkus } }).toArray() : [];

  const levelsBySku = new Map<string, any[]>();
  for (const level of levels) {
    if (!level.sku) continue;
    const list = levelsBySku.get(level.sku) ?? [];
    list.push(level);
    levelsBySku.set(level.sku, list);
  }

  const groups = new Map<string, {
    productId: string | null;
    variantId: string | null;
    sku: string;
    productTitle: string | null;
    productImage: string | null;
    variantLabel: string | null;
    levels: any[];
    orderLines: {
      orderId: string;
      orderNumber: string;
      customerName: string | null;
      customerPhone: string | null;
      stage: OrderStage;
      displayStage: OrderStage;
      quantity: number;
      createdAt: Date;
      updatedAt: Date;
    }[];
  }>();

  for (const order of orders) {
    for (const item of order.lineItems ?? []) {
      if (!item.sku || !item.quantity) continue;
      const candidates = levelsBySku.get(item.sku) ?? [];
      if (candidates.length === 0) continue;

      const variantMatches = candidates.filter((level) => matchesVariantLabel(level, item.variant));
      const pool = variantMatches.length > 0 ? variantMatches : candidates;
      const displayLevel = pool[0];
      const groupKey = variantMatches.length > 0
        ? `${displayLevel.productId ?? item.sku}::${displayLevel.variantId ?? normalizeComparable(item.variant)}`
        : `${item.sku}::${normalizeComparable(item.variant)}`;

      const group = groups.get(groupKey) ?? {
        productId: displayLevel.productId ?? null,
        variantId: displayLevel.variantId ?? null,
        sku: item.sku,
        productTitle: displayLevel.productTitle ?? item.title ?? null,
        productImage: displayLevel.productImage ?? null,
        variantLabel: displayLevel.variantLabel ?? item.variant ?? null,
        levels: pool,
        orderLines: [] as {
          orderId: string;
          orderNumber: string;
          customerName: string | null;
          customerPhone: string | null;
          stage: OrderStage;
          displayStage: OrderStage;
          quantity: number;
          createdAt: Date;
          updatedAt: Date;
        }[],
      };
      group.orderLines.push({
        orderId: order._id.toString(),
        orderNumber: order.number,
        customerName: order.customerName ?? null,
        customerPhone: order.customerPhone ?? null,
        stage: order.stage,
        displayStage: shortfallOrderStage(order),
        quantity: Number(item.quantity) || 0,
        createdAt: new Date(order.createdAt),
        updatedAt: new Date(order.updatedAt ?? order.createdAt),
      });
      groups.set(groupKey, group);
    }
  }

  const rows = [];
  for (const group of groups.values()) {
    const locations = group.levels.map((level) => {
      // Raw onHand, not onHand minus reserved: every reserved-stage order competing for this stock
      // is now walked explicitly below, so `reserved` must not also be subtracted here or those
      // orders' demand would be counted twice.
      const free = Math.max(0, level.onHand ?? 0);
      return {
        // The inventoryLevels document's own id — lets the client act on this exact location (e.g.
        // marking incoming stock received) without needing a separate lookup into some full
        // inventory list it may not even be holding in memory anymore.
        id: level._id.toString(),
        warehouseId: level.warehouseId,
        warehouseName: level.warehouseName,
        bin: level.bin,
        onHand: level.onHand ?? 0,
        reserved: level.reserved ?? 0,
        free,
        inbound: level.inbound ?? 0,
        reorderPoint: level.reorderPoint ?? null,
      };
    });
    const availableNow = locations.reduce((sum, location) => sum + location.free, 0);
    const inbound = locations.reduce((sum, location) => sum + location.inbound, 0);
    const demand = group.orderLines.reduce((sum, line) => sum + line.quantity, 0);

    let remainingFree = availableNow;
    const affectedByOrder = new Map<string, {
      orderId: string;
      orderNumber: string;
      customerName: string | null;
      customerPhone: string | null;
      stage: OrderStage;
      displayStage: OrderStage;
      quantity: number;
      shortQuantity: number;
      createdAt: Date;
      updatedAt: Date;
    }>();

    for (const line of group.orderLines.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      const coveredNow = Math.min(line.quantity, Math.max(0, remainingFree));
      const shortQuantity = line.quantity - coveredNow;
      remainingFree -= coveredNow;
      if (shortQuantity <= 0) continue;

      const existing = affectedByOrder.get(line.orderId);
      if (existing) {
        existing.quantity += line.quantity;
        existing.shortQuantity += shortQuantity;
      } else {
        affectedByOrder.set(line.orderId, { ...line, shortQuantity });
      }
    }

    const shortageNow = [...affectedByOrder.values()].reduce((sum, order) => sum + order.shortQuantity, 0);
    if (shortageNow <= 0) continue;

    const orderNeed = Math.max(0, shortageNow - inbound);
    const ordersList = [...affectedByOrder.values()]
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((order) => ({
        ...order,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      }));

    rows.push({
      productId: group.productId,
      variantId: group.variantId,
      sku: group.sku,
      productTitle: group.productTitle,
      productImage: group.productImage,
      variantLabel: group.variantLabel,
      demand,
      availableNow,
      inbound,
      shortageNow,
      orderNeed,
      orderCount: ordersList.length,
      oldestOrderAt: ordersList[0]?.createdAt ?? null,
      locations,
      orders: ordersList,
    });
  }

  const filteredRows = search
    ? rows.filter((row) => {
        const haystack = `${row.productTitle ?? ''} ${row.variantLabel ?? ''} ${row.sku}`.toLowerCase();
        return haystack.includes(search.toLowerCase());
      })
    : rows;

  filteredRows.sort((a, b) => {
    if (b.orderNeed !== a.orderNeed) return b.orderNeed - a.orderNeed;
    if (b.shortageNow !== a.shortageNow) return b.shortageNow - a.shortageNow;
    return new Date(a.oldestOrderAt ?? 0).getTime() - new Date(b.oldestOrderAt ?? 0).getTime();
  });
  const filteredAffectedOrders = new Set(filteredRows.flatMap((row) => row.orders.map((order) => order.orderId)));

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
  const pagedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  res.json({
    success: true,
    rows: pagedRows,
    total: filteredRows.length,
    page,
    pageSize,
    summary: {
      skuCount: filteredRows.length,
      affectedOrderCount: filteredAffectedOrders.size,
      shortageUnits: filteredRows.reduce((sum, row) => sum + row.shortageNow, 0),
      orderUnits: filteredRows.reduce((sum, row) => sum + row.orderNeed, 0),
      incomingCoverageUnits: filteredRows.reduce((sum, row) => sum + Math.min(row.shortageNow, row.inbound), 0),
    },
  });
}

// The full, filterable movement ledger. Distinct from listInventory's unfiltered "last 50"
// glance, which exists purely to seed the Inventory page's recent-activity sidebar.
export async function listMovements(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const match: Record<string, unknown> = { tenantId };
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = dateFrom;
    if (dateTo) createdAt.$lte = dateTo;
    match.createdAt = createdAt;
  }
  if (typeof req.query.reason === 'string' && req.query.reason.trim()) {
    match.reason = req.query.reason.trim();
  }
  if (typeof req.query.warehouseId === 'string' && req.query.warehouseId.trim()) {
    match.warehouseId = req.query.warehouseId.trim();
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    match.$or = [{ sku: re }, { productTitle: re }];
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [rows, total, reasons] = await Promise.all([
    db.collection('inventoryMovements').find(match).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    db.collection('inventoryMovements').countDocuments(match),
    db.collection('inventoryMovements').distinct('reason', { tenantId }),
  ]);

  res.json({ success: true, movements: rows.map(movementDto), total, page, pageSize, reasons: (reasons as string[]).sort() });
}

export async function updateInventoryLevel(req: AuthenticatedRequest, res: Response) {
  const parsed = reorderPointSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'reorderPoint must be a number or null.' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid inventory level.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await db.collection('inventoryLevels').findOneAndUpdate(
    { _id: new ObjectId(req.params.id), tenantId },
    { $set: { reorderPoint: parsed.data.reorderPoint, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );

  if (!result) {
    res.status(404).json({ success: false, message: 'Inventory level not found.' });
    return;
  }

  res.json({ success: true, level: levelDto(result) });
}

// Resolves a receive/write-off quantity against whichever open shipments exist for this exact
// level, oldest first (FIFO — the standard convention when multiple shipments of the same SKU/
// location are outstanding at once). Purely additive bookkeeping: it never touches onHand,
// unitCost, or the movement records those functions already write — only `shipments` documents,
// so a level with no matching open shipments (anything logged before this existed) is a no-op,
// not an error. `apply` returns the $inc fields for one allocated portion (e.g. quantityReceived,
// or quantityWrittenOff + the specific writtenOffByReason bucket).
async function allocateAgainstOpenShipments(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  level: any,
  quantity: number,
  apply: (allocated: number) => Record<string, number>
) {
  if (quantity <= 0) return;
  const openShipments = await db
    .collection('shipments')
    .find({ tenantId, productId: level.productId ?? null, variantId: level.variantId ?? null, warehouseId: level.warehouseId, bin: level.bin, status: 'open' })
    .sort({ createdAt: 1 })
    .toArray();

  let remaining = quantity;
  for (const shipment of openShipments) {
    if (remaining <= 0) break;
    const outstanding = shipment.quantityOrdered - shipment.quantityReceived - shipment.quantityWrittenOff;
    if (outstanding <= 0) continue;
    const allocated = Math.min(outstanding, remaining);
    const closes = outstanding - allocated <= 0;
    await db.collection('shipments').updateOne(
      { _id: shipment._id },
      closes ? { $inc: apply(allocated), $set: { status: 'closed', closedAt: new Date() } } : { $inc: apply(allocated) }
    );
    remaining -= allocated;
  }
}

const WRITE_OFF_REASON_KEY: Record<string, 'shortShipped' | 'lostInTransit' | 'damagedOnArrival'> = {
  'Short-shipped by supplier': 'shortShipped',
  'Lost in transit': 'lostInTransit',
  'Damaged on arrival': 'damagedOnArrival',
};

const receiveInboundSchema = z.object({ quantity: z.number().int().positive() });

// Closes the loop `createInboundStock` opens: logging an incoming shipment only ever grows the
// `inbound` counter, and until now nothing ever moved it back out — meaning "incoming" stayed
// stuck showing stock as still on the way long after it physically arrived. This is the one action
// that converts it: pending inbound becomes real on-hand stock, clamped so it can't be received
// past what's actually still marked incoming, with a proper movement logged for the audit trail.
export async function receiveInboundStock(req: AuthenticatedRequest, res: Response) {
  const parsed = receiveInboundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A positive quantity is required.' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid inventory level.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const level = await db.collection('inventoryLevels').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!level) {
    res.status(404).json({ success: false, message: 'Inventory level not found.' });
    return;
  }

  const quantity = Math.min(parsed.data.quantity, level.inbound ?? 0);
  if (quantity <= 0) {
    res.status(400).json({ success: false, message: 'Nothing marked as incoming for this item.' });
    return;
  }

  // This is where a batch's landed cost actually joins the onHand average — it was only ever
  // "pending" until now. Unknown-cost receipts (no pendingUnitCost on file) leave the existing
  // average untouched rather than corrupting it with a $0 assumption.
  const pendingUnitCost: number | null = level.pendingUnitCost ?? null;
  const newUnitCost: number | null =
    pendingUnitCost != null
      ? (level.onHand * (level.unitCost ?? pendingUnitCost) + quantity * pendingUnitCost) / (level.onHand + quantity)
      : (level.unitCost ?? null);
  const remainingInbound = (level.inbound ?? 0) - quantity;

  const now = new Date();
  const result = await db.collection('inventoryLevels').findOneAndUpdate(
    { _id: level._id },
    {
      $inc: { inbound: -quantity, onHand: quantity },
      $set: { updatedAt: now, unitCost: newUnitCost, pendingUnitCost: remainingInbound > 0 ? pendingUnitCost : null },
    },
    { returnDocument: 'after' }
  );

  const valueDelta = pendingUnitCost != null ? quantity * pendingUnitCost : null;
  const movement = {
    tenantId,
    productId: level.productId ?? null,
    variantId: level.variantId ?? null,
    sku: level.sku ?? null,
    productTitle: level.productTitle ?? null,
    variantLabel: level.variantLabel ?? null,
    warehouseId: level.warehouseId,
    warehouseName: level.warehouseName,
    bin: level.bin,
    quantityBefore: level.onHand,
    quantityAfter: level.onHand + quantity,
    delta: quantity,
    quantity,
    unitCost: pendingUnitCost,
    valueDelta,
    reason: 'Incoming Stock received',
    note: null,
    createdAt: now,
    createdBy: req.user!.email,
  };
  const movementResult = await db.collection('inventoryMovements').insertOne(movement);

  await allocateAgainstOpenShipments(db, tenantId, level, quantity, (allocated) => ({ quantityReceived: allocated }));

  res.json({ success: true, level: levelDto(result!), movement: movementDto({ ...movement, _id: movementResult.insertedId }) });
}

const writeOffInboundSchema = z.object({ reason: z.enum(['Short-shipped by supplier', 'Lost in transit', 'Damaged on arrival', 'Wrong entry']) });

// The other half of the inbound story `receiveInboundStock` doesn't cover: whatever's still marked
// incoming after a short delivery has no way to ever resolve — Manual adjustment/Cycle count only
// ever touch onHand, never `inbound`, so a permanently-short shipment would sit there showing "N
// incoming" forever with no path to zero. This closes it out honestly, tagged with why, instead of
// leaving a stale number nobody can clear. Zero onHand impact — these units were never actually
// received, so there's nothing to write off from stock, just an expectation to stop waiting on.
export async function writeOffInboundStock(req: AuthenticatedRequest, res: Response) {
  const parsed = writeOffInboundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A reason is required.' });
    return;
  }
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid inventory level.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const level = await db.collection('inventoryLevels').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!level) {
    res.status(404).json({ success: false, message: 'Inventory level not found.' });
    return;
  }

  const quantity = level.inbound ?? 0;
  if (quantity <= 0) {
    res.status(400).json({ success: false, message: 'Nothing marked as incoming for this item.' });
    return;
  }

  const pendingUnitCost: number | null = level.pendingUnitCost ?? null;
  const now = new Date();
  const result = await db.collection('inventoryLevels').findOneAndUpdate(
    { _id: level._id },
    { $set: { inbound: 0, pendingUnitCost: null, updatedAt: now } },
    { returnDocument: 'after' }
  );

  // 'Wrong entry' is not a real loss — it means the original shipment quantity was typed wrong,
  // same distinction the main count screen already makes. It's excluded from genuineLossReasons in
  // getShrinkageReport (by simply never being added to that list), so it never inflates real
  // shrinkage. The note and shipment bookkeeping below reflect that too: instead of recording units
  // as "written off" (a real quantity that never showed up), it corrects `quantityOrdered` itself —
  // the honest fix for a number that was wrong from the moment it was typed.
  const isCorrection = parsed.data.reason === 'Wrong entry';
  const movement = {
    tenantId,
    productId: level.productId ?? null,
    variantId: level.variantId ?? null,
    sku: level.sku ?? null,
    productTitle: level.productTitle ?? null,
    variantLabel: level.variantLabel ?? null,
    warehouseId: level.warehouseId,
    warehouseName: level.warehouseName,
    bin: level.bin,
    quantityBefore: level.onHand,
    quantityAfter: level.onHand,
    delta: 0,
    quantity,
    unitCost: pendingUnitCost,
    valueDelta: pendingUnitCost != null ? -(quantity * pendingUnitCost) : null,
    reason: parsed.data.reason,
    note: isCorrection
      ? `${quantity} incoming unit${quantity === 1 ? '' : 's'} corrected — original shipment entry was a mistake, not a real loss`
      : `${quantity} incoming unit${quantity === 1 ? '' : 's'} written off — never arrived`,
    createdAt: now,
    createdBy: req.user!.email,
  };
  const movementResult = await db.collection('inventoryMovements').insertOne(movement);

  if (isCorrection) {
    await allocateAgainstOpenShipments(db, tenantId, level, quantity, (allocated) => ({ quantityOrdered: -allocated }));
  } else {
    const reasonKey = WRITE_OFF_REASON_KEY[parsed.data.reason];
    await allocateAgainstOpenShipments(db, tenantId, level, quantity, (allocated) => ({
      quantityWrittenOff: allocated,
      [`writtenOffByReason.${reasonKey}`]: allocated,
    }));
  }

  res.json({ success: true, level: levelDto(result!), movement: movementDto({ ...movement, _id: movementResult.insertedId }) });
}

// Moving stock between two of your own locations, as one atomic action — the "Transfer in" reason
// on a plain count only ever touched the destination, leaving the source to be corrected separately
// (with no reason that actually fit) and no link between the two entries in the ledger. This
// decrements the source and credits the destination together, logging both halves with a shared
// transferId so the ledger shows it as one connected move, not two coincidental adjustments.
//
// Not wrapped in a Mongo transaction — matches the risk posture already accepted elsewhere in this
// codebase (no transactions are used anywhere else either); a crash between the two writes could in
// theory leave stock decremented at the source without yet landing at the destination.
export async function transferStock(req: AuthenticatedRequest, res: Response) {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Product, variant, both locations and a positive quantity are required.' });
    return;
  }
  const input = parsed.data;
  if (input.fromWarehouseId === input.toWarehouseId && input.fromBin === input.toBin) {
    res.status(400).json({ success: false, message: 'Source and destination must be different locations.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const variantInfo = await resolveVariantInfo(db, tenantId, input.productId, input.variantId);
  if (!variantInfo) {
    res.status(404).json({ success: false, message: 'That product/variant could not be found — it may have been removed from the catalog.' });
    return;
  }

  const source = await db.collection('inventoryLevels').findOne({
    tenantId, productId: input.productId, variantId: input.variantId, warehouseId: input.fromWarehouseId, bin: input.fromBin,
  });
  if (!source || source.onHand < input.quantity) {
    res.status(400).json({ success: false, message: `Only ${source?.onHand ?? 0} units available at the source location.` });
    return;
  }

  const now = new Date();
  const transferId = new ObjectId().toString();

  const updatedSource = await db.collection('inventoryLevels').findOneAndUpdate(
    { _id: source._id },
    { $inc: { onHand: -input.quantity }, $set: { updatedAt: now } },
    { returnDocument: 'after' }
  );

  const destExisting = await db.collection('inventoryLevels').findOne({
    tenantId, productId: input.productId, variantId: input.variantId, warehouseId: input.toWarehouseId, bin: input.toBin,
  });

  const destSetFields: Record<string, unknown> = {
    tenantId,
    productId: input.productId,
    variantId: input.variantId,
    warehouseId: input.toWarehouseId,
    warehouseName: input.toWarehouseName,
    bin: input.toBin,
    updatedAt: now,
    ...variantInfo,
  };
  const destSetOnInsert: Record<string, unknown> = { reserved: 0, inbound: 0, pendingUnitCost: null, reorderPoint: null, createdAt: now };
  // Same physical stock, same cost basis — copy cost to the destination only if it doesn't already
  // carry one of its own (merging costs of two different-cost lots is a FIFO/weighted-average
  // question this isn't trying to solve).
  if (source.unitCost != null && (!destExisting || destExisting.unitCost == null)) destSetFields.unitCost = source.unitCost;
  else if (!destExisting) destSetOnInsert.unitCost = null;

  const updatedDest = await db.collection('inventoryLevels').findOneAndUpdate(
    { tenantId, productId: input.productId, variantId: input.variantId, warehouseId: input.toWarehouseId, bin: input.toBin },
    { $set: destSetFields, $inc: { onHand: input.quantity }, $setOnInsert: destSetOnInsert },
    { upsert: true, returnDocument: 'after' }
  );

  // unitCost is carried on both sides purely for ledger display (same physical stock moving, so
  // it's worth showing what it's worth) — valueDelta is deliberately null, not computed, since a
  // transfer between your own locations doesn't change total asset value at all.
  const baseMovement = {
    tenantId,
    productId: input.productId,
    variantId: input.variantId,
    sku: variantInfo.sku,
    productTitle: variantInfo.productTitle,
    variantLabel: variantInfo.variantLabel,
    quantity: input.quantity,
    unitCost: source.unitCost ?? null,
    valueDelta: null,
    note: input.note || null,
    transferId,
    createdAt: now,
    createdBy: req.user!.email,
  };
  await db.collection('inventoryMovements').insertMany([
    {
      ...baseMovement,
      warehouseId: input.fromWarehouseId,
      warehouseName: input.fromWarehouseName,
      bin: input.fromBin,
      quantityBefore: source.onHand,
      quantityAfter: source.onHand - input.quantity,
      delta: -input.quantity,
      reason: 'Transfer out',
    },
    {
      ...baseMovement,
      warehouseId: input.toWarehouseId,
      warehouseName: input.toWarehouseName,
      bin: input.toBin,
      quantityBefore: destExisting?.onHand ?? 0,
      quantityAfter: (destExisting?.onHand ?? 0) + input.quantity,
      delta: input.quantity,
      reason: 'Transfer in',
    },
  ]);

  res.json({ success: true, source: levelDto(updatedSource!), destination: levelDto(updatedDest!) });
}

// "Why is this reserved" drill-down — reserved stock is opaque from Inventory's side because the
// reason lives in the orders system, not here. Uses the same sku(+variant-label) matching the
// order-lifecycle inventory effect already relies on (order line items only carry sku and a
// free-text variant title, not a stable variant id) so the orders shown here are consistent with
// what's actually driving the number, not a different, disconnected guess at it.
export async function getLevelReservations(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid inventory level.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const level = await db.collection('inventoryLevels').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!level || !level.sku) {
    res.json({ success: true, orders: [] });
    return;
  }

  const candidates = await db
    .collection('orders')
    .find({ tenantId, 'lineItems.sku': level.sku }, { projection: { number: 1, stage: 1, heldFromStage: 1, customerName: 1, lineItems: 1 } })
    .toArray();

  const orders: { orderId: string; orderNumber: string; stage: string; customerName: string | null; quantity: number }[] = [];
  for (const order of candidates) {
    if (resolveInventoryState(order.stage, order.heldFromStage) !== 'reserved') continue;
    const quantity = (order.lineItems ?? [])
      .filter((li: any) => li.sku === level.sku && (!level.variantLabel || !li.variant || li.variant.toLowerCase() === level.variantLabel.toLowerCase()))
      .reduce((sum: number, li: any) => sum + li.quantity, 0);
    if (quantity <= 0) continue;
    orders.push({ orderId: order._id.toString(), orderNumber: order.number, stage: order.stage, customerName: order.customerName ?? null, quantity });
  }

  res.json({ success: true, orders });
}

// Stages where the physical item has left whatever shelf it's normally kept on — a courier has it
// (Shipped, Out for Delivery), it's on its way back but not arrived (RTO Initiated), or it's arrived
// but is sitting in QC limbo (QC Pending). None of these are "missing," but a naive physical count
// of the ORIGINAL shelf would honestly not find them there — onHand only ever drops at Delivered,
// so it still counts them right up until that point, and a cycle count comparing a real physical
// count against raw onHand would misread every one of these as a loss.
const PHYSICALLY_ABSENT_STAGES: OrderStage[] = ['Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending'];

function effectiveStageFor(stage: OrderStage, heldFromStage: OrderStage | null | undefined): OrderStage {
  return stage === 'On Hold' ? (heldFromStage ?? 'Pending') : stage;
}

// Shared by the display-only preview (getCountContext) AND the actual save (setInventoryCount) —
// they must use identical numbers, or the thing shown on screen and the thing actually persisted
// can silently disagree. This is the one place that decides what counts as "not really missing."
//
// Order line items never carry a warehouse — they only know a SKU, not which physical location
// fulfilled them. That's fine when a variant is only stocked in one place: every in-transit unit of
// that SKU can only have come from there. When the SAME variant is stocked at more than one
// warehouse/bin, there's no persisted record of which location an order's reservation actually drew
// from, so this resolves it the same way applyInventoryStageEffect does at the moment stock is
// actually reserved/consumed: rank this variant's own locations by current onHand and treat
// whichever one currently holds the most stock as the one every ambiguous in-transit unit belongs
// to. That's a best-effort mirror of the real heuristic, not a reconstruction of history — if the
// relative stock between locations has shifted a lot since a given order actually shipped, this can
// still misattribute it. It only ever helps the single highest-stock location; every other location
// for the same variant gets no correction at all, same as before.
async function computeInTransitContext(db: ReturnType<typeof getDb>, tenantId: string, productId: string, variantId: string, sku: string | null, variantLabel: string | null, warehouseId: string, bin: string) {
  let physicallyAbsentQuantity = 0;
  let awaitingQcHereQuantity = 0;
  if (!sku) return { physicallyAbsentQuantity, awaitingQcHereQuantity, isMultiLocation: false };

  const ownLocations = await db.collection('inventoryLevels').find({ tenantId, productId, variantId }).sort({ onHand: -1 }).toArray();
  const isMultiLocation = ownLocations.length > 1;
  // This bin doesn't even carry the variant today (e.g. a brand-new bin) — nothing in transit can
  // resolve here.
  if (!ownLocations.some((l) => l.warehouseId === warehouseId && l.bin === bin)) {
    return { physicallyAbsentQuantity, awaitingQcHereQuantity, isMultiLocation };
  }
  // Sorted descending, so this is exactly the level applyInventoryStageEffect's own `candidates[0]`
  // fallback would pick once a variant-label match doesn't disambiguate any further.
  const topLocation = ownLocations[0];

  const candidates = await db
    .collection('orders')
    .find({ tenantId, 'lineItems.sku': sku }, { projection: { stage: 1, heldFromStage: 1, lineItems: 1, returnLocation: 1 } })
    .toArray();

  for (const order of candidates) {
    const quantity = (order.lineItems ?? [])
      .filter((li: any) => {
        if (li.sku !== sku || !(li.quantity > 0)) return false;
        if (variantLabel && li.variant && li.variant.toLowerCase() !== variantLabel.toLowerCase()) return false;
        // Only one location for this variant — nowhere else it could have come from. More than one —
        // ambiguous, so it's attributed to the current top-stock location only.
        return !isMultiLocation || (topLocation.warehouseId === warehouseId && topLocation.bin === bin);
      })
      .reduce((sum: number, li: any) => sum + li.quantity, 0);
    if (quantity <= 0) continue;

    const matchesThisBin = order.stage === 'QC Pending' && order.returnLocation?.warehouseId === warehouseId && order.returnLocation?.bin === bin;
    if (matchesThisBin) {
      awaitingQcHereQuantity += quantity;
      continue;
    }

    const stage = effectiveStageFor(order.stage, order.heldFromStage);
    if (PHYSICALLY_ABSENT_STAGES.includes(stage)) physicallyAbsentQuantity += quantity;
  }

  return { physicallyAbsentQuantity, awaitingQcHereQuantity, isMultiLocation };
}

// Every location a specific variant is stocked at, with onHand > 0 — backs Transfer stock's "From"
// location picker. A dedicated, tightly-scoped lookup rather than something the client derives
// from a full inventory list it's holding in memory: at real catalog scale that full list either
// doesn't exist client-side anymore or is prohibitively expensive to keep around just for this.
export async function listVariantLocations(req: AuthenticatedRequest, res: Response) {
  const productId = typeof req.query.productId === 'string' ? req.query.productId : '';
  const variantId = typeof req.query.variantId === 'string' ? req.query.variantId : '';
  if (!productId || !variantId) {
    res.status(400).json({ success: false, message: 'productId and variantId are required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const levels = await db.collection('inventoryLevels').find({ tenantId, productId, variantId, onHand: { $gt: 0 } }).sort({ onHand: -1 }).toArray();
  res.json({ success: true, levels: levels.map(levelDto) });
}

// What a cycle count should actually expect to find at a specific SKU + warehouse + bin, right now
// — not the raw onHand, which deliberately includes stock that's technically still "yours" but
// physically elsewhere (out for delivery, mid-RTO, awaiting QC). Units sitting in QC Pending with a
// returnLocation matching THIS exact bin are genuinely, physically here even though they haven't
// been folded back into onHand yet — but onHand was never decremented for them either (QC Pending
// is a reserved, not consumed, stage), so they're already sitting inside the raw onHand number.
// `physicallyAbsentQuantity` skips them on purpose (see the `continue` in computeInTransitContext),
// so onHand minus it already equals "shelf stock + whatever's awaiting QC right here" — adding
// awaitingQcHereQuantity on top of that would double-count the same units.
//
// Display-only — this is what the count screen shows *before* saving. It does not, by itself,
// change what actually gets persisted; see setInventoryCount for the part that does.
export async function getCountContext(req: AuthenticatedRequest, res: Response) {
  const { productId, variantId, warehouseId, bin } = req.query as Record<string, string | undefined>;
  if (!productId || !variantId || !warehouseId || !bin) {
    res.status(400).json({ success: false, message: 'productId, variantId, warehouseId and bin are required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const variantInfo = await resolveVariantInfo(db, tenantId, productId, variantId);
  if (!variantInfo) {
    res.status(404).json({ success: false, message: 'That product/variant could not be found — it may have been removed from the catalog.' });
    return;
  }

  const level = await db.collection('inventoryLevels').findOne({ tenantId, productId, variantId, warehouseId, bin });
  const onHand = level?.onHand ?? 0;
  const { physicallyAbsentQuantity, awaitingQcHereQuantity, isMultiLocation } = await computeInTransitContext(
    db, tenantId, productId, variantId, variantInfo.sku, variantInfo.variantLabel, warehouseId, bin
  );

  const expectedPhysicalCount = Math.max(0, onHand - physicallyAbsentQuantity);
  res.json({ success: true, onHand, physicallyAbsentQuantity, awaitingQcHereQuantity, expectedPhysicalCount, isMultiLocation });
}

export async function setInventoryCount(req: AuthenticatedRequest, res: Response) {
  const parsed = countSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Product, variant, warehouse, bin, quantity and reason are required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const input = parsed.data;
  const now = new Date();

  const variantInfo = await resolveVariantInfo(db, tenantId, input.productId, input.variantId);
  if (!variantInfo) {
    res.status(404).json({ success: false, message: 'That product/variant could not be found — it may have been removed from the catalog.' });
    return;
  }

  const existing = await db.collection('inventoryLevels').findOne({
    tenantId,
    productId: input.productId,
    variantId: input.variantId,
    warehouseId: input.warehouseId,
    bin: input.bin,
  });
  const before = existing?.onHand ?? 0;

  // The actual fix for the "false shrinkage" problem lives HERE, not in the UI. A physical count
  // for Cycle count is the raw number someone saw on the shelf — it does not, and should not, know
  // about units that are legitimately elsewhere (out for delivery, mid-RTO). If we persisted that
  // raw number as-is, two things would go wrong: (1) it would log a fake loss for every unit that's
  // simply out on a delivery run, and (2) onHand would have those units removed early, so when the
  // order is later actually Delivered, applyInventoryStageEffect would try to remove them AGAIN — a
  // silent double-deduction. So the server adds the known in-transit quantity back before deciding
  // what to save, regardless of whether anyone read the on-screen hint.
  //
  // This applies whether or not anything is also awaiting QC at this exact bin — a business that
  // doesn't run a dedicated QC room (returns just go back on the same shelf) will routinely have
  // both at once, and physicallyAbsentQuantity already excludes any QC-pending-here units on its
  // own (see computeInTransitContext), so adding it back never touches what staff saw sitting there.
  // Also applies for a multi-location variant now — computeInTransitContext already attributes
  // ambiguous in-transit units to only the one location it resolves to, so physicallyAbsentQuantity
  // is already correctly 0 here for every location that heuristic didn't pick.
  let persistedQuantity = input.quantity;
  if (input.reason === 'Cycle count' && variantInfo.sku) {
    const { physicallyAbsentQuantity } = await computeInTransitContext(
      db, tenantId, input.productId, input.variantId, variantInfo.sku, variantInfo.variantLabel, input.warehouseId, input.bin
    );
    persistedQuantity = input.quantity + physicallyAbsentQuantity;
  }

  const delta = persistedQuantity - before;

  const enteredUnitCost: number | null =
    input.unitPrice != null ? input.unitPrice + ((input.shippingCost ?? 0) + (input.dutiesCost ?? 0)) / Math.max(1, delta) : null;

  // A count going down (Damaged stock, Lost, a genuine shortfall) is a loss of stock the business
  // already owns and already has a cost basis for — no new cost input is needed or wanted. A count
  // going up (Opening balance, Manual adjustment, a Cycle count that finds more than expected) only
  // updates the average if a cost was actually supplied; blended the same weighted-average way an
  // inbound receipt is, so entering a fresh cost here can't be gamed into skewing existing stock's
  // valuation for free.
  let unitCost: number | null = existing?.unitCost ?? null;
  if (delta > 0 && enteredUnitCost != null) {
    unitCost = before > 0 && unitCost != null ? (before * unitCost + delta * enteredUnitCost) / (before + delta) : enteredUnitCost;
  }
  const valueDelta = unitCost != null ? delta * unitCost : null;

  const setFields: Record<string, unknown> = {
    tenantId,
    productId: input.productId,
    variantId: input.variantId,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    bin: input.bin,
    onHand: persistedQuantity,
    updatedAt: now,
    unitCost,
    ...variantInfo,
  };
  const setOnInsert: Record<string, unknown> = { reserved: 0, inbound: 0, pendingUnitCost: null, reorderPoint: null, createdAt: now };

  const result = await db.collection('inventoryLevels').findOneAndUpdate(
    { tenantId, productId: input.productId, variantId: input.variantId, warehouseId: input.warehouseId, bin: input.bin },
    { $set: setFields, $setOnInsert: setOnInsert },
    { upsert: true, returnDocument: 'after' }
  );

  const movement = {
    tenantId,
    productId: input.productId,
    variantId: input.variantId,
    sku: variantInfo.sku,
    productTitle: variantInfo.productTitle,
    variantLabel: variantInfo.variantLabel,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    bin: input.bin,
    quantityBefore: before,
    quantityAfter: persistedQuantity,
    delta,
    quantity: Math.abs(delta),
    unitCost,
    valueDelta,
    reason: input.reason,
    note: input.note || (input.reason === 'Opening balance' ? input.supplierName : null) || null,
    supplierId: input.reason === 'Opening balance' ? input.supplierId || null : null,
    supplierName: input.reason === 'Opening balance' ? input.supplierName || null : null,
    createdAt: now,
    createdBy: req.user!.email,
  };
  const movementResult = await db.collection('inventoryMovements').insertOne(movement);

  res.json({ success: true, level: levelDto(result!), movement: movementDto({ ...movement, _id: movementResult.insertedId }) });
}

// Shared by the single-item endpoint and the bulk endpoint below — logging several shortfall SKUs
// from one phone call is the same operation repeated per line, not a different one, so this is the
// one place that actually creates a shipment record rather than duplicating the logic twice.
async function performInboundCreate(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  createdBy: string,
  input: z.infer<typeof inboundSchema>
): Promise<{ level: any; movement: any } | { error: string }> {
  const now = new Date();

  const variantInfo = await resolveVariantInfo(db, tenantId, input.productId, input.variantId);
  if (!variantInfo) {
    return { error: 'That product/variant could not be found — it may have been removed from the catalog.' };
  }

  const existing = await db.collection('inventoryLevels').findOne({
    tenantId,
    productId: input.productId,
    variantId: input.variantId,
    warehouseId: input.warehouseId,
    bin: input.bin,
  });
  const beforeInbound = existing?.inbound ?? 0;
  const existingPending: number | null = existing?.pendingUnitCost ?? null;

  // The real cost of a unit isn't just the supplier's invoice price — shipping and customs duties
  // for the whole shipment get spread across every unit in it. Computed server-side (never trust
  // client arithmetic) so the audit trail always shows how a cost figure was actually derived.
  const unitCost: number | null =
    input.unitPrice != null ? input.unitPrice + ((input.shippingCost ?? 0) + (input.dutiesCost ?? 0)) / input.quantity : null;

  // This shipment joins whatever's already sitting in `inbound` as a single pending, not-yet-owned
  // pool — blended by weighted average so two shipments of the same SKU at different prices don't
  // just overwrite each other. If this batch's cost is unknown, the existing pending average is left
  // untouched rather than guessed at.
  let newPendingUnitCost = existingPending;
  if (unitCost != null) {
    newPendingUnitCost =
      beforeInbound > 0 && existingPending != null ? (beforeInbound * existingPending + input.quantity * unitCost) / (beforeInbound + input.quantity) : unitCost;
  }

  const result = await db.collection('inventoryLevels').findOneAndUpdate(
    { tenantId, productId: input.productId, variantId: input.variantId, warehouseId: input.warehouseId, bin: input.bin },
    {
      $set: {
        tenantId,
        productId: input.productId,
        variantId: input.variantId,
        warehouseId: input.warehouseId,
        warehouseName: input.warehouseName,
        bin: input.bin,
        updatedAt: now,
        ...variantInfo,
        pendingUnitCost: newPendingUnitCost,
      },
      $inc: { inbound: input.quantity },
      $setOnInsert: {
        onHand: 0,
        reserved: 0,
        unitCost: null,
        reorderPoint: null,
        createdAt: now,
      },
    },
    { upsert: true, returnDocument: 'after' }
  );

  const movement = {
    tenantId,
    productId: input.productId,
    variantId: input.variantId,
    sku: variantInfo.sku,
    productTitle: variantInfo.productTitle,
    variantLabel: variantInfo.variantLabel,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    bin: input.bin,
    quantityBefore: beforeInbound,
    quantityAfter: beforeInbound + input.quantity,
    delta: input.quantity,
    quantity: input.quantity,
    reason: 'Incoming Stock',
    note: input.note || input.supplierName || null,
    unitCost,
    valueDelta: unitCost != null ? unitCost * input.quantity : null,
    unitPrice: input.unitPrice ?? null,
    shippingCostTotal: input.shippingCost ?? null,
    dutiesCostTotal: input.dutiesCost ?? null,
    supplierId: input.supplierId || null,
    supplierName: input.supplierName || null,
    expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
    createdAt: now,
    createdBy,
  };
  const movementResult = await db.collection('inventoryMovements').insertOne(movement);

  // Purely additive fulfillment-tracking record, separate from the movement/level cost math above
  // (which is untouched) — this is what lets a later receive or write-off attribute back to
  // exactly this shipment's supplier, instead of guessing against a blended pending pool.
  await db.collection('shipments').insertOne({
    tenantId,
    movementId: movementResult.insertedId,
    supplierId: input.supplierId || null,
    supplierName: input.supplierName || null,
    productId: input.productId,
    variantId: input.variantId,
    sku: variantInfo.sku,
    productTitle: variantInfo.productTitle,
    variantLabel: variantInfo.variantLabel,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    bin: input.bin,
    quantityOrdered: input.quantity,
    quantityReceived: 0,
    quantityWrittenOff: 0,
    writtenOffByReason: { shortShipped: 0, lostInTransit: 0, damagedOnArrival: 0 },
    unitCost,
    unitPrice: input.unitPrice ?? null,
    shippingCostTotal: input.shippingCost ?? null,
    dutiesCostTotal: input.dutiesCost ?? null,
    expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
    status: 'open',
    createdAt: now,
    closedAt: null,
  });

  return { level: levelDto(result!), movement: movementDto({ ...movement, _id: movementResult.insertedId }) };
}

export async function createInboundStock(req: AuthenticatedRequest, res: Response) {
  const parsed = inboundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Product, variant, warehouse, bin and inbound quantity are required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const outcome = await performInboundCreate(db, tenantId, req.user!.email, parsed.data);
  if ('error' in outcome) {
    res.status(404).json({ success: false, message: outcome.error });
    return;
  }

  res.json({ success: true, level: outcome.level, movement: outcome.movement });
}

const bulkInboundSchema = z.object({ items: z.array(inboundSchema).min(1).max(100) });

// Logging several shortfall SKUs from the same offline call (one supplier, one conversation) as one
// action instead of repeating the single-item flow N times. Each line is created independently and
// sequentially — matches the no-transaction posture already accepted elsewhere in this file — so one
// bad line (e.g. a product removed from the catalog mid-edit) fails on its own without rolling back
// lines already written; the response reports per-line success so the client can show exactly which
// ones landed.
export async function createInboundStockBulk(req: AuthenticatedRequest, res: Response) {
  const parsed = bulkInboundSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'At least one valid incoming stock line is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const createdBy = req.user!.email;

  const results: { success: boolean; level?: any; movement?: any; error?: string }[] = [];
  for (const item of parsed.data.items) {
    const outcome = await performInboundCreate(db, tenantId, createdBy, item);
    results.push('error' in outcome ? { success: false, error: outcome.error } : { success: true, level: outcome.level, movement: outcome.movement });
  }

  res.json({ success: true, results });
}

// Backs the "remember last supplier/cost" convenience in the Incoming Stock modal — a merchant
// re-ordering a product they've ordered before shouldn't have to retype who they buy it from or
// what it costs every single time. Looks at the movement ledger (not the `shipments` collection)
// since a movement is written for every past inbound regardless of whether its shipment has since
// been received/closed, so this still finds a supplier/price from a shipment that's long since
// arrived. Not scoped to a single warehouse — the same product from the same supplier costs the
// same regardless of which shelf it ends up on.
export async function getLastInboundForVariant(req: AuthenticatedRequest, res: Response) {
  const { productId, variantId } = req.query as Record<string, string | undefined>;
  if (!productId || !variantId) {
    res.status(400).json({ success: false, message: 'productId and variantId are required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const last = await db
    .collection('inventoryMovements')
    .find({ tenantId, productId, variantId, reason: 'Incoming Stock' })
    .sort({ createdAt: -1 })
    .limit(1)
    .next();

  if (!last) {
    res.json({ success: true, found: false });
    return;
  }

  res.json({
    success: true,
    found: true,
    supplierId: last.supplierId ?? null,
    supplierName: last.supplierName ?? null,
    unitPrice: last.unitPrice ?? null,
    shippingCost: last.shippingCostTotal ?? null,
    dutiesCost: last.dutiesCostTotal ?? null,
  });
}

// The read side of the `shipments` ledger createInboundStock writes and receive/write-off allocate
// against — an "open" shipment past its own expected-arrival date, with real quantity still
// unaccounted for. Scoped per-shipment rather than per-level on purpose: a level's pooled `inbound`
// number can't tell two overlapping shipments of the same SKU apart, so it can't answer "which one
// is actually late" once a second shipment has been logged before the first fully cleared — this
// can, because each shipment kept its own expected date and remaining balance from the start.
export async function getOverdueShipments(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();

  const shipments = await db
    .collection('shipments')
    .find({ tenantId, status: 'open', expectedAt: { $ne: null, $lt: now } })
    .sort({ expectedAt: 1 })
    .toArray();

  const overdue = shipments
    .map((s) => {
      const quantityOutstanding = s.quantityOrdered - s.quantityReceived - s.quantityWrittenOff;
      const expectedAt = new Date(s.expectedAt);
      return {
        id: s._id.toString(),
        productId: s.productId ?? null,
        variantId: s.variantId ?? null,
        sku: s.sku ?? null,
        productTitle: s.productTitle ?? null,
        variantLabel: s.variantLabel ?? null,
        warehouseId: s.warehouseId,
        warehouseName: s.warehouseName,
        bin: s.bin,
        supplierId: s.supplierId ?? null,
        supplierName: s.supplierName ?? null,
        quantityOutstanding,
        expectedAt: expectedAt.toISOString(),
        daysOverdue: Math.max(1, Math.floor((now.getTime() - expectedAt.getTime()) / (24 * 60 * 60 * 1000))),
      };
    })
    // Belt-and-suspenders: a shipment should already be 'closed' once fully allocated, but this
    // guards against ever surfacing a stale $0-outstanding row as if it still needed attention.
    .filter((s) => s.quantityOutstanding > 0);

  res.json({ success: true, shipments: overdue });
}

export async function getOpenShipments(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();

  const shipments = await db
    .collection('shipments')
    .find({ tenantId, status: 'open' })
    .sort({ expectedAt: 1, createdAt: 1 })
    .toArray();

  const open = shipments
    .map((s) => {
      const quantityOutstanding = s.quantityOrdered - s.quantityReceived - s.quantityWrittenOff;
      const expectedAt = s.expectedAt ? new Date(s.expectedAt) : null;
      return {
        id: s._id.toString(),
        productId: s.productId ?? null,
        variantId: s.variantId ?? null,
        sku: s.sku ?? null,
        productTitle: s.productTitle ?? null,
        variantLabel: s.variantLabel ?? null,
        warehouseId: s.warehouseId,
        warehouseName: s.warehouseName,
        bin: s.bin,
        supplierId: s.supplierId ?? null,
        supplierName: s.supplierName ?? null,
        quantityOutstanding,
        quantityOrdered: s.quantityOrdered ?? quantityOutstanding,
        quantityReceived: s.quantityReceived ?? 0,
        quantityWrittenOff: s.quantityWrittenOff ?? 0,
        expectedAt: expectedAt ? expectedAt.toISOString() : null,
        daysOverdue: expectedAt && expectedAt < now ? Math.max(1, Math.floor((now.getTime() - expectedAt.getTime()) / (24 * 60 * 60 * 1000))) : null,
        createdAt: new Date(s.createdAt).toISOString(),
      };
    })
    .filter((s) => s.quantityOutstanding > 0);

  res.json({ success: true, shipments: open });
}

// "Find lost items": any downward stock adjustment, regardless of stated reason, represents units
// that left the ledger unexpectedly relative to what was recorded before — that's shrinkage.
// Inbound/order-fulfillment movements never have a negative delta, so they never appear here.
export async function getShrinkageReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;

  // An allow-list, not a deny-list: only reasons that represent a genuine, unplanned loss of stock
  // the business actually owned count as shrinkage. A deny-list here previously let "Order
  // fulfilled" (normal COGS on every sale) and "Transfer out" (cost-neutral, stock just moved bins)
  // get counted as shrinkage, which would make ordinary sales volume look like a theft problem.
  // "Wrong entry" is excluded on purpose — it's a past data-entry mistake being fixed, not a
  // real-world loss.
  const genuineLossReasons = ['Damaged stock', 'Lost', 'Wrong Product', 'Lost in transit', 'Manual adjustment', 'Cycle count'];
  const match: Record<string, unknown> = {
    tenantId,
    $or: [
      { delta: { $lt: 0 }, reason: { $in: genuineLossReasons } },
      // Short-shipped/lost inbound write-offs never touch onHand (delta stays 0 by design — those
      // units never became real stock), so they'd otherwise never appear in a delta-based report at
      // all, even though real money and expected quantity are involved.
      { delta: 0, reason: { $in: ['Short-shipped by supplier', 'Lost in transit', 'Damaged on arrival'] } },
    ],
  };
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = dateFrom;
    if (dateTo) createdAt.$lte = dateTo;
    match.createdAt = createdAt;
  }

  const movements = await db.collection('inventoryMovements').find(match).sort({ createdAt: -1 }).toArray();

  let totalUnitsLost = 0;
  let totalValueLost = 0;
  const byReasonMap = new Map<string, { units: number; value: number }>();
  const byVariantMap = new Map<string, { productTitle: string | null; variantLabel: string | null; units: number; value: number }>();

  // Every movement now carries its own cost snapshot from write time (see movementDto) — no more
  // falling back to the variant's current cost, which was only ever an admitted approximation since
  // cost can change between when a loss happened and when this report is read.
  for (const m of movements) {
    const units = m.quantity ?? Math.abs(m.delta);
    const value = Math.abs(m.valueDelta ?? 0);
    totalUnitsLost += units;
    totalValueLost += value;

    const reasonEntry = byReasonMap.get(m.reason) ?? { units: 0, value: 0 };
    reasonEntry.units += units;
    reasonEntry.value += value;
    byReasonMap.set(m.reason, reasonEntry);

    const variantKey = m.variantId ?? m.sku ?? 'unknown';
    const variantEntry = byVariantMap.get(variantKey) ?? { productTitle: m.productTitle ?? null, variantLabel: m.variantLabel ?? null, units: 0, value: 0 };
    variantEntry.units += units;
    variantEntry.value += value;
    byVariantMap.set(variantKey, variantEntry);
  }

  // "Found stock" is its own explicit reason (not folded into a generic "Manual adjustment" the
  // way an unrelated correction would be), so unlike guessing from direction alone, this is a
  // deliberate, at-the-time signal that a specific gain really is a recovery of past shrinkage —
  // safe to net against the gross loss above instead of just sitting there as an invisible gain the
  // report never mentions. The gross figures above are left completely untouched: the original loss
  // stays on record exactly as it happened, this is purely an additional offset shown alongside it.
  const recoveryMatch: Record<string, unknown> = { tenantId, reason: 'Found stock', delta: { $gt: 0 } };
  if (dateFrom || dateTo) recoveryMatch.createdAt = match.createdAt;
  const recoveryMovements = await db.collection('inventoryMovements').find(recoveryMatch).toArray();
  let recoveredUnits = 0;
  let recoveredValue = 0;
  for (const m of recoveryMovements) {
    recoveredUnits += m.quantity ?? Math.abs(m.delta);
    recoveredValue += Math.abs(m.valueDelta ?? 0);
  }

  res.json({
    success: true,
    totalUnitsLost,
    totalValueLost,
    recoveredUnits,
    recoveredValue,
    netUnitsLost: totalUnitsLost - recoveredUnits,
    netValueLost: totalValueLost - recoveredValue,
    byReason: [...byReasonMap.entries()].map(([reason, v]) => ({ reason, ...v })).sort((a, b) => b.value - a.value),
    byVariant: [...byVariantMap.entries()].map(([variantId, v]) => ({ variantId, ...v })).sort((a, b) => b.value - a.value),
    movements: movements.map(movementDto),
  });
}

// A package IS an order (or, for a Partial Delivered order, the returned slice of one) — a courier
// physically hands back one sealed parcel at a time, not a fungible pile of interchangeable units.
// Earlier this queue grouped by SKU and asked for a quantity, which meant asking staff to predict a
// number that secretly had to line up with hidden order boundaries — impossible to get right when a
// single order held more than one unit, since a courier can't hand back half a parcel. Listing real
// packages and letting staff check off exactly the one in front of them removes that guesswork
// entirely: there's no quantity to type, so there's nothing to get wrong.
interface ReturnsPackageDTO {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  isPartial: boolean;
  lineItems: { sku: string | null; variant: string | null; title: string; image: string | null; quantity: number }[];
  waitingSince: string;
  // A held order's real `stage` becomes 'On Hold' — matching on the raw stage alone would make a
  // package that's mid-return just silently disappear from this queue the moment someone holds it,
  // with nothing to say it still exists or still needs resuming. Surfaced instead of hidden, so
  // whoever's working the queue can see it's paused and why, rather than it just vanishing.
  isHeld: boolean;
  holdReason: string | null;
  // Where this order's stock actually shipped from — the same pickup point a courier's RTO
  // physically returns to. Lets the UI default/pre-select the right warehouse at receipt instead of
  // guessing, and lets a multi-warehouse tenant filter this queue down to their own location.
  fulfillmentWarehouseId: string | null;
  fulfillmentWarehouseName: string | null;
}

function packageLineItems(lineItems: any[]): ReturnsPackageDTO['lineItems'] {
  return (lineItems ?? [])
    .filter((li: any) => li.quantity > 0)
    .map((li: any) => ({ sku: li.sku ?? null, variant: li.variant ?? null, title: li.title, image: li.image ?? null, quantity: li.quantity }));
}

async function listReturnsPackages(db: ReturnType<typeof getDb>, tenantId: string, stage: OrderStage, warehouseId?: string): Promise<ReturnsPackageDTO[]> {
  const warehouseFilter = warehouseId ? { fulfillmentWarehouseId: warehouseId } : {};

  const [fullOrders, partialOrders] = await Promise.all([
    // A held order's stage is literally 'On Hold', not RTO Initiated/QC Pending — heldFromStage is
    // what remembers where it was, so that's what has to be matched against instead when looking
    // for anything currently paused partway through this exact queue.
    db
      .collection('orders')
      .find(
        { tenantId, ...warehouseFilter, $or: [{ stage }, { stage: 'On Hold', heldFromStage: stage }] },
        { projection: { number: 1, customerName: 1, lineItems: 1, updatedAt: 1, stage: 1, holdReason: 1, fulfillmentWarehouseId: 1, fulfillmentWarehouseName: 1 } }
      )
      .toArray(),
    // A partial return's own status lives in partialReturn.status, untouched by the parent order's
    // own stage/hold state — putting the overall order on hold doesn't touch this field, so this
    // query is already immune to the same gap and needs no equivalent fix.
    db
      .collection('orders')
      .find(
        { tenantId, ...warehouseFilter, 'partialReturn.status': stage },
        { projection: { number: 1, customerName: 1, partialReturn: 1, fulfillmentWarehouseId: 1, fulfillmentWarehouseName: 1 } }
      )
      .toArray(),
  ]);

  const packages: ReturnsPackageDTO[] = [
    ...fullOrders.map((o) => ({
      orderId: o._id.toString(),
      orderNumber: o.number,
      customerName: o.customerName ?? null,
      isPartial: false,
      lineItems: packageLineItems(o.lineItems),
      waitingSince: new Date(o.updatedAt).toISOString(),
      isHeld: o.stage === 'On Hold',
      holdReason: o.stage === 'On Hold' ? (o.holdReason ?? null) : null,
      fulfillmentWarehouseId: o.fulfillmentWarehouseId ?? null,
      fulfillmentWarehouseName: o.fulfillmentWarehouseName ?? null,
    })),
    ...partialOrders.map((o) => ({
      orderId: o._id.toString(),
      orderNumber: o.number,
      customerName: o.customerName ?? null,
      isPartial: true,
      lineItems: packageLineItems(o.partialReturn.lineItems),
      waitingSince: new Date(o.partialReturn.updatedAt).toISOString(),
      isHeld: false,
      holdReason: null,
      fulfillmentWarehouseId: o.fulfillmentWarehouseId ?? null,
      fulfillmentWarehouseName: o.fulfillmentWarehouseName ?? null,
    })),
  ];

  return packages.sort((a, b) => new Date(a.waitingSince).getTime() - new Date(b.waitingSince).getTime());
}

export async function getReturnsQueue(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const warehouseId = typeof req.query.warehouseId === 'string' && req.query.warehouseId.trim() ? req.query.warehouseId.trim() : undefined;

  const [awaitingReceipt, awaitingQc] = await Promise.all([
    listReturnsPackages(db, tenantId, 'RTO Initiated', warehouseId),
    listReturnsPackages(db, tenantId, 'QC Pending', warehouseId),
  ]);

  res.json({ success: true, awaitingReceipt, awaitingQc });
}

type ReturnsWorkflow = 'combined' | 'separate';

// Whether receiving and QC are one step or two is a per-tenant preference, not a fixed design —
// most small/medium sellers here have the same person do both in one pass (no reason to force an
// extra click), but a business with a real separate QC department benefits from keeping the two
// stages distinct. Defaults to 'combined' when no doc exists yet, so existing tenants don't need a
// migration to get the simpler behavior.
export async function getInventorySettings(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const doc = await db.collection('inventorySettings').findOne({ tenantId });
  res.json({ success: true, settings: { returnsWorkflow: (doc?.returnsWorkflow as ReturnsWorkflow) ?? 'combined' } });
}

const updateSettingsSchema = z.object({ returnsWorkflow: z.enum(['combined', 'separate']) });

export async function updateInventorySettings(req: AuthenticatedRequest, res: Response) {
  const parsed = updateSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid settings.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  await db
    .collection('inventorySettings')
    .updateOne({ tenantId }, { $set: { returnsWorkflow: parsed.data.returnsWorkflow, updatedAt: new Date() } }, { upsert: true });
  res.json({ success: true, settings: { returnsWorkflow: parsed.data.returnsWorkflow } });
}

const returnsPackageActionSchema = z.object({
  isPartial: z.boolean(),
  location: z.object({ warehouseId: z.string().min(1), warehouseName: z.string().trim().min(1), bin: z.string().trim().min(1) }).optional(),
});

// Moves one whole package (a full order, or the returned slice of a Partial Delivered order)
// forward a step. No quantity matching, no FIFO, no overshoot — the caller already knows exactly
// which package they're holding, so this just moves that one.
async function moveReturnsPackage(
  tenantId: string,
  orderId: string,
  fromStage: OrderStage,
  toStage: OrderStage,
  isPartial: boolean,
  actorEmail: string,
  location?: { warehouseId: string; warehouseName: string; bin: string }
) {
  if (!ObjectId.isValid(orderId)) throw new Error('Invalid order.');
  const db = getDb();
  const order = await db.collection('orders').findOne({ _id: new ObjectId(orderId), tenantId });
  if (!order) throw new Error('Order not found.');

  const now = new Date();

  if (isPartial) {
    if (!order.partialReturn || order.partialReturn.status !== fromStage) throw new Error('This package has already moved — refresh and try again.');
    const fromState = resolveInventoryState(fromStage, null);
    const toState = resolveInventoryState(toStage, null);
    const update: Record<string, unknown> = {
      $set: { 'partialReturn.status': toStage, 'partialReturn.updatedAt': now, 'partialReturn.returnLocation': toStage === 'QC Pending' ? (location ?? null) : null },
      $push: { history: { label: `${toStage} (partial return)`, detail: 'Marked via Inventory returns queue', at: now, by: actorEmail } },
    };
    await db.collection('orders').updateOne({ _id: order._id }, update);
    if (fromState !== toState) {
      const { cogsDelta } = await applyInventoryStageEffect(tenantId, order.partialReturn.lineItems, fromState, toState);
      if (cogsDelta !== 0) await db.collection('orders').updateOne({ _id: order._id }, { $inc: { cogsTotal: cogsDelta } });
    }
  } else {
    if (order.stage !== fromStage) throw new Error('This package has already moved — refresh and try again.');
    const fromState = resolveInventoryState(order.stage, order.heldFromStage);
    const toState = resolveInventoryState(toStage, order.heldFromStage);
    const update: Record<string, unknown> = {
      $set: { stage: toStage, stageSource: 'manual', updatedAt: now, returnLocation: toStage === 'QC Pending' ? (location ?? null) : null },
      $push: { history: { label: toStage, detail: 'Marked via Inventory returns queue', at: now, by: actorEmail } },
    };
    await db.collection('orders').updateOne({ _id: order._id }, update);
    if (fromState !== toState) {
      const { cogsDelta } = await applyInventoryStageEffect(tenantId, order.lineItems, fromState, toState);
      if (cogsDelta !== 0) await db.collection('orders').updateOne({ _id: order._id }, { $inc: { cogsTotal: cogsDelta } });
    }
  }
}

// RTO Initiated -> QC Pending: inventory confirms the courier actually handed this specific parcel back.
export async function receiveReturnPackage(req: AuthenticatedRequest, res: Response) {
  const parsed = returnsPackageActionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid request.' });
    return;
  }
  try {
    await moveReturnsPackage(req.user!.tenantId!, req.params.orderId, 'RTO Initiated', 'QC Pending', parsed.data.isPartial, req.user!.email, parsed.data.location);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

// Writes off a shortfall found during return QC — a unit that either never actually showed up in
// the box, arrived damaged, or turned out to be a different product entirely. Decrements onHand
// directly (this stock was never going back to being sellable) and logs a real movement, so the
// loss is traceable in the Shrinkage report instead of just quietly restocking a smaller number
// than expected. For a Wrong Product mismatch, the note records exactly what showed up instead —
// a flat "Wrong Product" label would be as opaque as dumping everything into "Damaged stock".
async function logReturnShrinkage(
  tenantId: string,
  sku: string | null,
  variant: string | null,
  quantity: number,
  reason: 'Damaged stock' | 'Lost in transit' | 'Wrong Product',
  receivedInstead: { sku: string | null; variant: string; title: string } | null | undefined,
  actorEmail: string
) {
  if (!sku || quantity <= 0) return;
  const db = getDb();
  const candidates = await db.collection('inventoryLevels').find({ tenantId, sku }).sort({ onHand: -1 }).toArray();
  const level = candidates.find((c) => variant && c.variantLabel && c.variantLabel.toLowerCase() === variant.toLowerCase()) ?? candidates[0];
  if (!level) return;

  const now = new Date();
  const newOnHand = Math.max(0, level.onHand - quantity);
  const actualDelta = newOnHand - level.onHand;
  const unitCost: number | null = level.unitCost ?? null;
  await db.collection('inventoryLevels').updateOne({ _id: level._id }, { $set: { onHand: newOnHand, updatedAt: now } });
  const note = receivedInstead
    ? `Found during return QC — customer sent back "${receivedInstead.title}${receivedInstead.variant ? ` — ${receivedInstead.variant}` : ''}" instead`
    : 'Found during return QC';
  await db.collection('inventoryMovements').insertOne({
    tenantId,
    productId: level.productId ?? null,
    variantId: level.variantId ?? null,
    sku,
    productTitle: level.productTitle ?? null,
    variantLabel: level.variantLabel ?? null,
    warehouseId: level.warehouseId,
    warehouseName: level.warehouseName,
    bin: level.bin,
    quantityBefore: level.onHand,
    quantityAfter: newOnHand,
    delta: actualDelta,
    quantity: Math.abs(actualDelta),
    unitCost,
    valueDelta: unitCost != null ? actualDelta * unitCost : null,
    reason,
    note,
    createdBy: actorEmail,
    createdAt: now,
  });
}

const qcResultSchema = z.object({
  sku: z.string().nullable(),
  variant: z.string().nullable(),
  goodQuantity: z.number().int().nonnegative(),
  badReason: z.enum(['Damaged stock', 'Lost in transit', 'Wrong Product']).optional(),
  receivedInstead: z.object({ sku: z.string().nullable(), variant: z.string(), title: z.string() }).nullable().optional(),
});

const confirmQcSchema = z.object({
  isPartial: z.boolean(),
  results: z.array(qcResultSchema).min(1),
});

interface QcResultInput {
  sku: string | null;
  variant: string | null;
  goodQuantity: number;
  badReason?: 'Damaged stock' | 'Lost in transit' | 'Wrong Product';
  receivedInstead?: { sku: string | null; variant: string; title: string } | null;
}

// Shared by both returns workflows: the two-step one (QC Pending -> Returned, separate receiving
// and QC teams) and the combined one (RTO Initiated -> Returned in one go, same team does both).
// The stock math is identical either way — RTO Initiated and QC Pending both resolve to the same
// 'reserved' inventory state, so releasing that hold and writing off any shortfall doesn't care
// which one the package was actually sitting in. `expectedFromStage` only matters for the "has
// this already moved" guard and for reading the right line items off the order.
async function finalizeReturnQc(
  tenantId: string,
  orderId: string,
  expectedFromStage: OrderStage,
  isPartial: boolean,
  results: QcResultInput[],
  historyDetail: string,
  actorEmail: string
) {
  if (!ObjectId.isValid(orderId)) throw new Error('Invalid order.');
  const db = getDb();
  const order = await db.collection('orders').findOne({ _id: new ObjectId(orderId), tenantId });
  if (!order) throw new Error('Order not found.');

  const sourceLineItems: any[] = isPartial ? order.partialReturn?.lineItems ?? [] : order.lineItems ?? [];
  if (isPartial && (!order.partialReturn || order.partialReturn.status !== expectedFromStage)) {
    throw new Error('This package has already moved — refresh and try again.');
  }
  if (!isPartial && order.stage !== expectedFromStage) {
    throw new Error('This package has already moved — refresh and try again.');
  }

  // The full expected quantity's hold ends here regardless of what QC found — a damaged or missing
  // unit isn't "still reserved for this customer" either, it's just gone. Never a 'consumed'
  // transition either side, so this never actually recognizes/reverses COGS — captured anyway for
  // consistency with every other call site.
  const { cogsDelta } = await applyInventoryStageEffect(tenantId, sourceLineItems, 'reserved', 'none');

  for (const li of sourceLineItems) {
    const result = results.find((r) => r.sku === li.sku && r.variant === li.variant);
    const goodQuantity = Math.min(li.quantity, Math.max(0, result?.goodQuantity ?? li.quantity));
    const badQuantity = li.quantity - goodQuantity;
    if (badQuantity > 0) await logReturnShrinkage(tenantId, li.sku, li.variant, badQuantity, result?.badReason ?? 'Damaged stock', result?.receivedInstead, actorEmail);
  }

  const now = new Date();
  if (isPartial) {
    const update: Record<string, unknown> = {
      $set: { 'partialReturn.status': 'Returned', 'partialReturn.updatedAt': now, 'partialReturn.returnLocation': null },
      $push: { history: { label: 'Returned (partial return)', detail: historyDetail, at: now, by: actorEmail } },
    };
    if (cogsDelta !== 0) update.$inc = { cogsTotal: cogsDelta };
    await db.collection('orders').updateOne({ _id: order._id }, update);
  } else {
    const update: Record<string, unknown> = {
      $set: { stage: 'Returned', stageSource: 'manual', updatedAt: now, returnLocation: null },
      $push: { history: { label: 'Returned', detail: historyDetail, at: now, by: actorEmail } },
    };
    if (cogsDelta !== 0) update.$inc = { cogsTotal: cogsDelta };
    await db.collection('orders').updateOne({ _id: order._id }, update);
  }
}

// QC Pending -> Returned: inventory confirms how many of each line item actually came back in
// sellable condition. Only the confirmed-good quantity becomes available again; any shortfall
// (never arrived, or arrived damaged) is written off with a reason instead of silently restocking
// a smaller number and losing track of where the rest went.
export async function confirmReturnPackageQc(req: AuthenticatedRequest, res: Response) {
  const parsed = confirmQcSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A confirmed quantity for each line item is required.' });
    return;
  }
  try {
    await finalizeReturnQc(req.user!.tenantId!, req.params.orderId, 'QC Pending', parsed.data.isPartial, parsed.data.results, 'Marked via Inventory returns queue', req.user!.email);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

const receiveAndConfirmSchema = z.object({
  isPartial: z.boolean(),
  location: z.object({ warehouseId: z.string().min(1), warehouseName: z.string().trim().min(1), bin: z.string().trim().min(1) }).optional(),
  results: z.array(qcResultSchema).min(1),
});

// RTO Initiated -> Returned in one step, for businesses where the same person receives the box
// and inspects it in the same motion — no separate receiving/QC teams to keep in sync, so the
// intermediate QC Pending stopover just adds a click without adding any real control. Skips
// straight past it; the stock effect is identical to the two-step path either way (see
// finalizeReturnQc). Location isn't persisted as returnLocation since that field only means
// anything for a package actually sitting in QC Pending — it's folded into the history note for
// traceability instead.
export async function receiveAndConfirmReturnPackage(req: AuthenticatedRequest, res: Response) {
  const parsed = receiveAndConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A confirmed quantity for each line item is required.' });
    return;
  }
  try {
    const detail = parsed.data.location
      ? `Received and QC'd via Inventory returns queue at ${parsed.data.location.warehouseName} (${parsed.data.location.bin})`
      : "Received and QC'd via Inventory returns queue";
    await finalizeReturnQc(req.user!.tenantId!, req.params.orderId, 'RTO Initiated', parsed.data.isPartial, parsed.data.results, detail, req.user!.email);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

export interface ManualReturnSearchResultDTO {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  deliveredAt: string;
  lineItems: ReturnsPackageDTO['lineItems'];
}

// Only orders manually completed as 'Delivered' can ever reach here — never through a courier's
// RTO status. Real use case: a walk-in/phone/manually-entered sale that was marked delivered on
// the spot, where the customer later brings the item back in person with no courier involved at
// any point, so it never lands in the automatic Returns to process queue. Deliberately excludes
// 'RTO Initiated'/'QC Pending' orders — those already have their own queue; searching for them
// here would just be a second, easier-to-misuse way to do the same thing.
export async function searchDeliveredOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (!query) {
    res.json({ success: true, orders: [] });
    return;
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'i');
  const orders = await db
    .collection('orders')
    .find({ tenantId, stage: 'Delivered', $or: [{ number: re }, { customerName: re }] })
    .project({ number: 1, customerName: 1, lineItems: 1, updatedAt: 1 })
    .limit(10)
    .toArray();

  const results: ManualReturnSearchResultDTO[] = orders.map((o) => ({
    orderId: o._id.toString(),
    orderNumber: o.number,
    customerName: o.customerName ?? null,
    deliveredAt: new Date(o.updatedAt).toISOString(),
    lineItems: packageLineItems(o.lineItems),
  }));
  res.json({ success: true, orders: results });
}

// Restocks a unit returned in good condition after delivery — the mirror image of the deduction
// that happened when it was originally marked Delivered.
async function logDeliveredReturnGood(tenantId: string, sku: string | null, variant: string | null, quantity: number, actorEmail: string) {
  if (!sku || quantity <= 0) return;
  const db = getDb();
  const candidates = await db.collection('inventoryLevels').find({ tenantId, sku }).sort({ onHand: -1 }).toArray();
  const level = candidates.find((c) => variant && c.variantLabel && c.variantLabel.toLowerCase() === variant.toLowerCase()) ?? candidates[0];
  if (!level) return;

  const now = new Date();
  const newOnHand = level.onHand + quantity;
  const unitCost: number | null = level.unitCost ?? null;
  await db.collection('inventoryLevels').updateOne({ _id: level._id }, { $set: { onHand: newOnHand, updatedAt: now } });
  await db.collection('inventoryMovements').insertOne({
    tenantId,
    productId: level.productId ?? null,
    variantId: level.variantId ?? null,
    sku,
    productTitle: level.productTitle ?? null,
    variantLabel: level.variantLabel ?? null,
    warehouseId: level.warehouseId,
    warehouseName: level.warehouseName,
    bin: level.bin,
    quantityBefore: level.onHand,
    quantityAfter: newOnHand,
    delta: quantity,
    quantity,
    unitCost,
    valueDelta: unitCost != null ? quantity * unitCost : null,
    reason: 'Order returned',
    note: 'Customer return after delivery',
    createdBy: actorEmail,
    createdAt: now,
  });
  // Returns the COGS-reversal amount (positive) so the caller can un-recognize it on the order —
  // the sale's original COGS was booked when it was marked Delivered; a good-condition unit coming
  // back and rejoining sellable stock means that cost was never actually realized after all.
  return unitCost != null ? quantity * unitCost : 0;
}

// A unit that comes back damaged after delivery was already deducted from onHand at the time of
// the original sale — it never gets added back, so there's no further onHand change here. This
// just logs a zero-delta movement so the loss still shows up against the right SKU and reason,
// instead of vanishing the moment the return is processed.
async function logDeliveredReturnBad(
  tenantId: string,
  sku: string | null,
  variant: string | null,
  quantity: number,
  reason: 'Damaged stock' | 'Lost in transit' | 'Wrong Product',
  receivedInstead: { sku: string | null; variant: string; title: string } | null | undefined,
  actorEmail: string
) {
  if (!sku || quantity <= 0) return;
  const db = getDb();
  const candidates = await db.collection('inventoryLevels').find({ tenantId, sku }).sort({ onHand: -1 }).toArray();
  const level = candidates.find((c) => variant && c.variantLabel && c.variantLabel.toLowerCase() === variant.toLowerCase()) ?? candidates[0];
  if (!level) return;

  const now = new Date();
  const note = receivedInstead
    ? `Customer return after delivery — sent back "${receivedInstead.title}${receivedInstead.variant ? ` — ${receivedInstead.variant}` : ''}" instead, not restocked`
    : 'Customer return after delivery — arrived unsellable, not restocked';
  // valueDelta is deliberately 0, not the unit's cost — the COGS hit already happened at the
  // original Delivered stage (see applyInventoryStageEffect); this exists purely so the loss is
  // traceable against the right SKU/reason, not to recognize a second asset-value change.
  await db.collection('inventoryMovements').insertOne({
    tenantId,
    productId: level.productId ?? null,
    variantId: level.variantId ?? null,
    sku,
    productTitle: level.productTitle ?? null,
    variantLabel: level.variantLabel ?? null,
    warehouseId: level.warehouseId,
    warehouseName: level.warehouseName,
    bin: level.bin,
    quantityBefore: level.onHand,
    quantityAfter: level.onHand,
    delta: 0,
    quantity,
    unitCost: level.unitCost ?? null,
    valueDelta: 0,
    reason,
    note,
    createdBy: actorEmail,
    createdAt: now,
  });
}

const manualReturnSchema = z.object({ results: z.array(qcResultSchema).min(1) });

// The manual counterpart to Returns to process, for orders that never went through a courier at
// all — a walk-in/phone sale marked Delivered directly, where the customer later returns it in
// person. Scoped to full orders only (not Partial Delivered's already-returned slice, which
// already has its own path) since that's the real case this exists for.
export async function processManualReturn(req: AuthenticatedRequest, res: Response) {
  const parsed = manualReturnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A confirmed quantity for each line item is required.' });
    return;
  }
  if (!ObjectId.isValid(req.params.orderId)) {
    res.status(400).json({ success: false, message: 'Invalid order.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const order = await db.collection('orders').findOne({ _id: new ObjectId(req.params.orderId), tenantId });
  if (!order) {
    res.status(404).json({ success: false, message: 'Order not found.' });
    return;
  }
  if (order.stage !== 'Delivered') {
    res.status(400).json({ success: false, message: 'This order is no longer Delivered — refresh and try again.' });
    return;
  }

  let cogsReversal = 0;
  for (const li of order.lineItems ?? []) {
    const result = parsed.data.results.find((r) => r.sku === li.sku && r.variant === li.variant);
    const goodQuantity = Math.min(li.quantity, Math.max(0, result?.goodQuantity ?? li.quantity));
    const badQuantity = li.quantity - goodQuantity;
    if (goodQuantity > 0) cogsReversal += (await logDeliveredReturnGood(tenantId, li.sku, li.variant, goodQuantity, req.user!.email)) ?? 0;
    if (badQuantity > 0) await logDeliveredReturnBad(tenantId, li.sku, li.variant, badQuantity, result?.badReason ?? 'Damaged stock', result?.receivedInstead, req.user!.email);
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    $set: { stage: 'Returned', stageSource: 'manual', updatedAt: now },
    $push: { history: { label: 'Returned', detail: 'Manually processed via Inventory return search', at: now, by: req.user!.email } },
  };
  // A good-condition unit rejoining sellable stock means the COGS booked when this order was
  // originally marked Delivered was never actually realized — reverse it, same as a courier-path
  // return does via applyInventoryStageEffect's 'consumed' -> 'none' transition.
  if (cogsReversal > 0) update.$inc = { cogsTotal: -cogsReversal };
  await db.collection('orders').updateOne({ _id: order._id }, update);
  res.json({ success: true });
}
