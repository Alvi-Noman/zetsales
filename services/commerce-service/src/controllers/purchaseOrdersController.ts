import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { performInboundCreate } from './inventoryController.js';

function poDto(doc: any) {
  return {
    id: doc._id.toString(),
    poNumber: doc.poNumber,
    supplierId: doc.supplierId,
    supplierName: doc.supplierName,
    warehouseId: doc.warehouseId,
    warehouseName: doc.warehouseName,
    status: doc.status,
    lines: (doc.lines ?? []).map((l: any) => ({
      productId: l.productId,
      variantId: l.variantId,
      sku: l.sku ?? null,
      productTitle: l.productTitle,
      variantLabel: l.variantLabel ?? null,
      bin: l.bin ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      shippingCost: l.shippingCost ?? 0,
      dutiesCost: l.dutiesCost ?? 0,
      receivedQuantity: l.receivedQuantity ?? 0,
      writtenOffQuantity: l.writtenOffQuantity ?? 0,
      shipmentId: l.shipmentId ? l.shipmentId.toString() : null,
    })),
    subtotal: doc.subtotal,
    shippingTotal: doc.shippingTotal,
    dutiesTotal: doc.dutiesTotal,
    total: doc.total,
    notes: doc.notes ?? null,
    expectedAt: doc.expectedAt ? new Date(doc.expectedAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
    createdBy: doc.createdBy ?? null,
    sentAt: doc.sentAt ? new Date(doc.sentAt).toISOString() : null,
    cancelledAt: doc.cancelledAt ? new Date(doc.cancelledAt).toISOString() : null,
  };
}

// Same per-tenant atomic counters pattern as manual orders' MO-#### (see nextManualOrderNumber in
// ordersController.ts) — a dedicated `counters` doc so two POs created at once can never collide.
async function nextPoNumber(db: ReturnType<typeof getDb>, tenantId: string): Promise<string> {
  const result = await db
    .collection('counters')
    .findOneAndUpdate({ _id: `${tenantId}:purchaseOrder` } as any, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  const seq = (result as any)?.seq ?? 1;
  return `PO-${String(seq).padStart(4, '0')}`;
}

const poLineSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1),
  sku: z.string().trim().optional().or(z.literal('')).nullable(),
  productTitle: z.string().trim().min(1),
  variantLabel: z.string().trim().optional().or(z.literal('')).nullable(),
  // Optional here — a draft can exist before the seller has decided which bin stock will land in.
  // sendPurchaseOrder requires every line to have one before it can create real inbound stock.
  bin: z.string().trim().optional().or(z.literal('')),
  quantity: z.number().int().positive(),
  // Freeform per line — no catalog cost-price field exists anywhere to default from (see plan).
  unitPrice: z.number().nonnegative(),
  shippingCost: z.number().nonnegative().optional(),
  dutiesCost: z.number().nonnegative().optional(),
});

const createPoSchema = z.object({
  supplierId: z.string().min(1),
  supplierName: z.string().trim().min(1),
  warehouseId: z.string().min(1),
  warehouseName: z.string().trim().min(1),
  lines: z.array(poLineSchema).min(1),
  notes: z.string().trim().optional().or(z.literal('')),
  expectedAt: z.string().trim().optional().or(z.literal('')),
});

function computeTotals(lines: { quantity: number; unitPrice: number; shippingCost?: number; dutiesCost?: number }[]) {
  let subtotal = 0;
  let shippingTotal = 0;
  let dutiesTotal = 0;
  for (const l of lines) {
    subtotal += l.quantity * l.unitPrice;
    shippingTotal += l.shippingCost ?? 0;
    dutiesTotal += l.dutiesCost ?? 0;
  }
  return { subtotal, shippingTotal, dutiesTotal, total: subtotal + shippingTotal + dutiesTotal };
}

function buildLineDocs(lines: z.infer<typeof createPoSchema>['lines']) {
  return lines.map((l) => ({
    productId: l.productId,
    variantId: l.variantId,
    sku: l.sku || null,
    productTitle: l.productTitle,
    variantLabel: l.variantLabel || null,
    bin: l.bin || null,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    shippingCost: l.shippingCost ?? 0,
    dutiesCost: l.dutiesCost ?? 0,
    receivedQuantity: 0,
    writtenOffQuantity: 0,
    shipmentId: null,
  }));
}

export async function listSupplierPurchaseOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const supplierId = req.params.id;

  const match: Record<string, unknown> = { tenantId, supplierId };
  if (typeof req.query.status === 'string' && req.query.status.trim()) {
    match.status = req.query.status;
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [rows, total] = await Promise.all([
    db.collection('purchaseOrders').find(match).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    db.collection('purchaseOrders').countDocuments(match),
  ]);

  res.json({ success: true, purchaseOrders: rows.map(poDto), total, page, pageSize });
}

export async function listPurchaseOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const match: Record<string, unknown> = { tenantId };
  if (typeof req.query.status === 'string' && req.query.status.trim() && req.query.status !== 'all') {
    match.status = req.query.status;
  }

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.$or = [
      { poNumber: { $regex: escaped, $options: 'i' } },
      { supplierName: { $regex: escaped, $options: 'i' } },
      { warehouseName: { $regex: escaped, $options: 'i' } },
    ];
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const [rows, total] = await Promise.all([
    db.collection('purchaseOrders').find(match).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    db.collection('purchaseOrders').countDocuments(match),
  ]);

  res.json({ success: true, purchaseOrders: rows.map(poDto), total, page, pageSize });
}

export async function getPurchaseOrder(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid purchase order.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const po = await db.collection('purchaseOrders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!po) {
    res.status(404).json({ success: false, message: 'Purchase order not found.' });
    return;
  }
  res.json({ success: true, purchaseOrder: poDto(po) });
}

export async function createPurchaseOrder(req: AuthenticatedRequest, res: Response) {
  const parsed = createPoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Supplier, warehouse, and at least one line are required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const input = parsed.data;
  const now = new Date();
  const totals = computeTotals(input.lines);
  const poNumber = await nextPoNumber(db, tenantId);

  const doc = {
    tenantId,
    poNumber,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    status: 'draft',
    lines: buildLineDocs(input.lines),
    ...totals,
    notes: input.notes || null,
    expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
    createdAt: now,
    updatedAt: now,
    createdBy: req.user!.email,
    sentAt: null,
    cancelledAt: null,
  };

  const result = await db.collection('purchaseOrders').insertOne(doc);
  res.json({ success: true, purchaseOrder: poDto({ ...doc, _id: result.insertedId }) });
}

export async function updatePurchaseOrder(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid purchase order.' });
    return;
  }
  const parsed = createPoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Supplier, warehouse, and at least one line are required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const existing = await db.collection('purchaseOrders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!existing) {
    res.status(404).json({ success: false, message: 'Purchase order not found.' });
    return;
  }
  if (existing.status !== 'draft') {
    res.status(400).json({ success: false, message: 'Only a draft purchase order can be edited.' });
    return;
  }

  const input = parsed.data;
  const totals = computeTotals(input.lines);
  const result = await db.collection('purchaseOrders').findOneAndUpdate(
    { _id: existing._id },
    {
      $set: {
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        warehouseId: input.warehouseId,
        warehouseName: input.warehouseName,
        lines: buildLineDocs(input.lines),
        ...totals,
        notes: input.notes || null,
        expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  res.json({ success: true, purchaseOrder: poDto(result!) });
}

// No guard against a sent PO's real inventory history existing elsewhere — a sent/received/
// partially_received PO is blocked from deletion outright below rather than allowed through like
// deleteSupplier does, since a PO's own lines (not just a denormalized name snapshot) are the
// record of what was actually confirmed into inventory.
export async function deletePurchaseOrder(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid purchase order.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const existing = await db.collection('purchaseOrders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!existing) {
    res.status(404).json({ success: false, message: 'Purchase order not found.' });
    return;
  }
  if (existing.status !== 'draft') {
    res.status(400).json({ success: false, message: 'Only a draft purchase order can be deleted — a confirmed one has real inventory history.' });
    return;
  }
  await db.collection('purchaseOrders').deleteOne({ _id: existing._id });
  res.json({ success: true });
}

// The "Confirm & add to Incoming Stock" action — the one point a PO stops being just a document.
// Loops lines through the exact same performInboundCreate() the plain Incoming Stock modal uses
// (see inventoryController.ts), passing this PO's id/line index through so receiving/writing off
// later can find its way back (see applyPurchaseOrderAllocations). All-or-nothing at the PO level:
// if any line fails (e.g. a product removed from the catalog since the draft was made), the PO
// stays in draft — but lines that did succeed before the failure keep their real shipment/inventory
// effects (no transaction wrapping here, matching this codebase's accepted no-transaction posture
// elsewhere), and record their shipmentId, so re-sending after fixing the bad line doesn't
// double-create stock for lines that already went through.
export async function sendPurchaseOrder(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid purchase order.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const po = await db.collection('purchaseOrders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!po) {
    res.status(404).json({ success: false, message: 'Purchase order not found.' });
    return;
  }
  if (po.status !== 'draft') {
    res.status(400).json({ success: false, message: 'Only a draft purchase order can be confirmed.' });
    return;
  }

  const lines = (po.lines ?? []) as any[];
  if (lines.length === 0) {
    res.status(400).json({ success: false, message: 'This purchase order has no lines.' });
    return;
  }
  const pendingLines = lines.map((l, i) => ({ line: l, index: i })).filter(({ line }) => !line.shipmentId);
  if (pendingLines.some(({ line }) => !line.bin)) {
    res.status(400).json({ success: false, message: 'Every line needs a storage bin before this can be confirmed.' });
    return;
  }

  const createdBy = req.user!.email;
  const errors: string[] = [];
  for (const { line, index } of pendingLines) {
    const outcome = await performInboundCreate(db, tenantId, createdBy, {
      productId: line.productId,
      variantId: line.variantId,
      warehouseId: po.warehouseId,
      warehouseName: po.warehouseName,
      bin: line.bin,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      shippingCost: line.shippingCost,
      dutiesCost: line.dutiesCost,
      supplierId: po.supplierId,
      supplierName: po.supplierName,
      expectedAt: po.expectedAt ? new Date(po.expectedAt).toISOString() : undefined,
      note: po.poNumber,
      purchaseOrderId: po._id.toString(),
      purchaseOrderLineIndex: index,
    });
    if ('error' in outcome) {
      errors.push(`${line.productTitle}: ${outcome.error}`);
      continue;
    }
    await db.collection('purchaseOrders').updateOne({ _id: po._id }, { $set: { [`lines.${index}.shipmentId`]: outcome.shipmentId } });
  }

  if (errors.length > 0) {
    res.status(400).json({ success: false, message: `Some lines could not be confirmed: ${errors.join('; ')}` });
    return;
  }

  const result = await db.collection('purchaseOrders').findOneAndUpdate(
    { _id: po._id },
    { $set: { status: 'sent', sentAt: new Date(), updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  res.json({ success: true, purchaseOrder: poDto(result!) });
}

export async function cancelPurchaseOrder(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid purchase order.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const existing = await db.collection('purchaseOrders').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!existing) {
    res.status(404).json({ success: false, message: 'Purchase order not found.' });
    return;
  }
  if (existing.status !== 'draft') {
    res.status(400).json({ success: false, message: 'Only a draft purchase order can be cancelled — once confirmed, write off individual lines from Inventory instead.' });
    return;
  }
  const result = await db.collection('purchaseOrders').findOneAndUpdate(
    { _id: existing._id },
    { $set: { status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  res.json({ success: true, purchaseOrder: poDto(result!) });
}
