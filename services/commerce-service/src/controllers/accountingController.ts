import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

function expenseDto(doc: any) {
  return {
    id: doc._id.toString(),
    category: doc.category,
    amount: doc.amount,
    date: new Date(doc.date).toISOString(),
    note: doc.note ?? null,
    createdBy: doc.createdBy ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export async function listExpenses(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const match: Record<string, unknown> = { tenantId };
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;
  if (dateFrom || dateTo) {
    const date: Record<string, Date> = {};
    if (dateFrom) date.$gte = dateFrom;
    if (dateTo) date.$lte = dateTo;
    match.date = date;
  }
  const docs = await db.collection('expenses').find(match).sort({ date: -1 }).toArray();
  res.json({ success: true, expenses: docs.map(expenseDto) });
}

const expenseSchema = z.object({
  category: z.string().trim().min(1),
  amount: z.number().positive(),
  date: z.string().trim().min(1),
  note: z.string().trim().optional().or(z.literal('')),
});

// category is deliberately free text, not an enum — advertising, payroll, and office/overhead
// costs will all land here as just another category string once they're tracked, with zero schema
// changes needed. The UI offers a handful of presets as a starting point, never as a hard limit.
export async function createExpense(req: AuthenticatedRequest, res: Response) {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A category, amount, and date are required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();
  const doc = {
    tenantId,
    category: parsed.data.category,
    amount: parsed.data.amount,
    date: new Date(parsed.data.date),
    note: parsed.data.note || null,
    createdBy: req.user!.email,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection('expenses').insertOne(doc);
  res.json({ success: true, expense: expenseDto({ ...doc, _id: result.insertedId }) });
}

export async function deleteExpense(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid expense.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await db.collection('expenses').deleteOne({ _id: new ObjectId(req.params.id), tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Expense not found.' });
    return;
  }
  res.json({ success: true });
}

// Every movement that recognizes or reverses Cost of Goods Sold carries this reason (see
// applyInventoryStageEffect / logDeliveredReturnGood in inventoryController.ts) — 'Order fulfilled'
// is always a negative valueDelta (COGS recognized), 'Order returned' is always positive (COGS
// reversed on a good-condition post-delivery return). Negating the sum yields net COGS for the
// range, correctly netting out a same-range sale-then-return without any extra bookkeeping.
export const COGS_REASONS = ['Order fulfilled', 'Order returned'];

// The exact same allow-list getShrinkageReport uses — genuine inventory loss, not a data-entry
// correction ('Wrong entry' stays excluded) and not a cost-neutral internal transfer. 'Gift/Giveaway'
// is deliberately excluded too (same "leave it off the list" pattern) — giving stock away on purpose
// is a marketing cost, not a loss, and lumping it in here would inflate the loss/theft/damage number
// with spend the business chose to make. See giftsInRange below for where it's actually counted.
const SHRINKAGE_REASONS = ['Damaged stock', 'Lost', 'Wrong Product', 'Lost in transit', 'Manual adjustment', 'Cycle count'];

type Db = ReturnType<typeof getDb>;

async function revenueInRange(db: Db, tenantId: string, dateFrom: Date, dateTo: Date) {
  const agg = await db
    .collection('orders')
    .aggregate([
      { $match: { tenantId, history: { $elemMatch: { label: { $in: ['Delivered', 'Partial Delivered'] }, at: { $gte: dateFrom, $lte: dateTo } } } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ])
    .toArray();
  return agg[0]?.total ?? 0;
}

async function cogsInRange(db: Db, tenantId: string, dateFrom: Date, dateTo: Date) {
  const agg = await db
    .collection('inventoryMovements')
    .aggregate([
      { $match: { tenantId, reason: { $in: COGS_REASONS }, createdAt: { $gte: dateFrom, $lte: dateTo } } },
      { $group: { _id: null, total: { $sum: '$valueDelta' } } },
    ])
    .toArray();
  return -(agg[0]?.total ?? 0);
}

// Net of recoveries, same as getShrinkageReport's netValueLost — "Found stock" is the explicit,
// deliberate signal that a specific gain really is a recovery of past shrinkage (not just any
// upward adjustment), so it's safe to credit back here. Without this, Net Profit would keep
// deducting the full original loss forever even after some of it was recovered, while the
// dedicated Shrinkage report right next to it shows the correct net figure — the two would quietly
// disagree on how much was actually lost.
async function shrinkageInRange(db: Db, tenantId: string, dateFrom: Date, dateTo: Date) {
  const [lossAgg, recoveryAgg] = await Promise.all([
    db
      .collection('inventoryMovements')
      .aggregate([
        {
          $match: {
            tenantId,
            createdAt: { $gte: dateFrom, $lte: dateTo },
            $or: [
              { delta: { $lt: 0 }, reason: { $in: SHRINKAGE_REASONS } },
              { delta: 0, reason: { $in: ['Short-shipped by supplier', 'Lost in transit', 'Damaged on arrival'] } },
            ],
          },
        },
        { $group: { _id: null, total: { $sum: { $abs: '$valueDelta' } } } },
      ])
      .toArray(),
    db
      .collection('inventoryMovements')
      .aggregate([
        { $match: { tenantId, reason: 'Found stock', delta: { $gt: 0 }, createdAt: { $gte: dateFrom, $lte: dateTo } } },
        { $group: { _id: null, total: { $sum: { $abs: '$valueDelta' } } } },
      ])
      .toArray(),
  ]);
  const grossLoss = lossAgg[0]?.total ?? 0;
  const recovered = recoveryAgg[0]?.total ?? 0;
  return Math.max(0, grossLoss - recovered);
}

// Stock given away on purpose (samples, customer gifts, promos) — a real cost, but not shrinkage
// (see the comment on SHRINKAGE_REASONS above) and not an `expenses` row either, since it's never
// entered there — it's derived the same way COGS/shrinkage are, straight from inventoryMovements,
// using whatever cost basis the SKU already carried at the time (same as a Damaged/Lost deduction).
async function giftsInRange(db: Db, tenantId: string, dateFrom: Date, dateTo: Date) {
  const agg = await db
    .collection('inventoryMovements')
    .aggregate([
      { $match: { tenantId, reason: 'Gift/Giveaway', delta: { $lt: 0 }, createdAt: { $gte: dateFrom, $lte: dateTo } } },
      { $group: { _id: null, total: { $sum: { $abs: '$valueDelta' } } } },
    ])
    .toArray();
  return agg[0]?.total ?? 0;
}

// Revenue is recognized off each order's own 'Delivered'/'Partial Delivered' history timestamp,
// not `updatedAt` (which changes on unrelated later edits — a note, a courier status ping — with no
// corresponding stage-labeled history entry). COGS keys off inventoryMovements.createdAt the same
// way, which is what lets a sale delivered in one month and returned in a later month correctly
// attribute the reversal to the month it actually happened, not retroactively rewrite an already-
// closed period.
//
// Deliberately not netted against later refunds: this system has no refund-amount tracking today
// (COD money is only ever collected on delivery), so Revenue here is "value of orders delivered in
// this range," not "cash actually kept after returns." Disclosed in the UI, not hidden.
export async function getProfitAndLoss(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : now;

  const [revenue, cogs, shrinkage, giftsAndGiveaways, expenseAgg] = await Promise.all([
    revenueInRange(db, tenantId, dateFrom, dateTo),
    cogsInRange(db, tenantId, dateFrom, dateTo),
    shrinkageInRange(db, tenantId, dateFrom, dateTo),
    giftsInRange(db, tenantId, dateFrom, dateTo),
    db
      .collection('expenses')
      .aggregate([
        { $match: { tenantId, date: { $gte: dateFrom, $lte: dateTo } } },
        { $group: { _id: '$category', amount: { $sum: '$amount' } } },
        { $sort: { amount: -1 } },
      ])
      .toArray(),
  ]);

  const expensesByCategory = expenseAgg.map((e) => ({ category: e._id as string, amount: e.amount as number }));
  const totalExpenses = expensesByCategory.reduce((sum, e) => sum + e.amount, 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - shrinkage - giftsAndGiveaways - totalExpenses;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : null;
  const netMarginPct = revenue > 0 ? (netProfit / revenue) * 100 : null;

  // Trend always covers the trailing 12 months for context, independent of the selected range —
  // seeing "this month vs the last year" is the point of a trend chart, not just the filtered slice.
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const [revenueTrendAgg, cogsTrendAgg] = await Promise.all([
    db
      .collection('orders')
      .aggregate([
        { $match: { tenantId, history: { $elemMatch: { label: { $in: ['Delivered', 'Partial Delivered'] }, at: { $gte: trendStart } } } } },
        { $unwind: '$history' },
        { $match: { 'history.label': { $in: ['Delivered', 'Partial Delivered'] }, 'history.at': { $gte: trendStart } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$history.at' } }, total: { $sum: '$total' } } },
      ])
      .toArray(),
    db
      .collection('inventoryMovements')
      .aggregate([
        { $match: { tenantId, reason: { $in: COGS_REASONS }, createdAt: { $gte: trendStart } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, total: { $sum: '$valueDelta' } } },
      ])
      .toArray(),
  ]);

  const trend: { month: string; revenue: number; cogs: number; profit: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    const rev = revenueTrendAgg.find((x) => x._id === key)?.total ?? 0;
    const cg = -(cogsTrendAgg.find((x) => x._id === key)?.total ?? 0);
    trend.push({ month: key, revenue: rev, cogs: cg, profit: rev - cg });
  }

  res.json({
    success: true,
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    revenue,
    cogs,
    grossProfit,
    grossMarginPct,
    shrinkage,
    giftsAndGiveaways,
    expensesByCategory,
    totalExpenses,
    netProfit,
    netMarginPct,
    trend,
  });
}

// Purely informational — a point-in-time snapshot of open shipments, not a date-ranged flow figure
// like revenue/COGS/expenses, and deliberately never folded into netProfit above (see the comment
// on getProfitAndLoss's cogs/shrinkage functions for why: a purchase isn't a P&L expense until it's
// sold or confirmed lost, so recognizing it here too would double-count every sale).
//
// Split by each supplier's own paymentType rather than one blended "committed" number, because the
// two halves mean genuinely different things: a 'credit' supplier's outstanding shipments are a
// real liability (money you owe but haven't paid), while a 'prepaid' supplier's are cash that's
// already left the business, just sitting as inventory still in transit. Defaults to 'prepaid' for
// any supplier that's never had this set (see supplierDto in inventoryController.ts) — the common
// case for this system's actual users — and for shipments with no supplier at all.
export async function getCommittedToSuppliers(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();

  const [suppliers, shipments] = await Promise.all([
    db.collection('suppliers').find({ tenantId }, { projection: { name: 1, paymentType: 1 } }).toArray(),
    db.collection('shipments').find({ tenantId, status: 'open' }).toArray(),
  ]);
  const paymentTypeById = new Map(suppliers.map((s) => [s._id.toString(), (s.paymentType as string) ?? 'prepaid']));
  const nameById = new Map(suppliers.map((s) => [s._id.toString(), s.name as string]));

  const empty = () => ({ total: 0, overdueTotal: 0, shipmentCount: 0, overdueShipmentCount: 0 });
  const owedToSuppliers = empty();
  const prepaidInTransit = empty();
  const bySupplierMap = new Map<string, { supplierId: string | null; supplierName: string; paymentType: 'prepaid' | 'credit'; total: number; overdueTotal: number; shipmentCount: number }>();

  for (const s of shipments) {
    const outstanding = s.quantityOrdered - s.quantityReceived - s.quantityWrittenOff;
    if (outstanding <= 0) continue;
    const value = outstanding * (s.unitCost ?? 0);
    const isOverdue = s.expectedAt != null && new Date(s.expectedAt) < now;
    const supplierId = (s.supplierId as string) ?? null;
    const paymentType: 'prepaid' | 'credit' = supplierId && paymentTypeById.get(supplierId) === 'credit' ? 'credit' : 'prepaid';
    const bucket = paymentType === 'credit' ? owedToSuppliers : prepaidInTransit;

    bucket.total += value;
    bucket.shipmentCount += 1;
    if (isOverdue) {
      bucket.overdueTotal += value;
      bucket.overdueShipmentCount += 1;
    }

    const key = supplierId ?? 'unknown';
    const entry = bySupplierMap.get(key) ?? {
      supplierId,
      supplierName: (supplierId && nameById.get(supplierId)) || s.supplierName || 'Unknown supplier',
      paymentType,
      total: 0,
      overdueTotal: 0,
      shipmentCount: 0,
    };
    entry.total += value;
    if (isOverdue) entry.overdueTotal += value;
    entry.shipmentCount += 1;
    bySupplierMap.set(key, entry);
  }

  res.json({
    success: true,
    owedToSuppliers,
    prepaidInTransit,
    bySupplier: [...bySupplierMap.values()].sort((a, b) => b.total - a.total),
  });
}
