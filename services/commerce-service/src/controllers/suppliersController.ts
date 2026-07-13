import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// The only two reasons a movement can ever carry a reliable supplierId — see
// inventoryController.ts's setInventoryCount/createInboundStock. 'Incoming Stock received' and the
// write-off reasons deliberately don't carry one: inventoryLevels has no supplierId of its own,
// and pendingUnitCost blends whatever's currently pending in that level's `inbound` bucket, so a
// receive/write-off event has no reliable way to know which supplier's shipment it's resolving if
// more than one was ever pending at once. Rather than guess, this feature is scoped to the two
// events that are always correctly attributed at the moment they're logged.
const SUPPLIER_TRANSACTION_REASONS = ['Opening balance', 'Incoming Stock'];

function supplierDto(doc: any) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    phone: doc.phone ?? null,
    email: doc.email ?? null,
    contactPersonName: doc.contactPersonName ?? null,
    designation: doc.designation ?? null,
    billingAddress: doc.billingAddress ?? null,
    paymentType: doc.paymentType ?? 'prepaid',
    note: doc.note ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

// Exposes the full field set a supplier ledger needs — unitPrice/shippingCostTotal/dutiesCostTotal/
// expectedAt/supplierId/supplierName — deliberately kept separate from inventoryController.ts's
// movementDto(), which is scoped to what the Movement Ledger UI shows and doesn't expose these.
function supplierTransactionDto(doc: any) {
  return {
    id: doc._id.toString(),
    reason: doc.reason,
    createdAt: new Date(doc.createdAt).toISOString(),
    createdBy: doc.createdBy ?? null,
    productId: doc.productId ?? null,
    variantId: doc.variantId ?? null,
    sku: doc.sku ?? null,
    productTitle: doc.productTitle ?? null,
    variantLabel: doc.variantLabel ?? null,
    warehouseId: doc.warehouseId ?? null,
    warehouseName: doc.warehouseName ?? null,
    bin: doc.bin ?? null,
    quantity: doc.quantity ?? Math.abs(doc.delta ?? 0),
    unitCost: doc.unitCost ?? null,
    valueDelta: doc.valueDelta ?? null,
    unitPrice: doc.unitPrice ?? null,
    shippingCostTotal: doc.shippingCostTotal ?? null,
    dutiesCostTotal: doc.dutiesCostTotal ?? null,
    expectedAt: doc.expectedAt ? new Date(doc.expectedAt).toISOString() : null,
    note: doc.note ?? null,
  };
}

function shipmentDto(doc: any) {
  const outstanding = Math.max(0, doc.quantityOrdered - doc.quantityReceived - doc.quantityWrittenOff);
  return {
    id: doc._id.toString(),
    createdAt: new Date(doc.createdAt).toISOString(),
    closedAt: doc.closedAt ? new Date(doc.closedAt).toISOString() : null,
    status: doc.status,
    productId: doc.productId ?? null,
    variantId: doc.variantId ?? null,
    sku: doc.sku ?? null,
    productTitle: doc.productTitle ?? null,
    variantLabel: doc.variantLabel ?? null,
    warehouseId: doc.warehouseId ?? null,
    warehouseName: doc.warehouseName ?? null,
    bin: doc.bin ?? null,
    quantityOrdered: doc.quantityOrdered,
    quantityReceived: doc.quantityReceived,
    quantityWrittenOff: doc.quantityWrittenOff,
    outstanding,
    writtenOffByReason: {
      shortShipped: doc.writtenOffByReason?.shortShipped ?? 0,
      lostInTransit: doc.writtenOffByReason?.lostInTransit ?? 0,
      damagedOnArrival: doc.writtenOffByReason?.damagedOnArrival ?? 0,
    },
    unitCost: doc.unitCost ?? null,
    expectedAt: doc.expectedAt ? new Date(doc.expectedAt).toISOString() : null,
  };
}

type Db = ReturnType<typeof getDb>;

async function supplierTotals(db: Db, tenantId: string, supplierIds: string[]) {
  const agg = await db
    .collection('inventoryMovements')
    .aggregate([
      { $match: { tenantId, supplierId: { $in: supplierIds }, reason: { $in: SUPPLIER_TRANSACTION_REASONS } } },
      {
        $group: {
          _id: '$supplierId',
          totalSpend: { $sum: '$valueDelta' },
          totalUnits: { $sum: '$quantity' },
          shipmentCount: { $sum: { $cond: [{ $eq: ['$reason', 'Incoming Stock'] }, 1, 0] } },
          lastTransactionAt: { $max: '$createdAt' },
        },
      },
    ])
    .toArray();
  const byId = new Map(agg.map((a) => [a._id as string, a]));
  return byId;
}

export async function listSupplierOverviews(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const suppliers = await db.collection('suppliers').find({ tenantId }).sort({ name: 1 }).toArray();
  const totals = await supplierTotals(db, tenantId, suppliers.map((s) => s._id.toString()));

  res.json({
    success: true,
    suppliers: suppliers.map((s) => {
      const id = s._id.toString();
      const t = totals.get(id);
      return {
        ...supplierDto(s),
        totalSpend: t?.totalSpend ?? 0,
        totalUnits: t?.totalUnits ?? 0,
        shipmentCount: t?.shipmentCount ?? 0,
        lastTransactionAt: t?.lastTransactionAt ? new Date(t.lastTransactionAt).toISOString() : null,
      };
    }),
  });
}

export async function getSupplier(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid supplier.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const supplier = await db.collection('suppliers').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!supplier) {
    res.status(404).json({ success: false, message: 'Supplier not found.' });
    return;
  }
  res.json({ success: true, supplier: supplierDto(supplier) });
}

const updateSupplierSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional().or(z.literal('')),
  email: z.string().trim().email().optional().or(z.literal('')),
  contactPersonName: z.string().trim().optional().or(z.literal('')),
  designation: z.string().trim().optional().or(z.literal('')),
  billingAddress: z.string().trim().optional().or(z.literal('')),
  paymentType: z.enum(['prepaid', 'credit']).optional(),
  note: z.string().trim().optional().or(z.literal('')),
});

export async function updateSupplier(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid supplier.' });
    return;
  }
  const parsed = updateSupplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Could not read those supplier details.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const input = parsed.data;

  if (input.name) {
    const collision = await db
      .collection('suppliers')
      .findOne({ tenantId, name: input.name, _id: { $ne: new ObjectId(req.params.id) } }, { collation: { locale: 'en', strength: 2 } });
    if (collision) {
      res.status(400).json({ success: false, message: 'Another supplier already has that name.' });
      return;
    }
  }

  const setFields: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) setFields.name = input.name;
  if (input.phone !== undefined) setFields.phone = input.phone || null;
  if (input.email !== undefined) setFields.email = input.email || null;
  if (input.contactPersonName !== undefined) setFields.contactPersonName = input.contactPersonName || null;
  if (input.designation !== undefined) setFields.designation = input.designation || null;
  if (input.billingAddress !== undefined) setFields.billingAddress = input.billingAddress || null;
  if (input.paymentType !== undefined) setFields.paymentType = input.paymentType;
  if (input.note !== undefined) setFields.note = input.note || null;

  const result = await db.collection('suppliers').findOneAndUpdate(
    { _id: new ObjectId(req.params.id), tenantId },
    { $set: setFields },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Supplier not found.' });
    return;
  }
  res.json({ success: true, supplier: supplierDto(result) });
}

// No guard against transactions existing — every movement already stores its own supplierName
// snapshot independent of this document, so deleting it never breaks historical records. The
// frontend fetches the supplier's totals first and shows them in its own confirm dialog, so this
// is an informed choice rather than a silent one.
export async function deleteSupplier(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid supplier.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await db.collection('suppliers').deleteOne({ _id: new ObjectId(req.params.id), tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Supplier not found.' });
    return;
  }
  res.json({ success: true });
}

export async function listSupplierTransactions(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid supplier.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const supplierId = req.params.id;

  const match: Record<string, unknown> = { tenantId, supplierId, reason: { $in: SUPPLIER_TRANSACTION_REASONS } };
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = dateFrom;
    if (dateTo) createdAt.$lte = dateTo;
    match.createdAt = createdAt;
  }
  if (typeof req.query.reason === 'string' && SUPPLIER_TRANSACTION_REASONS.includes(req.query.reason)) {
    match.reason = req.query.reason;
  }
  if (typeof req.query.sku === 'string' && req.query.sku.trim()) {
    match.sku = req.query.sku.trim();
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [rows, total] = await Promise.all([
    db
      .collection('inventoryMovements')
      .find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    db.collection('inventoryMovements').countDocuments(match),
  ]);

  res.json({ success: true, transactions: rows.map(supplierTransactionDto), total, page, pageSize });
}

export async function getSupplierSummary(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid supplier.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const supplierId = req.params.id;
  const now = new Date();
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : now;

  const rangeMatch = { tenantId, supplierId, reason: { $in: SUPPLIER_TRANSACTION_REASONS }, createdAt: { $gte: dateFrom, $lte: dateTo } };

  const [rangeAgg, topProductsAgg] = await Promise.all([
    db
      .collection('inventoryMovements')
      .aggregate([
        { $match: rangeMatch },
        {
          $group: {
            _id: null,
            totalSpend: { $sum: '$valueDelta' },
            totalUnits: { $sum: '$quantity' },
            shipmentCount: { $sum: { $cond: [{ $eq: ['$reason', 'Incoming Stock'] }, 1, 0] } },
            openingBalanceCount: { $sum: { $cond: [{ $eq: ['$reason', 'Opening balance'] }, 1, 0] } },
            lastTransactionAt: { $max: '$createdAt' },
          },
        },
      ])
      .toArray(),
    db
      .collection('inventoryMovements')
      .aggregate([
        { $match: rangeMatch },
        {
          $group: {
            _id: { productId: '$productId', variantId: '$variantId' },
            sku: { $last: '$sku' },
            productTitle: { $last: '$productTitle' },
            variantLabel: { $last: '$variantLabel' },
            spend: { $sum: '$valueDelta' },
            units: { $sum: '$quantity' },
          },
        },
        { $sort: { spend: -1 } },
        { $limit: 8 },
      ])
      .toArray(),
  ]);

  const totals = rangeAgg[0] ?? { totalSpend: 0, totalUnits: 0, shipmentCount: 0, openingBalanceCount: 0, lastTransactionAt: null };
  const avgLandedCost = totals.totalUnits > 0 ? totals.totalSpend / totals.totalUnits : null;

  // Fulfillment breakdown comes from `shipments`, not `inventoryMovements` — receive/write-off
  // movements never carry a supplierId (see the note atop this file), so this is the only place
  // that data exists. Scoped by each shipment's own createdAt (when it was logged/ordered), same
  // as everything else in this range — so this reads as "of what was ordered in this range, how
  // much has been received/written off/is still outstanding as of right now," not "received during
  // this exact window." Pick "All time" as the range to see live outstanding across every shipment.
  const fulfillmentAgg = await db
    .collection('shipments')
    .aggregate([
      { $match: { tenantId, supplierId, createdAt: { $gte: dateFrom, $lte: dateTo } } },
      {
        $group: {
          _id: null,
          totalOrdered: { $sum: '$quantityOrdered' },
          totalReceived: { $sum: '$quantityReceived' },
          shortShippedUnits: { $sum: '$writtenOffByReason.shortShipped' },
          lostInTransitUnits: { $sum: '$writtenOffByReason.lostInTransit' },
          damagedOnArrivalUnits: { $sum: '$writtenOffByReason.damagedOnArrival' },
          outstandingUnits: { $sum: { $max: [0, { $subtract: ['$quantityOrdered', { $add: ['$quantityReceived', '$quantityWrittenOff'] }] }] } },
          outstandingValue: {
            $sum: {
              $multiply: [
                { $max: [0, { $subtract: ['$quantityOrdered', { $add: ['$quantityReceived', '$quantityWrittenOff'] }] }] },
                { $ifNull: ['$unitCost', 0] },
              ],
            },
          },
          shortShippedValue: { $sum: { $multiply: ['$writtenOffByReason.shortShipped', { $ifNull: ['$unitCost', 0] }] } },
          lostInTransitValue: { $sum: { $multiply: ['$writtenOffByReason.lostInTransit', { $ifNull: ['$unitCost', 0] }] } },
          damagedOnArrivalValue: { $sum: { $multiply: ['$writtenOffByReason.damagedOnArrival', { $ifNull: ['$unitCost', 0] }] } },
        },
      },
    ])
    .toArray();
  const fulfillment = fulfillmentAgg[0] ?? {
    totalOrdered: 0,
    totalReceived: 0,
    outstandingUnits: 0,
    outstandingValue: 0,
    shortShippedUnits: 0,
    shortShippedValue: 0,
    lostInTransitUnits: 0,
    lostInTransitValue: 0,
    damagedOnArrivalUnits: 0,
    damagedOnArrivalValue: 0,
  };

  // Trend is always the trailing 12 months, independent of the selected range — same convention
  // as accountingController.ts's getProfitAndLoss trend, so "this month vs the last year" is
  // always visible regardless of what range is currently filtered.
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const trendAgg = await db
    .collection('inventoryMovements')
    .aggregate([
      { $match: { tenantId, supplierId, reason: { $in: SUPPLIER_TRANSACTION_REASONS }, createdAt: { $gte: trendStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          spend: { $sum: '$valueDelta' },
          units: { $sum: '$quantity' },
        },
      },
    ])
    .toArray();

  const trend: { month: string; spend: number; units: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const bucket = trendAgg.find((t) => t._id === key);
    trend.push({ month: key, spend: bucket?.spend ?? 0, units: bucket?.units ?? 0 });
  }

  res.json({
    success: true,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    totalSpend: totals.totalSpend ?? 0,
    totalUnits: totals.totalUnits ?? 0,
    shipmentCount: totals.shipmentCount ?? 0,
    openingBalanceCount: totals.openingBalanceCount ?? 0,
    avgLandedCost,
    lastTransactionAt: totals.lastTransactionAt ? new Date(totals.lastTransactionAt).toISOString() : null,
    totalOrdered: fulfillment.totalOrdered,
    totalReceived: fulfillment.totalReceived,
    outstandingUnits: fulfillment.outstandingUnits,
    outstandingValue: fulfillment.outstandingValue,
    writtenOff: {
      shortShipped: { units: fulfillment.shortShippedUnits, value: fulfillment.shortShippedValue },
      lostInTransit: { units: fulfillment.lostInTransitUnits, value: fulfillment.lostInTransitValue },
      damagedOnArrival: { units: fulfillment.damagedOnArrivalUnits, value: fulfillment.damagedOnArrivalValue },
    },
    trend,
    topProducts: topProductsAgg.map((p) => ({
      productId: p._id.productId ?? null,
      variantId: p._id.variantId ?? null,
      sku: p.sku ?? null,
      productTitle: p.productTitle ?? null,
      variantLabel: p.variantLabel ?? null,
      spend: p.spend,
      units: p.units,
    })),
  });
}

export async function listSupplierShipments(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid supplier.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const supplierId = req.params.id;

  const match: Record<string, unknown> = { tenantId, supplierId };
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = dateFrom;
    if (dateTo) createdAt.$lte = dateTo;
    match.createdAt = createdAt;
  }
  if (req.query.status === 'open' || req.query.status === 'closed') {
    match.status = req.query.status;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [rows, total] = await Promise.all([
    db
      .collection('shipments')
      .find(match)
      .sort({ createdAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    db.collection('shipments').countDocuments(match),
  ]);

  res.json({ success: true, shipments: rows.map(shipmentDto), total, page, pageSize });
}
