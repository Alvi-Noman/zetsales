import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { randomBytes, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import logger from '../utils/logger.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type {
  CourierAccountDTO,
  CourierSummaryDTO,
  CourierProvider,
  CourierSettlementDTO,
  CourierHandoverDTO,
  CourierHandoverDetailDTO,
  EligibleHandoverOrderDTO,
  CourierZoneTier,
  CourierSpeed,
} from '@zetsales/shared';
import { verifySteadfastCredentials, type SteadfastCredentials } from '../integrations/steadfastClient.js';
import { verifyPathaoCredentials, type PathaoCredentials } from '../integrations/pathaoClient.js';
import { getSteadfastFraudStatus } from '../integrations/steadfastFraudClient.js';
import { getPathaoFraudStatus } from '../integrations/pathaoFraudClient.js';
import { nextInvoiceNumberForStore } from '../utils/invoiceNumbers.js';

function webhookBaseUrl(): string {
  return process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce';
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as any).code === 11000);
}

const ZONE_TIERS: CourierZoneTier[] = ['inside', 'outside', 'suburb'];
const SPEEDS: CourierSpeed[] = ['regular', 'express'];

// Legacy couriers only ever had a single flat `deliveryChargeRate` — surfaced here as the starting
// value for every cell of the new rate matrix rather than leaving it blank, so a merchant who
// connected before this existed doesn't suddenly see every rate wiped to "not set".
function normalizeDeliveryRates(doc: any): CourierAccountDTO['deliveryRates'] {
  const legacyFallback = typeof doc.deliveryChargeRate === 'number' ? doc.deliveryChargeRate : null;
  const stored = doc.deliveryRates ?? {};
  const result = {} as CourierAccountDTO['deliveryRates'];
  for (const speed of SPEEDS) {
    result[speed] = {} as Record<CourierZoneTier, number | null>;
    for (const zone of ZONE_TIERS) {
      result[speed][zone] = stored[speed]?.[zone] ?? legacyFallback;
    }
  }
  return result;
}

function normalizeReturnRates(doc: any): CourierAccountDTO['returnRates'] {
  const stored = doc.returnRates ?? {};
  const result = {} as CourierAccountDTO['returnRates'];
  for (const zone of ZONE_TIERS) result[zone] = stored[zone] ?? null;
  return result;
}

function toCourierDto(doc: any): CourierAccountDTO {
  return {
    id: doc._id.toString(),
    provider: doc.provider,
    displayName: doc.displayName,
    status: doc.status,
    webhookUrl: `${webhookBaseUrl()}/webhooks/${doc.provider}`,
    webhookSecret: decryptSecret(doc.webhookSecret),
    deliveryRates: normalizeDeliveryRates(doc),
    returnRates: normalizeReturnRates(doc),
    lastUsedAt: doc.lastUsedAt ? new Date(doc.lastUsedAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

// Resolves the actual charge to snapshot onto an order at dispatch time — falls back through the
// zone/speed matrix cell, then the legacy flat rate, then 0 (never blocks dispatch on a missing rate).
function toCourierSummaryDto(doc: any): CourierSummaryDTO {
  return {
    id: doc._id.toString(),
    provider: doc.provider,
    displayName: doc.displayName,
    status: doc.status,
    lastUsedAt: doc.lastUsedAt ? new Date(doc.lastUsedAt).toISOString() : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export function resolveCourierCharge(doc: any, zoneTier: CourierZoneTier, speed: CourierSpeed): number {
  const cell = doc.deliveryRates?.[speed]?.[zoneTier];
  if (typeof cell === 'number') return cell;
  if (typeof doc.deliveryChargeRate === 'number') return doc.deliveryChargeRate;
  return 0;
}

export function resolveCourierReturnCharge(doc: any, zoneTier: CourierZoneTier): number {
  const cell = doc.returnRates?.[zoneTier];
  return typeof cell === 'number' ? cell : 0;
}

export async function listCouriers(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const couriers = await db.collection('couriers').find({ tenantId: req.user!.tenantId }).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, couriers: couriers.map(toCourierDto) });
}

export async function listCourierSummaries(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const couriers = await db.collection('couriers').find({ tenantId: req.user!.tenantId }).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, couriers: couriers.map(toCourierSummaryDto) });
}

// Diagnostic readout for the account-level (not tenant-scoped) Steadfast/Pathao fraud-check
// portals — answers "why is the courier delivery-history check on the order drawer failing" without
// needing container log access, which doesn't survive a restart anyway.
export async function getCourierFraudDiagnostics(_req: AuthenticatedRequest, res: Response) {
  const [steadfast, pathao] = await Promise.all([getSteadfastFraudStatus(), getPathaoFraudStatus()]);
  res.json({ success: true, steadfast: steadfast ?? null, pathao: pathao ?? null });
}

// One connected account per provider per tenant — reconnecting (e.g. rotated API keys) updates the
// existing record in place rather than creating a duplicate, and keeps the same webhook secret so
// the merchant doesn't have to go update it in their courier panel too.
async function upsertCourier(tenantId: string, provider: CourierProvider, displayName: string, credentials: Record<string, unknown>) {
  const db = getDb();
  const now = new Date();
  const existing = await db.collection('couriers').findOne({ tenantId, provider });
  const webhookSecret = existing?.webhookSecret ?? encryptSecret(randomBytes(24).toString('hex'));
  const result = await db.collection('couriers').findOneAndUpdate(
    { tenantId, provider },
    {
      $set: { displayName, status: 'connected', credentials, webhookSecret, updatedAt: now },
      $setOnInsert: { tenantId, provider, lastUsedAt: null, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return result!;
}

const steadfastSchema = z.object({
  apiKey: z.string().trim().min(5),
  secretKey: z.string().trim().min(5),
  displayName: z.string().trim().optional(),
});

export async function connectSteadfast(req: AuthenticatedRequest, res: Response) {
  const parsed = steadfastSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'API key and secret key are required.' });
    return;
  }

  try {
    await verifySteadfastCredentials({ apiKey: parsed.data.apiKey, secretKey: parsed.data.secretKey });
    const doc = await upsertCourier(req.user!.tenantId!, 'steadfast', parsed.data.displayName || 'Steadfast', {
      apiKey: encryptSecret(parsed.data.apiKey),
      secretKey: encryptSecret(parsed.data.secretKey),
    });
    res.json({ success: true, courier: toCourierDto(doc) });
  } catch (err) {
    logger.warn(`[couriers] Steadfast connect failed: ${(err as Error).message}`);
    res.status(400).json({ success: false, message: (err as Error).message || 'Could not verify these Steadfast credentials.' });
  }
}

const pathaoSchema = z.object({
  clientId: z.string().trim().min(3),
  clientSecret: z.string().trim().min(3),
  username: z.string().trim().min(3),
  password: z.string().trim().min(1),
  storeId: z.string().trim().min(1),
  displayName: z.string().trim().optional(),
});

export async function connectPathao(req: AuthenticatedRequest, res: Response) {
  const parsed = pathaoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Client ID, Client Secret, username, password and Store ID are all required.' });
    return;
  }

  try {
    const { storeName } = await verifyPathaoCredentials(parsed.data);
    const doc = await upsertCourier(req.user!.tenantId!, 'pathao', parsed.data.displayName || storeName, {
      clientId: encryptSecret(parsed.data.clientId),
      clientSecret: encryptSecret(parsed.data.clientSecret),
      username: encryptSecret(parsed.data.username),
      password: encryptSecret(parsed.data.password),
      storeId: parsed.data.storeId,
    });
    res.json({ success: true, courier: toCourierDto(doc) });
  } catch (err) {
    logger.warn(`[couriers] Pathao connect failed: ${(err as Error).message}`);
    res.status(400).json({ success: false, message: (err as Error).message || 'Could not verify these Pathao credentials.' });
  }
}

const rateCellSchema = z.number().nonnegative().nullable();
const chargeRateSchema = z.object({
  deliveryRates: z.object({
    regular: z.object({ inside: rateCellSchema, outside: rateCellSchema, suburb: rateCellSchema }),
    express: z.object({ inside: rateCellSchema, outside: rateCellSchema, suburb: rateCellSchema }),
  }),
  returnRates: z.object({ inside: rateCellSchema, outside: rateCellSchema, suburb: rateCellSchema }),
});

// The per-zone/per-speed delivery and return rate matrix the merchant configures by hand, mirroring
// the courier's own published rate card (see CourierAccountDTO comment) — used only to snapshot
// onto orders at dispatch/return time (ordersController's dispatchCourierConsignment and
// applyCourierReturnCharge); changing it here never touches orders already snapshotted.
export async function updateChargeRate(req: AuthenticatedRequest, res: Response) {
  const parsed = chargeRateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A valid delivery/return rate matrix is required.' });
    return;
  }
  const db = getDb();
  const result = await db.collection('couriers').findOneAndUpdate(
    { _id: new ObjectId(req.params.courierId), tenantId: req.user!.tenantId },
    { $set: { deliveryRates: parsed.data.deliveryRates, returnRates: parsed.data.returnRates, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Courier account not found.' });
    return;
  }
  res.json({ success: true, courier: toCourierDto(result) });
}

function toSettlementDto(doc: any): CourierSettlementDTO {
  return {
    id: doc._id.toString(),
    courierId: doc.courierId.toString(),
    provider: doc.provider,
    amount: doc.amount,
    settledAt: new Date(doc.settledAt).toISOString(),
    reference: doc.reference ?? null,
    note: doc.note ?? null,
    createdBy: doc.createdBy ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

async function nextManifestNumber(tenantId: string): Promise<string> {
  const db = getDb();
  const result = await db
    .collection('counters')
    .findOneAndUpdate({ _id: `${tenantId}:pickupManifest` } as any, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  const seq = (result as any)?.seq ?? 1;
  return `MAN-${String(seq).padStart(6, '0')}`;
}

async function ensureHandoverInvoiceNumbers(tenantId: string, orders: any[], actor: string | null) {
  const db = getDb();
  for (const order of orders) {
    if (order.invoiceNo) continue;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const invoiceNo = await nextInvoiceNumberForStore(tenantId, order.storeId);
      const now = new Date();
      try {
        const result = await db.collection('orders').updateOne(
          { _id: order._id, tenantId, $or: [{ invoiceNo: null }, { invoiceNo: { $exists: false } }] },
          {
            $set: { invoiceNo, invoiceIssuedAt: now, updatedAt: now },
            $push: { history: { label: 'Bill issued', detail: `${invoiceNo} issued for pickup manifest`, at: now, by: actor } },
          } as any
        );
        if (result.modifiedCount > 0) {
          order.invoiceNo = invoiceNo;
          order.invoiceIssuedAt = now;
        }
        break;
      } catch (error) {
        if (isDuplicateKeyError(error)) continue;
        throw error;
      }
    }
  }
}

export async function listSettlements(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const settlements = await db
    .collection('courierSettlements')
    .find({ tenantId: req.user!.tenantId, courierId: new ObjectId(req.params.courierId) })
    .sort({ settledAt: -1 })
    .toArray();
  res.json({ success: true, settlements: settlements.map(toSettlementDto) });
}

const createSettlementSchema = z.object({
  amount: z.number().positive(),
  settledAt: z.string().trim().min(1),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
});

// A courier payout is logged as one lump sum against a running per-courier balance — real courier
// remittances are batch payments covering many parcels at once, not a 1:1 payment per delivered
// order, so this deliberately doesn't try to reconcile line-by-line. getCourierReconciliation (the
// analytics endpoint) is what turns this ledger plus delivered-COD/charge totals into a Due figure.
export async function createSettlement(req: AuthenticatedRequest, res: Response) {
  const parsed = createSettlementSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A positive amount and a settlement date are required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const courier = await db.collection('couriers').findOne({ _id: new ObjectId(req.params.courierId), tenantId });
  if (!courier) {
    res.status(404).json({ success: false, message: 'Courier account not found.' });
    return;
  }
  const now = new Date();
  const doc = {
    tenantId,
    courierId: courier._id,
    provider: courier.provider,
    amount: parsed.data.amount,
    settledAt: new Date(parsed.data.settledAt),
    reference: parsed.data.reference || null,
    note: parsed.data.note || null,
    createdBy: req.user!.email,
    createdAt: now,
  };
  const result = await db.collection('courierSettlements').insertOne(doc);
  res.json({ success: true, settlement: toSettlementDto({ ...doc, _id: result.insertedId }) });
}

export async function deleteSettlement(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const result = await db.collection('courierSettlements').deleteOne({ _id: new ObjectId(req.params.settlementId), tenantId: req.user!.tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Settlement not found.' });
    return;
  }
  res.json({ success: true });
}

// --- Handovers: the physical "I just gave the courier office N bagged-up parcels" moment. Bulk
// operations elsewhere (dispatchCourierConsignment) create the digital consignment the instant an
// order is marked Ready for Pickup; this is the separate, later event of physically handing those
// parcels over (which moves them to Shipped), which a merchant does in batches (once or twice a
// day), not one order at a time. ---

function toHandoverDto(doc: any): CourierHandoverDTO {
  return {
    id: doc._id.toString(),
    manifestNo: doc.manifestNo ?? `MAN-${doc._id.toString().slice(-8).toUpperCase()}`,
    courierId: doc.courierId.toString(),
    provider: doc.provider,
    handoverDate: new Date(doc.handoverDate).toISOString(),
    parcelCount: doc.parcelCount,
    itemCount: doc.itemCount,
    totalCodAmount: doc.totalCodAmount,
    status: doc.status,
    confirmedAt: doc.confirmedAt ? new Date(doc.confirmedAt).toISOString() : null,
    note: doc.note ?? null,
    createdBy: doc.createdBy ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

// Orders eligible to go into a NEW handover for this courier: ready for pickup (a consignment
// exists to hand over, but the parcel hasn't physically left yet), matching this courier's partner,
// and not already sitting in an earlier handover batch (handoverId is set the moment an order is
// added to one — see createHandover below).
export async function listEligibleHandoverOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const courier = await db.collection('couriers').findOne({ _id: new ObjectId(req.params.courierId), tenantId });
  if (!courier) {
    res.status(404).json({ success: false, message: 'Courier account not found.' });
    return;
  }
  const partner = courier.provider === 'steadfast' ? 'Steadfast' : 'Pathao';
  const orders = await db
    .collection('orders')
    .find({ tenantId, stage: 'Ready for Pickup', courierPartner: partner, handoverId: null })
    .sort({ createdAt: 1 })
    .limit(500)
    .toArray();

  const rows: EligibleHandoverOrderDTO[] = orders.map((o) => ({
    orderId: o._id.toString(),
    orderNumber: o.number,
    invoiceNo: o.invoiceNo ?? null,
    customerName: o.customerName ?? null,
    consignmentId: o.courierConsignmentId ?? null,
    itemCount: (o.lineItems ?? []).reduce((s: number, li: any) => s + li.quantity, 0),
    total: o.total,
    createdAt: new Date(o.createdAt).toISOString(),
  }));
  res.json({ success: true, orders: rows });
}

export async function listHandovers(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const handovers = await db
    .collection('courierHandovers')
    .find({ tenantId: req.user!.tenantId, courierId: new ObjectId(req.params.courierId) })
    .sort({ handoverDate: -1 })
    .toArray();
  res.json({ success: true, handovers: handovers.map(toHandoverDto) });
}

const createHandoverSchema = z.object({
  handoverDate: z.string().trim().min(1),
  orderIds: z.array(z.string()).min(1).max(500),
  note: z.string().trim().max(500).optional(),
});

export async function createHandover(req: AuthenticatedRequest, res: Response) {
  const parsed = createHandoverSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A handover date and at least one order are required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const courier = await db.collection('couriers').findOne({ _id: new ObjectId(req.params.courierId), tenantId });
  if (!courier) {
    res.status(404).json({ success: false, message: 'Courier account not found.' });
    return;
  }
  const partner = courier.provider === 'steadfast' ? 'Steadfast' : 'Pathao';

  // Only pick up orders that are STILL eligible right now (ready for pickup, this courier, not
  // already handed over) — guards against a stale client-side selection racing a concurrent handover.
  const objectIds = parsed.data.orderIds.map((id) => new ObjectId(id));
  const orders = await db
    .collection('orders')
    .find({ _id: { $in: objectIds }, tenantId, stage: 'Ready for Pickup', courierPartner: partner, handoverId: null })
    .toArray();
  if (orders.length === 0) {
    res.status(400).json({ success: false, message: 'None of the selected orders are still eligible for handover.' });
    return;
  }
  await ensureHandoverInvoiceNumbers(tenantId, orders, req.user!.email);

  const now = new Date();
  const handoverId = new ObjectId();
  const parcelCount = orders.length;
  const itemCount = orders.reduce((s, o) => s + (o.lineItems ?? []).reduce((ls: number, li: any) => ls + li.quantity, 0), 0);
  const totalCodAmount = orders.reduce((s, o) => s + (o.paymentMethod === 'Cash on Delivery' ? o.total : 0), 0);

  const doc = {
    _id: handoverId,
    manifestNo: await nextManifestNumber(tenantId),
    tenantId,
    courierId: courier._id,
    provider: courier.provider,
    handoverDate: new Date(parsed.data.handoverDate),
    orderIds: orders.map((o) => o._id),
    parcelCount,
    itemCount,
    totalCodAmount,
    status: 'Pending' as const,
    confirmedAt: null,
    note: parsed.data.note || null,
    createdBy: req.user!.email,
    createdAt: now,
  };
  await db.collection('courierHandovers').insertOne(doc);
  await db.collection('orders').updateMany({ _id: { $in: orders.map((o) => o._id) } }, { $set: { handoverId } });

  res.json({ success: true, handover: toHandoverDto(doc) });
}

export async function getHandover(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const handover = await db.collection('courierHandovers').findOne({ _id: new ObjectId(req.params.handoverId), tenantId });
  if (!handover) {
    res.status(404).json({ success: false, message: 'Handover not found.' });
    return;
  }
  const orders = await db
    .collection('orders')
    .find({ _id: { $in: handover.orderIds } })
    .toArray();
  const orderById = new Map(orders.map((o) => [o._id.toString(), o]));

  const orderRows = handover.orderIds.map((id: ObjectId) => {
    const o = orderById.get(id.toString());
    return {
      orderId: id.toString(),
      orderNumber: o?.number ?? 'Unknown',
      invoiceNo: o?.invoiceNo ?? null,
      customerName: o?.customerName ?? null,
      consignmentId: o?.courierConsignmentId ?? null,
      itemCount: (o?.lineItems ?? []).reduce((s: number, li: any) => s + li.quantity, 0),
      total: o?.total ?? 0,
    };
  });

  const itemsByKey = new Map<string, { title: string; sku: string | null; image: string | null; quantity: number }>();
  for (const o of orders) {
    for (const li of o.lineItems ?? []) {
      const key = li.sku ?? li.title;
      const existing = itemsByKey.get(key);
      if (existing) existing.quantity += li.quantity;
      else itemsByKey.set(key, { title: li.title, sku: li.sku ?? null, image: li.image ?? null, quantity: li.quantity });
    }
  }

  const dto: CourierHandoverDetailDTO = {
    ...toHandoverDto(handover),
    orders: orderRows,
    items: [...itemsByKey.values()].sort((a, b) => b.quantity - a.quantity),
  };
  res.json({ success: true, handover: dto });
}

const confirmHandoverSchema = z.object({ note: z.string().trim().max(500).optional() });

export async function confirmHandover(req: AuthenticatedRequest, res: Response) {
  const parsed = confirmHandoverSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid confirmation payload.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();
  const result = await db.collection('courierHandovers').findOneAndUpdate(
    { _id: new ObjectId(req.params.handoverId), tenantId, status: 'Pending' },
    { $set: { status: 'Confirmed', confirmedAt: now, ...(parsed.data.note ? { note: parsed.data.note } : {}) } },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Handover not found or already confirmed.' });
    return;
  }
  // Confirming the manifest means the courier has physically taken these parcels — that's the
  // Shipped stage. Out for Delivery is left for the courier's own webhook to set once it reports
  // the parcel is actually moving, same as every other hand-over path.
  const acceptedUpdate = {
    $set: { stage: 'Shipped', updatedAt: now },
    $push: {
      history: {
        label: 'Shipped',
        detail: 'Accepted by courier via pickup manifest',
        at: now,
        by: req.user!.email,
      },
    },
  } as any;
  await db.collection('orders').updateMany(
    { _id: { $in: result.orderIds }, tenantId, stage: 'Ready for Pickup' },
    acceptedUpdate
  );
  res.json({ success: true, handover: toHandoverDto(result) });
}

// Undo — only while still Pending. Releases every order in the batch back into the eligible pool
// (clears handoverId) rather than leaving them permanently stuck "already handed over" with no
// batch to show for it.
export async function deleteHandover(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const handover = await db.collection('courierHandovers').findOne({ _id: new ObjectId(req.params.handoverId), tenantId, status: 'Pending' });
  if (!handover) {
    res.status(404).json({ success: false, message: 'Handover not found or already confirmed.' });
    return;
  }
  await db.collection('orders').updateMany({ _id: { $in: handover.orderIds } }, { $set: { handoverId: null } });
  await db.collection('courierHandovers').deleteOne({ _id: handover._id });
  res.json({ success: true });
}

export async function removeCourier(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const result = await db.collection('couriers').deleteOne({ _id: new ObjectId(req.params.courierId), tenantId: req.user!.tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Courier account not found.' });
    return;
  }
  res.json({ success: true });
}

// Lets a merchant get a fresh secret without re-entering their courier API credentials, e.g. if the
// original one was mistyped into the courier panel or they suspect it leaked.
export async function regenerateCourierWebhookSecret(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const webhookSecret = encryptSecret(randomBytes(24).toString('hex'));
  const result = await db.collection('couriers').findOneAndUpdate(
    { _id: new ObjectId(req.params.courierId), tenantId: req.user!.tenantId },
    { $set: { webhookSecret, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Courier account not found.' });
    return;
  }
  res.json({ success: true, courier: toCourierDto(result) });
}

// --- Internal helpers used by ordersController (dispatch) and webhooksController (inbound status) ---

export async function getConnectedCourier(tenantId: string, provider: CourierProvider) {
  const db = getDb();
  return db.collection('couriers').findOne({ tenantId, provider, status: 'connected' });
}

export async function markCourierUsed(courierId: ObjectId) {
  const db = getDb();
  await db.collection('couriers').updateOne({ _id: courierId }, { $set: { lastUsedAt: new Date() } });
}

export function decryptSteadfastCredentials(doc: any): SteadfastCredentials {
  return { apiKey: decryptSecret(doc.credentials.apiKey), secretKey: decryptSecret(doc.credentials.secretKey) };
}

export function decryptPathaoCredentials(doc: any): PathaoCredentials {
  return {
    clientId: decryptSecret(doc.credentials.clientId),
    clientSecret: decryptSecret(doc.credentials.clientSecret),
    username: decryptSecret(doc.credentials.username),
    password: decryptSecret(doc.credentials.password),
    storeId: doc.credentials.storeId,
  };
}

// Used by webhooksController to figure out which tenant an inbound courier webhook belongs to —
// courier webhooks are account-level (one URL total per provider, not per-tenant), so the shared
// secret the merchant pasted into their courier panel is the only thing that identifies them.
export async function findCourierByWebhookSecret(provider: CourierProvider, providedSecret: string) {
  if (!providedSecret) return null;
  const db = getDb();
  const providedBuf = Buffer.from(providedSecret);
  const candidates = await db.collection('couriers').find({ provider, status: 'connected' }).toArray();
  for (const candidate of candidates) {
    try {
      const secretBuf = Buffer.from(decryptSecret(candidate.webhookSecret));
      if (secretBuf.length === providedBuf.length && timingSafeEqual(secretBuf, providedBuf)) return candidate;
    } catch {
      continue;
    }
  }
  return null;
}
