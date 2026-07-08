import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { AdChannel, AdPerformanceProductRowDTO, AdPerformanceReportDTO } from '@zetsales/shared';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { resolveRange } from '../utils/dateRange.js';
import { maxRankField } from './analyticsController.js';

const AD_CHANNELS: AdChannel[] = ['Meta', 'TikTok', 'Google', 'Other'];

// Ad-cost entries live in the same `expenses` collection Accounting already owns, tagged
// `category: 'Advertising'` plus a `productId`/`productTitle`/`channel` — that's what makes them
// automatically count toward Accounting's P&L totalExpenses and the existing Marketing ROAS card
// (analyticsController.getMarketingRoas) with zero changes to either. `productId: { $ne: null }`
// is what distinguishes an ad-cost entry from a plain, product-less Accounting expense that also
// happens to use the 'Advertising' category.
function adCostDto(doc: any) {
  return {
    id: doc._id.toString(),
    productId: doc.productId,
    productTitle: doc.productTitle,
    channel: doc.channel,
    amount: doc.amount,
    date: new Date(doc.date).toISOString(),
    note: doc.note ?? null,
    createdBy: doc.createdBy ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export async function listAdCosts(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const match: Record<string, unknown> = { tenantId, category: 'Advertising', productId: { $ne: null } };
  if (typeof req.query.productId === 'string') match.productId = req.query.productId;
  if (typeof req.query.channel === 'string' && AD_CHANNELS.includes(req.query.channel as AdChannel)) match.channel = req.query.channel;
  const dateFrom = typeof req.query.dateFrom === 'string' ? new Date(req.query.dateFrom) : null;
  const dateTo = typeof req.query.dateTo === 'string' ? new Date(req.query.dateTo) : null;
  if (dateFrom || dateTo) {
    const date: Record<string, Date> = {};
    if (dateFrom) date.$gte = dateFrom;
    if (dateTo) date.$lte = dateTo;
    match.date = date;
  }
  const docs = await db.collection('expenses').find(match).sort({ date: -1 }).toArray();
  res.json({ success: true, entries: docs.map(adCostDto) });
}

const adCostSchema = z.object({
  productId: z.string().trim().min(1),
  productTitle: z.string().trim().min(1),
  channel: z.enum(['Meta', 'TikTok', 'Google', 'Other']),
  amount: z.number().positive(),
  date: z.string().trim().min(1),
  note: z.string().trim().optional().or(z.literal('')),
});

export async function createAdCost(req: AuthenticatedRequest, res: Response) {
  const parsed = adCostSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A product, channel, amount, and date are required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();
  const doc = {
    tenantId,
    category: 'Advertising',
    productId: parsed.data.productId,
    productTitle: parsed.data.productTitle,
    channel: parsed.data.channel,
    amount: parsed.data.amount,
    date: new Date(parsed.data.date),
    note: parsed.data.note || null,
    createdBy: req.user!.email,
    createdAt: now,
    updatedAt: now,
  };
  const result = await db.collection('expenses').insertOne(doc);
  res.json({ success: true, entry: adCostDto({ ...doc, _id: result.insertedId }) });
}

export async function deleteAdCost(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid ad cost entry.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await db.collection('expenses').deleteOne({ _id: new ObjectId(req.params.id), tenantId, productId: { $ne: null } });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Ad cost entry not found.' });
    return;
  }
  res.json({ success: true });
}

// The main report: joins manually-logged ad spend (grouped by product) against real order
// outcomes for the same window, so CPA/cost-per-delivered reflect confirmed and delivered orders,
// not just clicks or raw order count. Grouped by `productTitle` rather than SKU — a product can
// have several variants/SKUs, and ProductListItemDTO (what a seller actually picks from) only
// exposes a parent-product title, so title is the real join key here (see analyticsController's
// getProductPerformance for the SKU-level equivalent used elsewhere).
export async function getAdPerformance(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  const channel = typeof req.query.channel === 'string' && AD_CHANNELS.includes(req.query.channel as AdChannel) ? (req.query.channel as AdChannel) : undefined;
  const range = typeof req.query.range === 'string' ? req.query.range : 'last30';
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  const { current } = resolveRange(range, from, to);

  const adSpendMatch: Record<string, unknown> = {
    tenantId,
    category: 'Advertising',
    productId: { $ne: null },
    date: { $gte: current.from, $lt: current.to },
  };
  if (channel) adSpendMatch.channel = channel;

  const orderMatch: Record<string, unknown> = { tenantId, createdAt: { $gte: current.from, $lt: current.to } };
  if (storeId && storeId !== 'all') orderMatch.storeId = storeId;

  const [spendRows, channelRows, orderRows] = await Promise.all([
    db
      .collection('expenses')
      .aggregate([{ $match: adSpendMatch }, { $group: { _id: '$productTitle', productId: { $first: '$productId' }, spend: { $sum: '$amount' } } }])
      .toArray(),
    db
      .collection('expenses')
      .aggregate([{ $match: adSpendMatch }, { $group: { _id: '$channel', spend: { $sum: '$amount' } } }])
      .toArray(),
    db
      .collection('orders')
      .aggregate([
        { $match: orderMatch },
        { $addFields: { maxRank: maxRankField } },
        { $unwind: '$lineItems' },
        {
          $group: {
            _id: '$lineItems.title',
            confirmedOrders: { $sum: { $cond: [{ $gte: ['$maxRank', 1] }, 1, 0] } },
            deliveredOrders: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
            revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } },
          },
        },
      ])
      .toArray(),
  ]);

  const orderByTitle = new Map(orderRows.map((r) => [r._id as string, r]));

  const byProduct: AdPerformanceProductRowDTO[] = spendRows
    .map((r) => {
      const perf = orderByTitle.get(r._id as string);
      const confirmedOrders = perf?.confirmedOrders ?? 0;
      const deliveredOrders = perf?.deliveredOrders ?? 0;
      const revenue = perf?.revenue ?? 0;
      const spend = r.spend as number;
      return {
        productId: r.productId ?? 'unknown',
        productTitle: r._id ?? 'Untitled product',
        spend,
        confirmedOrders,
        deliveredOrders,
        revenue,
        cpa: confirmedOrders > 0 ? Math.round((spend / confirmedOrders) * 100) / 100 : null,
        costPerDelivered: deliveredOrders > 0 ? Math.round((spend / deliveredOrders) * 100) / 100 : null,
        roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);

  const totalSpend = byProduct.reduce((sum, r) => sum + r.spend, 0);
  const totalConfirmedOrders = byProduct.reduce((sum, r) => sum + r.confirmedOrders, 0);
  const totalDeliveredOrders = byProduct.reduce((sum, r) => sum + r.deliveredOrders, 0);

  const dto: AdPerformanceReportDTO = {
    summary: {
      totalSpend,
      totalConfirmedOrders,
      totalDeliveredOrders,
      blendedCpa: totalConfirmedOrders > 0 ? Math.round((totalSpend / totalConfirmedOrders) * 100) / 100 : null,
      blendedCostPerDelivered: totalDeliveredOrders > 0 ? Math.round((totalSpend / totalDeliveredOrders) * 100) / 100 : null,
    },
    byProduct,
    byChannel: channelRows.map((r) => ({ channel: r._id as AdChannel, spend: r.spend as number })).sort((a, b) => b.spend - a.spend),
  };
  res.json({ success: true, adPerformance: dto });
}
