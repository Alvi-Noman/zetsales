import { createHash } from 'crypto';
import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import logger from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { normalizePaymentMethod } from '../integrations/orderStatusMapper.js';
import { detectZoneTier } from '../integrations/zoneDetection.js';
import { getOrCreateCsvImportStore } from './storesController.js';

// See docs at C:\Users\ALVI\.claude\plans\wise-wiggling-kay.md for the full design rationale.
//
// Orders already tolerate line items with no productId/variantId link (that's exactly how every
// Shopify/WooCommerce-synced order is stored — see toOrderDto/upsertShopifyOrder in
// ordersController.ts) and SKU-to-product matching only ever happens later, best-effort, at
// fulfillment time. CSV-imported orders reuse that same free-text line item shape, so no new
// product-matching machinery is needed here.

const CSV_FIELD_KEYS = [
  'orderNumber',
  'platformOrderId',
  'orderDate',
  'customerName',
  'customerPhone',
  'customerAltPhone',
  'address',
  'paymentMethod',
  'productTitle',
  'sku',
  'quantity',
  'price',
  'total',
] as const;
type CsvFieldKey = (typeof CSV_FIELD_KEYS)[number];

// Fuzzy header-name guesses so the mapping step starts pre-filled instead of blank — the merchant
// only has to fix what's wrong, not map every column from scratch.
// Deliberately does NOT include a bare 'name' anywhere: Shopify's own order export literally
// names its order-identifier column "Name" (e.g. "#1054") — guessing that as Customer Name would
// silently store order numbers as names. Left unmapped in that case, forcing a manual pick, is
// safer than guessing wrong in either direction. 'Billing Name'/'Shipping Name' (where Shopify's
// real customer name lives) are still recognized for customerName.
const HEADER_SYNONYMS: Record<CsvFieldKey, string[]> = {
  orderNumber: ['order number', 'order no', 'order id', 'orderid', 'order#', 'invoice no', 'invoice'],
  // Deliberately no fuzzy synonyms — this is the platform's true internal order ID (Shopify's
  // "Id" column, matching upsertShopifyOrder's externalId exactly), not something safe to guess
  // from generic header text. Set explicitly by the frontend's platform presets (see
  // ImportOrdersCsvModal.tsx) so a CSV-imported order and a later live sync of the same order
  // land on the identical externalId and correctly dedupe against each other.
  platformOrderId: [],
  orderDate: ['order date', 'date', 'created at', 'created', 'order time', 'timestamp'],
  customerName: ['customer name', 'customer', 'buyer name', 'full name', 'billing name', 'shipping name'],
  customerPhone: ['phone', 'customer phone', 'mobile', 'contact', 'phone number', 'mobile number', 'billing phone', 'shipping phone'],
  customerAltPhone: ['alt phone', 'alternate phone', 'secondary phone', 'phone 2'],
  address: ['address', 'shipping address', 'delivery address', 'customer address', 'billing address1', 'shipping address1'],
  paymentMethod: ['payment method', 'payment', 'payment type'],
  productTitle: ['product', 'product name', 'product title', 'item', 'item name', 'lineitem name'],
  sku: ['sku', 'product code', 'product sku', 'lineitem sku'],
  quantity: ['quantity', 'qty', 'units', 'lineitem quantity'],
  price: ['price', 'unit price', 'item price', 'rate', 'lineitem price'],
  total: ['total', 'order total', 'grand total', 'amount'],
};

const DATE_FORMATS = ['auto', 'DMY', 'MDY', 'YMD'] as const;
type DateFormat = (typeof DATE_FORMATS)[number];

// Permissive on keys/values here (the frontend may omit unmapped fields entirely, or send them as
// null) — narrowed into a clean Partial<Record<CsvFieldKey, number>> by toFieldMapping below.
const mappingSchema = z.record(z.string(), z.number().int().min(0).nullable());

const deriveRequestSchema = z.object({
  importId: z.string().min(1),
  mapping: mappingSchema,
  dateFormat: z.enum(DATE_FORMATS).default('auto'),
  targetStoreId: z.string().min(1), // an ObjectId string, or the literal 'csv-generic'
});

function toFieldMapping(raw: Record<string, number | null>): Partial<Record<CsvFieldKey, number>> {
  const mapping: Partial<Record<CsvFieldKey, number>> = {};
  for (const key of CSV_FIELD_KEYS) {
    const value = raw[key];
    if (typeof value === 'number') mapping[key] = value;
  }
  return mapping;
}

function normalizeHeader(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function guessMapping(headers: string[]): Partial<Record<CsvFieldKey, number>> {
  const normalized = headers.map(normalizeHeader);
  const guess: Partial<Record<CsvFieldKey, number>> = {};
  for (const field of CSV_FIELD_KEYS) {
    const synonyms = HEADER_SYNONYMS[field];
    const idx = normalized.findIndex((h) => synonyms.includes(h));
    if (idx !== -1) guess[field] = idx;
  }
  return guess;
}

// Parses a CSV cell into a Date, respecting an explicit day/month order when given (the classic
// 03/04 ambiguity) — 'auto' falls back to DD/MM since this app is Bangladesh-focused, then tries
// ISO/whatever Date() itself can make sense of.
function parseOrderDate(raw: string, format: DateFormat): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const slashOrDash = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (slashOrDash && format !== 'YMD') {
    const [, a, b, yRaw, hh, mm, ss] = slashOrDash;
    const [day, month] = format === 'MDY' ? [b, a] : [a, b];
    const year = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    const d = new Date(Number(year), Number(month) - 1, Number(day), Number(hh || 0), Number(mm || 0), Number(ss || 0));
    if (!Number.isNaN(d.getTime())) return d;
  }

  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoLike) {
    const [, y, m, d, hh, mm, ss] = isoLike;
    const dt = new Date(Number(y), Number(m) - 1, Number(d), Number(hh || 0), Number(mm || 0), Number(ss || 0));
    if (!Number.isNaN(dt.getTime())) return dt;
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.\-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function cell(row: string[], mapping: Partial<Record<CsvFieldKey, number>>, field: CsvFieldKey): string {
  const idx = mapping[field];
  if (idx === undefined || idx === null) return '';
  return (row[idx] ?? '').trim();
}

// A phone+date+total hash used only when the file has no order-number column to key on — stable
// across re-uploads of the same file, but weaker than a real order number (two genuinely different
// orders for the same customer, same day, same total would collide). Flagged to the user in the
// preview response via `weakDedupeKey`.
function fallbackExternalId(phone: string, dateIso: string, total: number): string {
  return createHash('sha1').update(`${phone}|${dateIso}|${total}`).digest('hex').slice(0, 24);
}

interface DerivedLineItem {
  title: string;
  sku: string | null;
  quantity: number;
  price: number;
}

interface DerivedOrder {
  groupKey: string;
  externalId: string;
  weakDedupeKey: boolean;
  rowNumbers: number[];
  customerName: string;
  customerPhone: string | null;
  customerAltPhone: string | null;
  address: string | null;
  paymentMethod: string;
  orderDate: Date | null;
  lineItems: DerivedLineItem[];
  total: number;
  invalidReason: string | null;
}

// Groups CSV rows into orders: rows sharing a non-blank mapped Order Number become one order with
// multiple line items (one per row); everything else is one row = one order = one line item. This
// is what makes multi-item orders work without requiring wide repeated-column CSVs.
function deriveOrders(headers: string[], rows: string[][], mapping: Partial<Record<CsvFieldKey, number>>, dateFormat: DateFormat): DerivedOrder[] {
  const groups = new Map<string, { rows: { row: string[]; rowNumber: number }[]; synthetic: boolean }>();
  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for 0-index, +1 for the header row
    const orderNumberRaw = cell(row, mapping, 'orderNumber');
    const key = orderNumberRaw ? `on:${orderNumberRaw}` : `row:${i}`;
    const existing = groups.get(key);
    if (existing) existing.rows.push({ row, rowNumber });
    else groups.set(key, { rows: [{ row, rowNumber }], synthetic: !orderNumberRaw });
  });

  const orders: DerivedOrder[] = [];
  for (const [groupKey, group] of groups) {
    const firstNonEmpty = (field: CsvFieldKey): string => {
      for (const { row } of group.rows) {
        const v = cell(row, mapping, field);
        if (v) return v;
      }
      return '';
    };

    const customerName = firstNonEmpty('customerName') || 'Unknown Customer';
    const customerPhoneRaw = firstNonEmpty('customerPhone');
    const customerAltPhone = firstNonEmpty('customerAltPhone') || null;
    const address = firstNonEmpty('address') || null;
    const paymentMethodRaw = firstNonEmpty('paymentMethod');
    const paymentMethod = paymentMethodRaw ? normalizePaymentMethod(paymentMethodRaw) : 'Cash on Delivery';
    const dateRaw = firstNonEmpty('orderDate');
    const orderDate = dateRaw ? parseOrderDate(dateRaw, dateFormat) : new Date();

    const lineItems: DerivedLineItem[] = group.rows.map(({ row }) => {
      const title = cell(row, mapping, 'productTitle') || 'Imported item';
      const sku = cell(row, mapping, 'sku') || null;
      const quantity = Math.max(1, Math.round(parseNumber(cell(row, mapping, 'quantity')) ?? 1));
      const price = parseNumber(cell(row, mapping, 'price')) ?? 0;
      return { title, sku, quantity, price };
    });

    const totalRaw = firstNonEmpty('total');
    const computedSubtotal = lineItems.reduce((s, li) => s + li.price * li.quantity, 0);
    const total = totalRaw ? parseNumber(totalRaw) ?? computedSubtotal : computedSubtotal;

    let invalidReason: string | null = null;
    if (!customerPhoneRaw) invalidReason = 'Missing customer phone';
    else if (dateRaw && !orderDate) invalidReason = 'Could not parse order date';
    else if (total <= 0) invalidReason = 'Missing price/total (order total is 0)';

    // The platform's own internal order ID, when known (e.g. Shopify's "Id" column), is the
    // strongest possible key: it's exactly what a live sync of the same store would also use as
    // externalId (see upsertShopifyOrder's `externalId: String(order.id)`), so a CSV backfill and
    // a later live connection of the same store correctly recognize the same real order instead
    // of creating a second copy. Falls back to the Order Number-derived key, then the weak hash.
    const platformOrderId = firstNonEmpty('platformOrderId');
    const weakDedupeKey = !platformOrderId && group.synthetic;
    const externalId = platformOrderId
      ? platformOrderId
      : !group.synthetic
        ? `csv:${groupKey.slice(3)}`
        : `csv:${fallbackExternalId(customerPhoneRaw, (orderDate ?? new Date(0)).toISOString(), total)}`;

    orders.push({
      groupKey,
      externalId,
      weakDedupeKey,
      rowNumbers: group.rows.map((r) => r.rowNumber),
      customerName,
      customerPhone: customerPhoneRaw || null,
      customerAltPhone,
      address,
      paymentMethod,
      orderDate,
      lineItems,
      total,
      invalidReason,
    });
  }
  return orders;
}

async function loadDraft(tenantId: string, importId: string) {
  if (!ObjectId.isValid(importId)) return null;
  const db = getDb();
  return db.collection('csvImportDrafts').findOne({ _id: new ObjectId(importId), tenantId });
}

async function resolveTargetStore(tenantId: string, targetStoreId: string) {
  const db = getDb();
  if (targetStoreId === 'csv-generic') return getOrCreateCsvImportStore(tenantId);
  if (!ObjectId.isValid(targetStoreId)) return null;
  return db.collection('stores').findOne({ _id: new ObjectId(targetStoreId), tenantId });
}

// Step 1: upload + parse. Stores the parsed rows so later steps don't need the file re-uploaded.
export async function parseCsvOrderImport(req: AuthenticatedRequest, res: Response) {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ success: false, message: 'A CSV file is required.' });
    return;
  }

  let records: string[][];
  try {
    records = parse(file.buffer, { skip_empty_lines: true, relax_column_count: true }) as string[][];
  } catch (err) {
    res.status(400).json({ success: false, message: `Could not read this file as CSV: ${(err as Error).message}` });
    return;
  }
  if (records.length < 2) {
    res.status(400).json({ success: false, message: 'The file needs a header row plus at least one order row.' });
    return;
  }

  const [headers, ...rows] = records;
  const tenantId = req.user!.tenantId!;
  const db = getDb();
  const { insertedId } = await db.collection('csvImportDrafts').insertOne({
    tenantId,
    headers,
    rows,
    createdAt: new Date(),
  });

  res.json({
    success: true,
    importId: insertedId.toString(),
    headers,
    sampleRows: rows.slice(0, 5),
    totalRows: rows.length,
    suggestedMapping: guessMapping(headers),
  });
}

// Step 2: preview — safe to call repeatedly as the user adjusts the column mapping.
export async function previewCsvOrderImport(req: AuthenticatedRequest, res: Response) {
  const parsed = deriveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid import mapping.' });
    return;
  }
  const { importId, dateFormat, targetStoreId } = parsed.data;
  const mapping = toFieldMapping(parsed.data.mapping);
  const tenantId = req.user!.tenantId!;

  const draft = await loadDraft(tenantId, importId);
  if (!draft) {
    res.status(404).json({ success: false, message: 'Import session not found or expired — please re-upload the file.' });
    return;
  }
  const store = await resolveTargetStore(tenantId, targetStoreId);
  if (!store) {
    res.status(404).json({ success: false, message: 'Target store not found.' });
    return;
  }

  const derived = deriveOrders(draft.headers, draft.rows, mapping, dateFormat);
  const db = getDb();

  const existing = await db
    .collection('orders')
    .find({ tenantId, storeId: store._id.toString(), externalId: { $in: derived.map((o) => o.externalId) } }, { projection: { externalId: 1 } })
    .toArray();
  const existingIds = new Set(existing.map((o) => o.externalId));

  const allSkus = [...new Set(derived.flatMap((o) => o.lineItems.map((li) => li.sku).filter((s): s is string => Boolean(s))))];
  const matchedProducts =
    allSkus.length > 0 ? await db.collection('products').find({ tenantId, 'variants.sku': { $in: allSkus } }, { projection: { variants: 1 } }).toArray() : [];
  const matchedSkuSet = new Set(matchedProducts.flatMap((p) => (p.variants ?? []).map((v: any) => v.sku).filter(Boolean)));

  let newCount = 0;
  let duplicateCount = 0;
  let invalidCount = 0;
  const rowsOut = derived.map((o) => {
    const status = o.invalidReason ? 'invalid' : existingIds.has(o.externalId) ? 'duplicate' : 'new';
    if (status === 'invalid') invalidCount += 1;
    else if (status === 'duplicate') duplicateCount += 1;
    else newCount += 1;
    return {
      rowNumbers: o.rowNumbers,
      status,
      reason: o.invalidReason,
      weakDedupeKey: o.weakDedupeKey,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      orderDate: o.orderDate ? o.orderDate.toISOString() : null,
      total: o.total,
      itemCount: o.lineItems.length,
    };
  });

  const totalSkus = derived.flatMap((o) => o.lineItems).filter((li) => li.sku).length;
  const matchedSkuCount = derived.flatMap((o) => o.lineItems).filter((li) => li.sku && matchedSkuSet.has(li.sku)).length;

  res.json({
    success: true,
    rows: rowsOut,
    counts: { new: newCount, duplicate: duplicateCount, invalid: invalidCount, total: derived.length },
    skuMatch: { matched: matchedSkuCount, total: totalSkus },
    storeId: store._id.toString(),
    storeDisplayName: store.displayName,
  });
}

async function nextCsvOrderNumbers(tenantId: string, count: number): Promise<string[]> {
  if (count === 0) return [];
  const db = getDb();
  const result = await db
    .collection('counters')
    .findOneAndUpdate({ _id: `${tenantId}:csvImportOrder` } as any, { $inc: { seq: count } }, { upsert: true, returnDocument: 'after' });
  const last = (result as any)?.seq ?? count;
  const first = last - count + 1;
  return Array.from({ length: count }, (_, i) => `CSV-${String(first + i).padStart(5, '0')}`);
}

// Step 3: commit. Re-derives orders from the stored draft server-side (never trusts row data from
// the client) and inserts with insertMany({ ordered: false }) so one bad/duplicate row never blocks
// the rest — duplicate-key failures (code 11000, from the existing unique
// { tenantId, storeId, externalId } index) are caught and counted as skipped, never overwritten.
export async function commitCsvOrderImport(req: AuthenticatedRequest, res: Response) {
  const parsed = deriveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid import mapping.' });
    return;
  }
  const { importId, dateFormat, targetStoreId } = parsed.data;
  const mapping = toFieldMapping(parsed.data.mapping);
  const tenantId = req.user!.tenantId!;

  const draft = await loadDraft(tenantId, importId);
  if (!draft) {
    res.status(404).json({ success: false, message: 'Import session not found or expired — please re-upload the file.' });
    return;
  }
  const store = await resolveTargetStore(tenantId, targetStoreId);
  if (!store) {
    res.status(404).json({ success: false, message: 'Target store not found.' });
    return;
  }
  const storeId = store._id.toString();

  const derived = deriveOrders(draft.headers, draft.rows, mapping, dateFormat);
  const db = getDb();

  const existing = await db
    .collection('orders')
    .find({ tenantId, storeId, externalId: { $in: derived.map((o) => o.externalId) } }, { projection: { externalId: 1 } })
    .toArray();
  const existingIds = new Set(existing.map((o) => o.externalId));

  const toInsert = derived.filter((o) => !o.invalidReason && !existingIds.has(o.externalId));
  const skippedInvalid = derived.filter((o) => o.invalidReason).length;
  let skippedDuplicate = derived.length - toInsert.length - skippedInvalid;

  const now = new Date();
  const actor = req.user!.email;
  const numbers = await nextCsvOrderNumbers(tenantId, toInsert.length);

  const docs = toInsert.map((o, i) => {
    const subtotal = o.lineItems.reduce((s, li) => s + li.price * li.quantity, 0);
    const orderDate = o.orderDate ?? now;
    return {
      tenantId,
      storeId,
      platform: 'csv',
      externalId: o.externalId,
      number: numbers[i],
      stage: 'Pending',
      stageSource: 'csv',
      heldFromStage: null,
      paymentStatus: o.paymentMethod === 'Cash on Delivery' ? 'COD Pending' : 'Paid',
      paymentMethod: o.paymentMethod,
      subtotal,
      shippingFee: 0,
      discount: 0,
      advanceAmount: 0,
      total: o.total,
      currency: 'BDT',
      tags: ['CSV Import'],
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerAltPhone: o.customerAltPhone,
      customerEmail: null,
      address: o.address,
      lineItems: o.lineItems.map((li) => ({ title: li.title, variant: null, quantity: li.quantity, price: li.price, sku: li.sku, image: null })),
      holdReason: null,
      cancelReason: null,
      flagReason: null,
      note: null,
      rescheduledFor: null,
      isPriorityCall: false,
      priorityNote: null,
      courierPartner: null,
      courierTrackingId: null,
      courierConsignmentId: null,
      courierStatus: null,
      courierSyncedAt: null,
      courierCharge: null,
      courierReturnCharge: null,
      courierZoneTier: detectZoneTier(o.address ?? ''),
      courierSpeed: 'regular',
      deliveryZone: null,
      callAttempts: 0,
      history: [{ label: 'Order placed', detail: 'Imported from CSV', at: orderDate, by: actor }],
      returnLocation: null,
      fulfillmentWarehouseId: null,
      fulfillmentWarehouseName: null,
      cogsTotal: null,
      createdAt: orderDate,
      updatedAt: now,
    };
  });

  let created = 0;
  if (docs.length > 0) {
    try {
      const result = await db.collection('orders').insertMany(docs as any[], { ordered: false });
      created = result.insertedCount;
    } catch (err) {
      const writeErrors = (err as any)?.writeErrors;
      if (!Array.isArray(writeErrors)) throw err;
      for (const we of writeErrors) {
        if (we.code === 11000) skippedDuplicate += 1;
        else logger.error(`[csvOrderImport] row insert failed: ${we.errmsg}`);
      }
      created = docs.length - writeErrors.length;
    }
  }

  await db.collection('csvImportDrafts').deleteOne({ _id: draft._id });

  res.json({ success: true, created, skippedDuplicate, skippedInvalid, storeId, storeDisplayName: store.displayName });
}
