import type { Response } from 'express';
import { z } from 'zod';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type {
  AnalyticsBreakdownDTO,
  AnalyticsBreakdownRowDTO,
  AnalyticsCardKey,
  AnalyticsLayoutDTO,
  AnalyticsSeriesDTO,
  AnalyticsSeriesWindowDTO,
  AnalyticsSummaryDTO,
  CodCashflowDTO,
  ConfirmationPerformanceDTO,
  FulfillmentTimeDTO,
  MetricWithTrendDTO,
  NewVsReturningDTO,
  OrderFunnelDTO,
  ProductRankingDTO,
  RepeatCustomersDTO,
  RfmSegmentsDTO,
  RiskLabel,
  TopCustomerRowDTO,
  ItemsBoughtTogetherDTO,
  SellThroughDTO,
  StockoutCancellationsDTO,
  WeeklyPatternDTO,
  InventoryThroughputDTO,
  ShippingTrackingDTO,
  NewCustomerRevenueDTO,
  DeadStockDTO,
  DuplicateOrdersDTO,
  CourierReconciliationDTO,
  CourierHandoverReportDTO,
  CourierHandoverReportRowDTO,
  MarketingRoasDTO,
  AddressQualityDTO,
  SlaBreachDTO,
  HoldReasonsDTO,
  RtoLossDTO,
  OrderReturnReportDTO,
  MarginWaterfallDTO,
  CohortRetentionDTO,
  CohortRetentionRowDTO,
  BlocklistHitRateDTO,
  RescheduleEffectivenessDTO,
  ProductPerformanceDTO,
  EmployeeActivityDTO,
  ProductCourierHistoryDTO,
  SpamOrdersDTO,
} from '@zetsales/shared';
import { resolveRange, bucketDate, bucketLabel, bucketIndexExpr, bucketIndexJs, type TrendGranularity, type TrendWindow, type ComparisonMode } from '../utils/dateRange.js';
import { COGS_REASONS } from './accountingController.js';

// --- Shared query parsing ---

interface BaseQuery {
  storeId?: string;
  range: string;
  from?: string;
  to?: string;
  comparisonMode?: ComparisonMode;
  comparisonFrom?: string;
  comparisonTo?: string;
}

const COMPARISON_MODES = ['previousPeriod', 'previousYear', 'previousYearMatchDay', 'custom', 'none'];

function parseBaseQuery(req: AuthenticatedRequest): BaseQuery {
  return {
    storeId: typeof req.query.storeId === 'string' ? req.query.storeId : undefined,
    range: typeof req.query.range === 'string' ? req.query.range : 'last30',
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
    comparisonMode:
      typeof req.query.comparisonMode === 'string' && COMPARISON_MODES.includes(req.query.comparisonMode)
        ? (req.query.comparisonMode as ComparisonMode)
        : undefined,
    comparisonFrom: typeof req.query.comparisonFrom === 'string' ? req.query.comparisonFrom : undefined,
    comparisonTo: typeof req.query.comparisonTo === 'string' ? req.query.comparisonTo : undefined,
  };
}

// True whenever the caller has explicitly asked for no comparison — the one mode resolveRange
// deliberately doesn't special-case itself (see its own comment), so every AnalyticsSeriesDTO
// builder below checks this directly and blanks its own comparison window/trend when it's set.
function comparisonDisabled(q: BaseQuery): boolean {
  return q.comparisonMode === 'none';
}

function emptySeriesWindow(window: TrendWindow): AnalyticsSeriesWindowDTO {
  return { from: window.from.toISOString(), to: window.to.toISOString(), points: [] };
}

function baseMatch(tenantId: string, storeId: string | undefined): Record<string, unknown> {
  const match: Record<string, unknown> = { tenantId };
  if (storeId && storeId !== 'all') match.storeId = storeId;
  return match;
}

function pctTrend(current: number, comparison: number): number | null {
  if (comparison > 0) return Math.round(((current - comparison) / comparison) * 100);
  return current > 0 ? 100 : null;
}

// --- Generic bucketed time-series helper — powers every "X over time" card. `valueExpr` is a
// Mongo accumulator expression (e.g. `{ $sum: '$total' }` or `{ $avg: '$total' }`) so the same
// bucketing/windowing logic isn't rewritten per metric. ---

function materializeSeriesPoints(agg: any[], window: TrendWindow, granularity: TrendGranularity, bucketCount: number): AnalyticsSeriesWindowDTO {
  const byIndex = new Map(agg.map((a) => [a._id, Number(a.value) || 0]));
  const points = [];
  for (let i = 0; i < bucketCount; i++) {
    points.push({
      index: i,
      label: bucketLabel(granularity, window.from, i),
      date: bucketDate(granularity, window.from, i).toISOString(),
      value: byIndex.get(i) ?? 0,
    });
  }
  return { from: window.from.toISOString(), to: window.to.toISOString(), points };
}

// Runs a caller-supplied pipeline (everything up to, but not including, the final bucketing
// $group) and fills in the bucket-index $group + gap-filling — for cases the single-collection
// bucketedWindow can't express, like grouping by an *unwound* subdocument's own date instead of
// the parent document's.
async function bucketedWindowWithPipeline(
  collectionName: string,
  preGroupPipeline: Record<string, unknown>[],
  window: TrendWindow,
  granularity: TrendGranularity,
  bucketCount: number,
  valueExpr: Record<string, unknown>,
  groupDateField: string
): Promise<AnalyticsSeriesWindowDTO> {
  const db = getDb();
  const agg = await db
    .collection(collectionName)
    .aggregate([...preGroupPipeline, { $group: { _id: bucketIndexExpr(granularity, window.from, groupDateField), value: valueExpr } }])
    .toArray();
  return materializeSeriesPoints(agg, window, granularity, bucketCount);
}

async function bucketedWindow(
  collectionName: string,
  match: Record<string, unknown>,
  window: TrendWindow,
  granularity: TrendGranularity,
  bucketCount: number,
  valueExpr: Record<string, unknown>,
  dateField = 'createdAt'
): Promise<AnalyticsSeriesWindowDTO> {
  const db = getDb();
  const agg = await db
    .collection(collectionName)
    .aggregate([
      { $match: { ...match, [dateField]: { $gte: window.from, $lt: window.to } } },
      { $group: { _id: bucketIndexExpr(granularity, window.from, dateField), value: valueExpr } },
    ])
    .toArray();
  return materializeSeriesPoints(agg, window, granularity, bucketCount);
}

async function runAnalyticsSeries(
  match: Record<string, unknown>,
  q: BaseQuery,
  valueExpr: Record<string, unknown>,
  collectionName = 'orders',
  dateField = 'createdAt',
  // 'sum' totals are the sum of the per-bucket points (correct for $sum/$count metrics). 'avg'
  // metrics (e.g. AOV) can NOT be totalled that way — summing N per-bucket averages is not the
  // same number as the true average over the whole window — so those recompute the headline
  // figure directly from one ungrouped aggregation instead of from the chart's bucket points.
  totalMode: 'sum' | 'avg' = 'sum'
): Promise<AnalyticsSeriesDTO> {
  const { granularity, bucketCount, current, comparison } = resolveRange(q.range, q.from, q.to, q.comparisonMode, q.comparisonFrom, q.comparisonTo);
  const skipComparison = comparisonDisabled(q);
  const [currentWindow, comparisonWindow] = await Promise.all([
    bucketedWindow(collectionName, match, current, granularity, bucketCount, valueExpr, dateField),
    skipComparison ? Promise.resolve(emptySeriesWindow(comparison)) : bucketedWindow(collectionName, match, comparison, granularity, bucketCount, valueExpr, dateField),
  ]);
  let totalCurrent: number;
  let totalComparison: number;
  if (totalMode === 'avg') {
    const db = getDb();
    const overallFor = async (window: TrendWindow) => {
      const [agg] = await db
        .collection(collectionName)
        .aggregate([{ $match: { ...match, [dateField]: { $gte: window.from, $lt: window.to } } }, { $group: { _id: null, value: valueExpr } }])
        .toArray();
      return Number(agg?.value) || 0;
    };
    [totalCurrent, totalComparison] = await Promise.all([overallFor(current), skipComparison ? Promise.resolve(0) : overallFor(comparison)]);
  } else {
    totalCurrent = currentWindow.points.reduce((s, p) => s + p.value, 0);
    totalComparison = comparisonWindow.points.reduce((s, p) => s + p.value, 0);
  }
  return { granularity, current: currentWindow, comparison: comparisonWindow, totalCurrent, totalComparison, trend: skipComparison ? null : pctTrend(totalCurrent, totalComparison) };
}

// --- Generic breakdown-by-dimension builder — powers every Pareto/ranked-dimension card. ---

interface BreakdownInput {
  key: string;
  label: string;
  count: number;
  value: number;
  secondaryRate?: number | null;
  secondaryValue?: number | null;
  tertiaryValue?: number | null;
}

function buildBreakdown(rows: BreakdownInput[]): AnalyticsBreakdownDTO {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const totalValue = sorted.reduce((s, r) => s + r.value, 0);
  const totalCount = sorted.reduce((s, r) => s + r.count, 0);
  let cumulative = 0;
  const outRows: AnalyticsBreakdownRowDTO[] = sorted.map((r) => {
    const percentage = totalValue > 0 ? (r.value / totalValue) * 100 : 0;
    cumulative += percentage;
    return {
      key: r.key,
      label: r.label,
      count: r.count,
      value: r.value,
      percentage: Math.round(percentage * 10) / 10,
      cumulativePercentage: Math.round(Math.min(cumulative, 100) * 10) / 10,
      secondaryRate: r.secondaryRate ?? null,
      secondaryValue: r.secondaryValue ?? null,
      tertiaryValue: r.tertiaryValue ?? null,
    };
  });
  return { totalCount, totalValue, rows: outRows };
}

// Highest order-lifecycle rank an order ever reached, from its current stage AND every stage name
// that ever appears in its history log (buildOrderUpdate pushes the new stage's own name as
// `label`, so a plain string match against known stage names recovers "did this order ever get to
// Confirmed/Shipped/Delivered before falling off", even for orders that later got cancelled or
// returned — a non-stage history label like "Order placed" just falls through to the default and
// never wins the $max). Reused by the order funnel and the fulfillment-time card.
function rankExpr(field: string): Record<string, unknown> {
  return {
    $switch: {
      branches: [
        { case: { $eq: [field, 'Confirmed'] }, then: 1 },
        { case: { $eq: [field, 'Processing'] }, then: 2 },
        { case: { $in: [field, ['Ready for Pickup', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending', 'Returned']] }, then: 3 },
        { case: { $in: [field, ['Delivered', 'Partial Delivered']] }, then: 4 },
      ],
      default: 0,
    },
  };
}

export const maxRankField = {
  $max: {
    $concatArrays: [[rankExpr('$stage')], { $map: { input: { $ifNull: ['$history', []] }, as: 'h', in: rankExpr('$$h.label') } }],
  },
};

// --- Layout (customize) ---

const layoutSchema = z.object({
  cards: z.array(z.object({ key: z.string(), hidden: z.boolean() })),
});

export async function getAnalyticsLayout(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const userId = req.user!.id;
  const doc = await db.collection('analyticsLayouts').findOne({ tenantId, userId });
  const layout: AnalyticsLayoutDTO = { cards: doc?.cards ?? [] };
  res.json({ success: true, layout });
}

export async function saveAnalyticsLayout(req: AuthenticatedRequest, res: Response) {
  const parsed = layoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'Invalid layout payload' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const userId = req.user!.id;
  await db
    .collection('analyticsLayouts')
    .updateOne({ tenantId, userId }, { $set: { tenantId, userId, cards: parsed.data.cards, updatedAt: new Date() } }, { upsert: true });
  res.json({ success: true });
}

// --- Entry page KPI strip ---

export async function getAnalyticsSummary(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current, comparison } = resolveRange(q.range, q.from, q.to, q.comparisonMode, q.comparisonFrom, q.comparisonTo);

  async function windowTotals(window: TrendWindow) {
    const [agg] = await db
      .collection('orders')
      .aggregate([
        { $match: { ...match, createdAt: { $gte: window.from, $lt: window.to } } },
        { $addFields: { maxRank: maxRankField } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalSales: { $sum: '$total' },
            // Rank-based, not a current-stage check: an order held (On Hold) straight from Pending —
            // never actually confirmed — would otherwise slip through a "$stage not in
            // [Pending,Flagged]" test, since heldFromStage lets an order go On Hold from any stage.
            // maxRankField instead asks "does this order's history ever contain a 'Confirmed' label",
            // the same definition getOrderFunnel/getConfirmationPerformance already use.
            confirmedOrBeyond: { $sum: { $cond: [{ $gte: ['$maxRank', 1] }, 1, 0] } },
            shippedOrBeyond: { $sum: { $cond: [{ $in: ['$stage', ['Ready for Pickup', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending', 'Delivered', 'Partial Delivered', 'Returned']] }, 1, 0] } },
            delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
            rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
            codOutstanding: { $sum: { $cond: [{ $and: [{ $eq: ['$paymentStatus', 'COD Pending'] }, { $not: [{ $in: ['$stage', ['Cancelled', 'Returned']] }] }] }, '$total', 0] } },
            cogsKnownRevenue: { $sum: { $cond: [{ $ne: ['$cogsTotal', null] }, '$total', 0] } },
            cogsTotal: { $sum: { $cond: [{ $ne: ['$cogsTotal', null] }, '$cogsTotal', 0] } },
          },
        },
      ])
      .toArray();
    const totalOrders = agg?.totalOrders ?? 0;
    const totalSales = agg?.totalSales ?? 0;
    const cogsKnownRevenue = agg?.cogsKnownRevenue ?? 0;
    const cogsTotal = agg?.cogsTotal ?? 0;
    // Delivered/RTO rate are conventionally "of what shipped, what came back" — dividing by every
    // order placed (including ones still Pending) would dilute both rates and understate them.
    const shippedOrBeyond = agg?.shippedOrBeyond ?? 0;
    return {
      totalOrders,
      totalSales,
      aov: totalOrders > 0 ? totalSales / totalOrders : 0,
      confirmationRate: totalOrders > 0 ? (agg.confirmedOrBeyond / totalOrders) * 100 : 0,
      deliveredRate: shippedOrBeyond > 0 ? (agg.delivered / shippedOrBeyond) * 100 : 0,
      rtoRate: shippedOrBeyond > 0 ? (agg.rto / shippedOrBeyond) * 100 : 0,
      codOutstanding: agg?.codOutstanding ?? 0,
      grossProfitMargin: cogsKnownRevenue > 0 ? ((cogsKnownRevenue - cogsTotal) / cogsKnownRevenue) * 100 : 0,
    };
  }

  const skipComparison = comparisonDisabled(q);
  const cur = await windowTotals(current);
  const cmp = skipComparison ? cur : await windowTotals(comparison);
  const metric = (curVal: number, cmpVal: number): MetricWithTrendDTO => ({ value: Math.round(curVal * 100) / 100, trend: skipComparison ? null : pctTrend(curVal, cmpVal) });

  const summary: AnalyticsSummaryDTO = {
    totalSales: metric(cur.totalSales, cmp.totalSales),
    totalOrders: metric(cur.totalOrders, cmp.totalOrders),
    aov: metric(cur.aov, cmp.aov),
    confirmationRate: metric(cur.confirmationRate, cmp.confirmationRate),
    deliveredRate: metric(cur.deliveredRate, cmp.deliveredRate),
    rtoRate: metric(cur.rtoRate, cmp.rtoRate),
    codOutstanding: metric(cur.codOutstanding, cmp.codOutstanding),
    grossProfitMargin: metric(cur.grossProfitMargin, cmp.grossProfitMargin),
  };
  res.json({ success: true, summary });
}

// --- Phase 1: Orders & Sales core ---

const FUNNEL_STAGES: { rank: number; stage: string }[] = [
  { rank: 0, stage: 'Pending' },
  { rank: 1, stage: 'Confirmed' },
  { rank: 2, stage: 'Processing' },
  { rank: 3, stage: 'Shipped' },
  { rank: 4, stage: 'Delivered' },
];

export async function getOrderFunnel(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const [result] = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      { $addFields: { maxRank: maxRankField } },
      {
        $facet: Object.fromEntries(FUNNEL_STAGES.map((s) => [`r${s.rank}`, [{ $match: { maxRank: { $gte: s.rank } } }, { $count: 'c' }]])),
      },
    ])
    .toArray();

  const counts = FUNNEL_STAGES.map((s) => result?.[`r${s.rank}`]?.[0]?.c ?? 0);
  const totalEntered = counts[0] ?? 0;
  const stages = FUNNEL_STAGES.map((s, i) => ({
    stage: s.stage,
    count: counts[i],
    conversionFromPrevious: i === 0 ? null : counts[i - 1] > 0 ? Math.round((counts[i] / counts[i - 1]) * 1000) / 10 : null,
    conversionFromStart: totalEntered > 0 ? Math.round((counts[i] / totalEntered) * 1000) / 10 : 0,
  }));

  const dto: OrderFunnelDTO = { totalEntered, stages };
  res.json({ success: true, funnel: dto });
}

export async function getConfirmationPerformance(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        confirmEvent: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Confirmed'] } } }, 0] },
        // History is chronological (each event is $push-appended), so the first array match is
        // also the earliest one — same trick already used for confirmEvent.
        firstCallEvent: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Call attempt'] } } }, 0] },
      },
    },
    {
      $addFields: {
        timeToConfirmMinutes: { $cond: [{ $ifNull: ['$confirmEvent', false] }, { $divide: [{ $subtract: ['$confirmEvent.at', '$createdAt'] }, 60000] }, null] },
        timeToFirstContactMinutes: { $cond: [{ $ifNull: ['$firstCallEvent', false] }, { $divide: [{ $subtract: ['$firstCallEvent.at', '$createdAt'] }, 60000] }, null] },
        confirmedBy: { $ifNull: ['$confirmEvent.by', null] },
        wasConfirmed: { $cond: [{ $ifNull: ['$confirmEvent', false] }, 1, 0] },
        clampedAttempts: { $min: [{ $ifNull: ['$callAttempts', 0] }, 4] },
      },
    },
    {
      $facet: {
        summary: [
          {
            $group: {
              _id: null,
              totalPending: { $sum: 1 },
              totalConfirmed: { $sum: '$wasConfirmed' },
              avgCallAttempts: { $avg: '$callAttempts' },
              avgTimeToConfirmMinutes: { $avg: '$timeToConfirmMinutes' },
              avgTimeToFirstContactMinutes: { $avg: '$timeToFirstContactMinutes' },
            },
          },
        ],
        distribution: [{ $group: { _id: '$clampedAttempts', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        byAgent: [
          { $match: { confirmedBy: { $ne: null } } },
          {
            $group: {
              _id: '$confirmedBy',
              confirmedCount: { $sum: 1 },
              avgCallAttempts: { $avg: '$callAttempts' },
              avgTimeToConfirmMinutes: { $avg: '$timeToConfirmMinutes' },
              delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
              rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
            },
          },
          { $sort: { confirmedCount: -1 } },
        ],
      },
    },
  ];

  const [result] = await db.collection('orders').aggregate(pipeline).toArray();
  const s = result?.summary?.[0];
  const dto: ConfirmationPerformanceDTO = {
    totalPending: s?.totalPending ?? 0,
    totalConfirmed: s?.totalConfirmed ?? 0,
    confirmationRate: s?.totalPending > 0 ? Math.round((s.totalConfirmed / s.totalPending) * 1000) / 10 : null,
    avgTimeToConfirmMinutes: s?.avgTimeToConfirmMinutes != null ? Math.round(s.avgTimeToConfirmMinutes) : null,
    avgTimeToFirstContactMinutes: s?.avgTimeToFirstContactMinutes != null ? Math.round(s.avgTimeToFirstContactMinutes) : null,
    avgCallAttempts: s?.avgCallAttempts != null ? Math.round(s.avgCallAttempts * 10) / 10 : null,
    callAttemptsDistribution: (result?.distribution ?? []).map((d: any) => ({ attempts: d._id, count: d.count })),
    byAgent: (result?.byAgent ?? []).map((a: any) => {
      const resolved = a.delivered + a.rto;
      const deliveredRate = resolved > 0 ? (a.delivered / resolved) * 100 : null;
      const attemptsForScore = Math.max(1, a.avgCallAttempts ?? 1);
      return {
        agent: a._id,
        confirmedCount: a.confirmedCount,
        avgCallAttempts: a.avgCallAttempts != null ? Math.round(a.avgCallAttempts * 10) / 10 : null,
        avgTimeToConfirmMinutes: a.avgTimeToConfirmMinutes != null ? Math.round(a.avgTimeToConfirmMinutes) : null,
        deliveredRate: deliveredRate != null ? Math.round(deliveredRate * 10) / 10 : null,
        rtoRate: resolved > 0 ? Math.round((a.rto / resolved) * 1000) / 10 : null,
        compositeScore: deliveredRate != null ? Math.round((deliveredRate / attemptsForScore) * 10) / 10 : null,
      };
    }),
  };
  res.json({ success: true, performance: dto });
}

export async function getSalesOverTime(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const series = await runAnalyticsSeries(baseMatch(tenantId, q.storeId), q, { $sum: '$total' });
  res.json({ success: true, series });
}

export async function getAovOverTime(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const series = await runAnalyticsSeries(baseMatch(tenantId, q.storeId), q, { $avg: '$total' }, 'orders', 'createdAt', 'avg');
  res.json({ success: true, series });
}

export async function getSalesByStore(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const rows = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: '$storeId', count: { $sum: 1 }, revenue: { $sum: '$total' } } }])
    .toArray();

  const storeIds: string[] = rows.map((r) => r._id).filter(Boolean);
  const stores = await db
    .collection('stores')
    .find({ tenantId, _id: { $in: storeIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const storeById = new Map(stores.map((s) => [s._id.toString(), s]));

  const breakdown = buildBreakdown(
    rows.map((r) => {
      const store = storeById.get(r._id);
      return {
        key: r._id ?? 'unknown',
        label: store ? `${store.displayName} (${store.platform === 'shopify' ? 'Shopify' : 'WooCommerce'})` : 'Unknown store',
        count: r.count,
        value: r.revenue,
      };
    })
  );
  res.json({ success: true, breakdown });
}

export async function getTopProducts(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      { $unwind: '$lineItems' },
      {
        $group: {
          // Order line items only carry sku/title (no productId), so sku — falling back to title
          // when a line item has no sku — is the most granular real grouping key available.
          _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] },
          title: { $first: '$lineItems.title' },
          image: { $first: '$lineItems.image' },
          unitsSold: { $sum: '$lineItems.quantity' },
          revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ])
    .toArray();

  const dto: ProductRankingDTO = {
    rows: rows.map((r) => ({
      productId: r._id ?? 'unknown',
      title: r.title ?? 'Untitled product',
      image: r.image ?? null,
      unitsSold: r.unitsSold,
      orderCount: r.orderCount,
      revenue: r.revenue,
      cogs: null,
      grossProfit: null,
      marginPercent: null,
      returnRate: null,
    })),
  };
  res.json({ success: true, ranking: dto });
}

export async function getFulfillmentTime(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const docs = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $project: {
          createdAt: 1,
          confirmedAt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Confirmed'] } } }, 0] },
          // Label is 'Ready for Pickup', not 'Shipped' — this metric measures how fast staff pack
          // and stage an order for courier collection, not when the courier physically takes it.
          shippedAt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Ready for Pickup'] } } }, 0] },
          deliveredAt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $in: ['$$h.label', ['Delivered', 'Partial Delivered']] } } }, 0] },
        },
      },
    ])
    .toArray();

  function diffs(fromKey: string, toKey: string): number[] {
    const out: number[] = [];
    for (const d of docs) {
      const from = fromKey === 'createdAt' ? d.createdAt : d[fromKey]?.at;
      const to = d[toKey]?.at;
      if (from && to) {
        const hours = (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;
        if (hours >= 0) out.push(hours);
      }
    }
    return out;
  }

  function stat(values: number[]): { avgHours: number | null; medianHours: number | null } {
    if (values.length === 0) return { avgHours: null, medianHours: null };
    const sorted = [...values].sort((a, b) => a - b);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    return { avgHours: Math.round(avg * 10) / 10, medianHours: Math.round(median * 10) / 10 };
  }

  const dto: FulfillmentTimeDTO = {
    stages: [
      { fromStage: 'Pending', toStage: 'Confirmed', ...stat(diffs('createdAt', 'confirmedAt')) },
      { fromStage: 'Confirmed', toStage: 'Ready for Pickup', ...stat(diffs('confirmedAt', 'shippedAt')) },
      { fromStage: 'Ready for Pickup', toStage: 'Delivered', ...stat(diffs('shippedAt', 'deliveredAt')) },
      { fromStage: 'Pending', toStage: 'Delivered', ...stat(diffs('createdAt', 'deliveredAt')) },
    ],
  };
  res.json({ success: true, fulfillment: dto });
}

// --- Phase 2: Delivery / Courier — the COD-specific core ---

export async function getCourierPerformance(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.courierPartner = { $ne: null };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $addFields: {
          shippedEvt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Ready for Pickup'] } } }, 0] },
          deliveredEvt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $in: ['$$h.label', ['Delivered', 'Partial Delivered']] } } }, 0] },
        },
      },
      {
        $addFields: {
          deliveryDays: {
            $cond: [{ $and: [{ $ifNull: ['$shippedEvt', false] }, { $ifNull: ['$deliveredEvt', false] }] }, { $divide: [{ $subtract: ['$deliveredEvt.at', '$shippedEvt.at'] }, 86_400_000] }, null],
          },
        },
      },
      {
        $group: {
          _id: '$courierPartner',
          total: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
          inTransit: { $sum: { $cond: [{ $eq: ['$stage', 'Out for Delivery'] }, 1, 0] } },
          revenue: { $sum: '$total' },
          avgDeliveryDays: { $avg: '$deliveryDays' },
        },
      },
    ])
    .toArray();

  const breakdown = buildBreakdown(
    rows.map((r) => {
      const resolved = r.delivered + r.rto;
      return {
        key: r._id,
        label: r._id,
        count: r.total,
        value: r.revenue,
        secondaryRate: resolved > 0 ? Math.round((r.delivered / resolved) * 1000) / 10 : null,
        secondaryValue: r.avgDeliveryDays != null ? Math.round(r.avgDeliveryDays * 10) / 10 : null,
        tertiaryValue: r.inTransit,
      };
    })
  );
  res.json({ success: true, breakdown });
}

export async function getDeliveryZones(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: { $ifNull: ['$deliveryZone', 'Unspecified'] },
          total: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
          revenue: { $sum: '$total' },
        },
      },
    ])
    .toArray();

  const breakdown = buildBreakdown(
    rows.map((r) => {
      const resolved = r.delivered + r.rto;
      return {
        key: r._id,
        label: r._id,
        count: r.total,
        value: r.revenue,
        secondaryRate: resolved > 0 ? Math.round((r.delivered / resolved) * 1000) / 10 : null,
        secondaryValue: resolved > 0 ? Math.round((r.rto / resolved) * 1000) / 10 : null,
      };
    })
  );
  res.json({ success: true, breakdown });
}

export async function getCancelReasons(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.stage = 'Cancelled';
  match.cancelReason = { $ne: null };

  const rows = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: '$cancelReason', count: { $sum: 1 }, value: { $sum: '$total' } } }])
    .toArray();

  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id, label: r._id, count: r.count, value: r.value })));
  res.json({ success: true, breakdown });
}

// Snapshot, not a period-bounded metric: `holdReason` is cleared the moment an order resumes (see
// buildOrderUpdate), so it can only ever describe orders that are *currently* sitting on hold, not
// "every hold that happened during this date range" — the date filter here just scopes by when the
// order was originally placed, not when it went on hold.
export async function getHoldReasons(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.stage = 'On Hold';
  match.holdReason = { $ne: null };

  const rows = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: '$holdReason', count: { $sum: 1 }, value: { $sum: '$total' } } }])
    .toArray();

  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id, label: r._id, count: r.count, value: r.value })));

  // Aging: how long each currently-on-hold order has been sitting — the *last* 'On Hold' history
  // entry (an order can be held, resumed, and held again; only the current stint matters).
  const agingDocs = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $project: {
          total: 1,
          heldEvt: {
            $let: {
              vars: { holdEvents: { $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'On Hold'] } } } },
              in: { $arrayElemAt: ['$$holdEvents', -1] },
            },
          },
        },
      },
    ])
    .toArray();

  const buckets = [
    { label: '0-6h', min: 0, max: 6, count: 0, value: 0 },
    { label: '6-24h', min: 6, max: 24, count: 0, value: 0 },
    { label: '1-3d', min: 24, max: 72, count: 0, value: 0 },
    { label: '3d+', min: 72, max: Infinity, count: 0, value: 0 },
  ];
  for (const d of agingDocs) {
    const at = d.heldEvt?.at;
    if (!at) continue;
    // Clamp to 0: minor clock skew can put `at` a few ms in the future, which would otherwise fail
    // every bucket's `hours >= min` test and fall through to the "oldest" bucket — the opposite of
    // what a just-created hold should show.
    const hours = Math.max(0, (Date.now() - new Date(at).getTime()) / 3_600_000);
    const bucket = buckets.find((b) => hours >= b.min && hours < b.max) ?? buckets[buckets.length - 1];
    bucket.count += 1;
    bucket.value += d.total;
  }

  const dto: HoldReasonsDTO = { breakdown, aging: buckets.map((b) => ({ label: b.label, count: b.count, value: Math.round(b.value * 100) / 100 })) };
  res.json({ success: true, holdReasons: dto });
}

// --- Phase 3: Customers & Risk ---
//
// There's no dedicated Customer collection (see packages/shared's OrderDTO comments) — every
// customer-level card here is computed by grouping the *whole* orders history by customerPhone,
// which is why these ignore the selected date range and use `storeId` only: recency/frequency/
// lifetime spend/delivery success are lifetime facts about a person, not something a 30-day window
// can answer without becoming misleading (a loyal customer who didn't order this month isn't
// "new").

// Exported for reuse by customersController.ts's directory/detail views — the customer-management
// pages need the exact same lifetime facts (and the exact same Champions/At-risk/Risky
// classification) analytics already computes, not a second definition that could drift from this one.
export interface CustomerLifetimeRow {
  phone: string;
  name: string | null;
  orderCount: number;
  totalSpend: number;
  lastOrderAt: Date;
  delivered: number;
  resolved: number;
}

export async function computeCustomerLifetimeStats(tenantId: string, storeId: string | undefined): Promise<CustomerLifetimeRow[]> {
  const db = getDb();
  const match: Record<string, unknown> = { tenantId, customerPhone: { $ne: null } };
  if (storeId && storeId !== 'all') match.storeId = storeId;

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      // $sort before $group so $last is meaningful (a bare $group has no defined document order) —
      // this makes "name" the customer's most recent order's name, not an arbitrary one.
      { $sort: { createdAt: 1 } },
      {
        $group: {
          _id: '$customerPhone',
          name: { $last: '$customerName' },
          orderCount: { $sum: 1 },
          totalSpend: { $sum: '$total' },
          lastOrderAt: { $max: '$createdAt' },
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered', 'Cancelled', 'Returned']] }, 1, 0] } },
        },
      },
    ])
    .toArray();

  return rows.map((r) => ({
    phone: r._id,
    name: r.name ?? null,
    orderCount: r.orderCount,
    totalSpend: r.totalSpend,
    lastOrderAt: new Date(r.lastOrderAt),
    delivered: r.delivered,
    resolved: r.resolved,
  }));
}

export async function attachBlockedFlag(tenantId: string, phones: string[]): Promise<Set<string>> {
  if (phones.length === 0) return new Set();
  const db = getDb();
  const blocked = await db.collection('blockedCustomers').find({ tenantId, phone: { $in: phones } }).project({ phone: 1 }).toArray();
  return new Set(blocked.map((b) => b.phone));
}

export function successRateOf(row: CustomerLifetimeRow): number | null {
  return row.resolved > 0 ? Math.round((row.delivered / row.resolved) * 1000) / 10 : null;
}

export function recencyDaysOf(row: CustomerLifetimeRow): number {
  return Math.round((Date.now() - row.lastOrderAt.getTime()) / 86_400_000);
}

function toTopCustomerRow(row: CustomerLifetimeRow, blockedPhones: Set<string>, segment: string | null): TopCustomerRowDTO {
  return {
    phone: row.phone,
    name: row.name,
    orderCount: row.orderCount,
    totalSpend: row.totalSpend,
    deliveredCount: row.delivered,
    successRate: successRateOf(row),
    lastOrderAt: row.lastOrderAt.toISOString(),
    isBlocked: blockedPhones.has(row.phone),
    segment,
    recencyDays: recencyDaysOf(row),
  };
}

export async function getNewVsReturning(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { granularity, bucketCount, current, comparison } = resolveRange(q.range, q.from, q.to, q.comparisonMode, q.comparisonFrom, q.comparisonTo);
  const skipComparison = comparisonDisabled(q);

  const firstOrderRows = await db
    .collection('orders')
    .aggregate([{ $match: { ...match, customerPhone: { $ne: null } } }, { $group: { _id: '$customerPhone', first: { $min: '$createdAt' } } }])
    .toArray();
  const firstOrderByPhone = new Map(firstOrderRows.map((r) => [r._id as string, new Date(r.first).getTime()]));

  async function classifyWindow(window: TrendWindow) {
    const orders = await db
      .collection('orders')
      .find({ ...match, createdAt: { $gte: window.from, $lt: window.to } })
      .project({ createdAt: 1, customerPhone: 1 })
      .toArray();

    const points = Array.from({ length: bucketCount }, (_, i) => ({
      index: i,
      label: bucketLabel(granularity, window.from, i),
      date: bucketDate(granularity, window.from, i).toISOString(),
      newCustomers: 0,
      returningCustomers: 0,
    }));

    for (const o of orders) {
      const idx = bucketIndexJs(granularity, window.from, new Date(o.createdAt));
      if (idx < 0 || idx >= bucketCount) continue;
      const isNew = !o.customerPhone || firstOrderByPhone.get(o.customerPhone) === new Date(o.createdAt).getTime();
      if (isNew) points[idx].newCustomers += 1;
      else points[idx].returningCustomers += 1;
    }
    return { from: window.from.toISOString(), to: window.to.toISOString(), points };
  }

  const [currentWindow, comparisonWindow] = await Promise.all([
    classifyWindow(current),
    skipComparison ? Promise.resolve({ from: comparison.from.toISOString(), to: comparison.to.toISOString(), points: [] }) : classifyWindow(comparison),
  ]);
  const dto: NewVsReturningDTO = { granularity, current: currentWindow, comparison: comparisonWindow };
  res.json({ success: true, series: dto });
}

export async function getTopCustomers(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const stats = await computeCustomerLifetimeStats(tenantId, q.storeId);

  const oneTimeCount = stats.filter((s) => s.orderCount === 1).length;
  const repeatCount = stats.filter((s) => s.orderCount >= 2).length;
  const totalRevenue = stats.reduce((s, r) => s + r.totalSpend, 0);
  const repeatRevenue = stats.filter((s) => s.orderCount >= 2).reduce((s, r) => s + r.totalSpend, 0);

  const top = [...stats].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 50);
  const blockedPhones = await attachBlockedFlag(tenantId, top.map((r) => r.phone));

  const dto: RepeatCustomersDTO = {
    oneTimeCount,
    repeatCount,
    repeatRevenueShare: totalRevenue > 0 ? Math.round((repeatRevenue / totalRevenue) * 1000) / 10 : null,
    topCustomers: top.map((r) => toTopCustomerRow(r, blockedPhones, r.orderCount >= 2 ? 'Repeat' : 'One-time')),
  };
  res.json({ success: true, repeatCustomers: dto });
}

// Shared with customersController.ts — same single-source-of-truth reasoning as
// computeCustomerLifetimeStats above.
export function riskLabelOf(row: CustomerLifetimeRow): RiskLabel {
  if (row.resolved === 0) return 'New Customer';
  const rate = (row.delivered / row.resolved) * 100;
  if (rate >= 70) return 'Trusted';
  if (rate < 40) return 'Risky';
  return 'Normal';
}

export function classifyRfmSegment(row: CustomerLifetimeRow): string {
  const successRate = successRateOf(row);
  const recencyDays = recencyDaysOf(row);
  if (successRate != null && successRate < 40) return 'Risky (low delivery success)';
  if (row.orderCount === 1) return 'New';
  if (row.orderCount >= 3 && (successRate == null || successRate >= 70) && recencyDays <= 30) return 'Champions';
  if (recencyDays > 60 && row.orderCount >= 2) return 'At risk (lapsed)';
  return 'Regular';
}

export async function getRfmSegments(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const stats = await computeCustomerLifetimeStats(tenantId, q.storeId);

  const bySegment = new Map<string, { count: number; revenue: number; successSum: number; successCount: number }>();
  for (const row of stats) {
    const segment = classifyRfmSegment(row);
    const bucket = bySegment.get(segment) ?? { count: 0, revenue: 0, successSum: 0, successCount: 0 };
    bucket.count += 1;
    bucket.revenue += row.totalSpend;
    const sr = successRateOf(row);
    if (sr != null) {
      bucket.successSum += sr;
      bucket.successCount += 1;
    }
    bySegment.set(segment, bucket);
  }

  const segments = buildBreakdown(
    [...bySegment.entries()].map(([segment, b]) => ({
      key: segment,
      label: segment,
      count: b.count,
      value: b.revenue,
      secondaryRate: b.successCount > 0 ? Math.round((b.successSum / b.successCount) * 10) / 10 : null,
    }))
  );

  const top = [...stats].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 50);
  const blockedPhones = await attachBlockedFlag(tenantId, top.map((r) => r.phone));
  const customers = top.map((r) => toTopCustomerRow(r, blockedPhones, classifyRfmSegment(r)));

  const dto: RfmSegmentsDTO = { segments, customers };
  res.json({ success: true, rfm: dto });
}

export async function getRiskSegments(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const stats = await computeCustomerLifetimeStats(tenantId, q.storeId);

  const byLabel = new Map<RiskLabel, { count: number; revenue: number; successSum: number; successCount: number }>();
  for (const row of stats) {
    const label = riskLabelOf(row);
    const bucket = byLabel.get(label) ?? { count: 0, revenue: 0, successSum: 0, successCount: 0 };
    bucket.count += 1;
    bucket.revenue += row.totalSpend;
    const sr = successRateOf(row);
    if (sr != null) {
      bucket.successSum += sr;
      bucket.successCount += 1;
    }
    byLabel.set(label, bucket);
  }

  const breakdown = buildBreakdown(
    [...byLabel.entries()].map(([label, b]) => ({
      key: label,
      label,
      count: b.count,
      value: b.revenue,
      secondaryRate: b.successCount > 0 ? Math.round((b.successSum / b.successCount) * 10) / 10 : null,
    }))
  );
  res.json({ success: true, breakdown });
}

export async function getCustomersByZone(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match: Record<string, unknown> = { tenantId, customerPhone: { $ne: null } };
  if (q.storeId && q.storeId !== 'all') match.storeId = q.storeId;

  // Each customer's most recent delivery zone stands in for "where they're located" — a phone can
  // technically ship to more than one zone, but the latest one is the best single-value proxy
  // available without a real customer/address entity.
  const perCustomer = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$customerPhone', zone: { $first: '$deliveryZone' }, totalSpend: { $sum: '$total' }, delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } }, resolved: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered', 'Cancelled', 'Returned']] }, 1, 0] } } } },
      {
        $group: {
          _id: { $ifNull: ['$zone', 'Unspecified'] },
          customerCount: { $sum: 1 },
          revenue: { $sum: '$totalSpend' },
          delivered: { $sum: '$delivered' },
          resolved: { $sum: '$resolved' },
        },
      },
    ])
    .toArray();

  const breakdown = buildBreakdown(
    perCustomer.map((r) => ({
      key: r._id,
      label: r._id,
      count: r.customerCount,
      value: r.revenue,
      secondaryRate: r.resolved > 0 ? Math.round((r.delivered / r.resolved) * 1000) / 10 : null,
    }))
  );
  res.json({ success: true, breakdown });
}

// --- Phase 4: Finance & Profit ---
//
// Revenue/COGS here follow the exact same recognition rule as the P&L report
// (accountingController.getProfitAndLoss): revenue counts only once an order's history shows it
// actually reached Delivered/Partial Delivered, and COGS comes from the same inventoryMovements
// ledger (COGS_REASONS), not from summing every order placed — a Pending order isn't revenue yet,
// COD or otherwise.

async function windowGrossProfit(tenantId: string, match: Record<string, unknown>, window: TrendWindow, granularity: TrendGranularity, bucketCount: number): Promise<AnalyticsSeriesWindowDTO> {
  const revenueWindow = await bucketedWindowWithPipeline(
    'orders',
    [
      { $match: { ...match, history: { $elemMatch: { label: { $in: ['Delivered', 'Partial Delivered'] }, at: { $gte: window.from, $lt: window.to } } } } },
      // Picks the single LAST qualifying history event per order instead of `$unwind`+`$match` —
      // an order can carry both a 'Delivered' and a later 'Partial Delivered' entry in the same
      // window (e.g. delivered, then corrected to a partial return afterward); unwinding would sum
      // '$total' once per matching entry and double-count that order's revenue.
      {
        $addFields: {
          qualifyingEvent: {
            $arrayElemAt: [
              {
                $filter: {
                  input: { $ifNull: ['$history', []] },
                  as: 'h',
                  cond: { $and: [{ $in: ['$$h.label', ['Delivered', 'Partial Delivered']] }, { $gte: ['$$h.at', window.from] }, { $lt: ['$$h.at', window.to] }] },
                },
              },
              -1,
            ],
          },
        },
      },
    ],
    window,
    granularity,
    bucketCount,
    { $sum: '$total' },
    'qualifyingEvent.at'
  );
  // storeId isn't tracked on inventoryMovements (cost is a tenant-wide ledger, not per-channel), so
  // COGS can't be scoped by store the way revenue can — a store filter here still narrows revenue,
  // just not the cost side.
  const cogsWindow = await bucketedWindow('inventoryMovements', { tenantId, reason: { $in: COGS_REASONS } }, window, granularity, bucketCount, { $sum: '$valueDelta' }, 'createdAt');

  const points = revenueWindow.points.map((rp, i) => ({ ...rp, value: rp.value + (cogsWindow.points[i]?.value ?? 0) }));
  return { from: window.from.toISOString(), to: window.to.toISOString(), points };
}

export async function getGrossProfitOverTime(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { granularity, bucketCount, current, comparison } = resolveRange(q.range, q.from, q.to, q.comparisonMode, q.comparisonFrom, q.comparisonTo);
  const skipComparison = comparisonDisabled(q);
  const [currentWindow, comparisonWindow] = await Promise.all([
    windowGrossProfit(tenantId, match, current, granularity, bucketCount),
    skipComparison ? Promise.resolve(emptySeriesWindow(comparison)) : windowGrossProfit(tenantId, match, comparison, granularity, bucketCount),
  ]);
  const totalCurrent = currentWindow.points.reduce((s, p) => s + p.value, 0);
  const totalComparison = comparisonWindow.points.reduce((s, p) => s + p.value, 0);
  const series: AnalyticsSeriesDTO = {
    granularity,
    current: currentWindow,
    comparison: comparisonWindow,
    totalCurrent,
    totalComparison,
    trend: skipComparison ? null : pctTrend(totalCurrent, totalComparison),
  };
  res.json({ success: true, series });
}

export async function getProfitByProduct(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.cogsTotal = { $ne: null };
  // Same revenue-recognition rule as windowGrossProfit/the P&L report: a Returned order's cogsTotal
  // has been reversed toward zero, so leaving Returned orders in here would show them as almost
  // pure profit (full revenue, ~0 cost) — the opposite of what actually happened.
  match.stage = { $in: ['Delivered', 'Partial Delivered'] };
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      // Per-order total of its own line items' revenue, computed before the unwind — used as the
      // COGS-apportionment denominator instead of `subtotal`. Shopify's subtotal_price is already
      // net of order-level discounts while lineItems.price is the pre-discount unit price, so on a
      // discounted order summing (qty*price) across lines can exceed subtotal; dividing by that
      // mismatched denominator would apportion more than 100% of the order's COGS. Using the sum of
      // the order's own line revenues instead guarantees each order's shares always add up to 1.
      { $addFields: { _lineRevenueTotal: { $sum: { $map: { input: { $ifNull: ['$lineItems', []] }, as: 'li', in: { $multiply: ['$$li.quantity', '$$li.price'] } } } } } },
      { $unwind: '$lineItems' },
      {
        $project: {
          key: { $ifNull: ['$lineItems.sku', '$lineItems.title'] },
          title: '$lineItems.title',
          image: '$lineItems.image',
          units: '$lineItems.quantity',
          lineRevenue: { $multiply: ['$lineItems.quantity', '$lineItems.price'] },
          allocatedCogs: {
            $cond: [
              { $gt: ['$_lineRevenueTotal', 0] },
              { $multiply: ['$cogsTotal', { $divide: [{ $multiply: ['$lineItems.quantity', '$lineItems.price'] }, '$_lineRevenueTotal'] }] },
              0,
            ],
          },
        },
      },
      { $group: { _id: '$key', title: { $first: '$title' }, image: { $first: '$image' }, unitsSold: { $sum: '$units' }, revenue: { $sum: '$lineRevenue' }, cogs: { $sum: '$allocatedCogs' }, orderCount: { $sum: 1 } } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ])
    .toArray();

  const dto: ProductRankingDTO = {
    rows: rows.map((r) => {
      const grossProfit = r.revenue - r.cogs;
      return {
        productId: r._id ?? 'unknown',
        title: r.title ?? 'Untitled product',
        image: r.image ?? null,
        unitsSold: r.unitsSold,
        orderCount: r.orderCount,
        revenue: r.revenue,
        cogs: Math.round(r.cogs * 100) / 100,
        grossProfit: Math.round(grossProfit * 100) / 100,
        marginPercent: r.revenue > 0 ? Math.round((grossProfit / r.revenue) * 1000) / 10 : null,
        returnRate: null,
      };
    }),
  };
  res.json({ success: true, ranking: dto });
}

export async function getSalesByPaymentMethod(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const rows = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: '$paymentMethod', count: { $sum: 1 }, value: { $sum: '$total' } } }])
    .toArray();

  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id ?? 'Other', label: r._id ?? 'Other', count: r.count, value: r.value })));
  res.json({ success: true, breakdown });
}

export async function getDiscountsOverTime(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const series = await runAnalyticsSeries(baseMatch(tenantId, q.storeId), q, { $sum: '$discount' });
  res.json({ success: true, series });
}

export async function getCodCashflow(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);

  const [outstandingAgg] = await db
    .collection('orders')
    .aggregate([{ $match: { ...match, paymentStatus: 'COD Pending', stage: { $nin: ['Cancelled', 'Returned'] } } }, { $group: { _id: null, total: { $sum: '$total' } } }])
    .toArray();

  const [collectedAgg] = await db
    .collection('orders')
    .aggregate([{ $match: { ...match, paymentStatus: 'Collected' } }, { $group: { _id: null, total: { $sum: '$total' } } }])
    .toArray();

  // Real now that "Mark COD collected" (ordersController.markPaymentCollected) writes a timestamped
  // history event: average gap between an order's Delivered event and its Payment-collected event,
  // for orders actually marked collected that way. Orders whose 'Collected' status came from
  // somewhere else (synced pre-existing data) won't have a 'Payment collected' event and are
  // excluded rather than guessed at.
  const collectedDocs = await db
    .collection('orders')
    .aggregate([
      { $match: { ...match, paymentStatus: 'Collected', history: { $elemMatch: { label: 'Payment collected' } } } },
      {
        $project: {
          deliveredEvt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $in: ['$$h.label', ['Delivered', 'Partial Delivered']] } } }, 0] },
          collectedEvt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Payment collected'] } } }, 0] },
        },
      },
    ])
    .toArray();
  const collectionDays = collectedDocs
    .filter((d) => d.deliveredEvt?.at && d.collectedEvt?.at)
    .map((d) => (new Date(d.collectedEvt.at).getTime() - new Date(d.deliveredEvt.at).getTime()) / 86_400_000);
  const avgDaysToCollect = collectionDays.length > 0 ? Math.round((collectionDays.reduce((s, d) => s + d, 0) / collectionDays.length) * 10) / 10 : null;

  const series = await runAnalyticsSeries({ ...match, paymentStatus: 'COD Pending', stage: { $nin: ['Cancelled', 'Returned'] } }, q, { $sum: '$total' });

  // Bucketed by the collection *event's* own date, not order.createdAt — the generic
  // runAnalyticsSeries only buckets by a plain top-level field, so this needs the same
  // unwind-then-rebucket approach windowGrossProfit uses for history-nested dates.
  const { granularity, bucketCount, current: curWindow, comparison: cmpWindow } = resolveRange(
    q.range,
    q.from,
    q.to,
    q.comparisonMode,
    q.comparisonFrom,
    q.comparisonTo
  );
  const skipComparison = comparisonDisabled(q);
  const collectedPipelineFor = (window: TrendWindow) => [
    { $match: { ...match, history: { $elemMatch: { label: 'Payment collected', at: { $gte: window.from, $lt: window.to } } } } },
    { $unwind: '$history' },
    { $match: { 'history.label': 'Payment collected', 'history.at': { $gte: window.from, $lt: window.to } } },
  ];
  const [collectedCurrent, collectedComparison] = await Promise.all([
    bucketedWindowWithPipeline('orders', collectedPipelineFor(curWindow), curWindow, granularity, bucketCount, { $sum: '$total' }, 'history.at'),
    skipComparison
      ? Promise.resolve(emptySeriesWindow(cmpWindow))
      : bucketedWindowWithPipeline('orders', collectedPipelineFor(cmpWindow), cmpWindow, granularity, bucketCount, { $sum: '$total' }, 'history.at'),
  ]);
  const collectedTotalCurrent = collectedCurrent.points.reduce((s, p) => s + p.value, 0);
  const collectedTotalComparison = collectedComparison.points.reduce((s, p) => s + p.value, 0);
  const collectedSeries: AnalyticsSeriesDTO = {
    granularity,
    current: collectedCurrent,
    comparison: collectedComparison,
    totalCurrent: collectedTotalCurrent,
    totalComparison: collectedTotalComparison,
    trend: skipComparison ? null : pctTrend(collectedTotalCurrent, collectedTotalComparison),
  };

  const dto: CodCashflowDTO = { outstanding: outstandingAgg?.total ?? 0, collected: collectedAgg?.total ?? 0, avgDaysToCollect, series, collectedSeries };
  res.json({ success: true, cashflow: dto });
}

// --- Phase 5: Inventory & Patterns ---

export async function getAbcAnalysis(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] },
          title: { $first: '$lineItems.title' },
          units: { $sum: '$lineItems.quantity' },
          revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } },
        },
      },
    ])
    .toArray();

  // A/B/C classes are derived client-side from cumulativePercentage (A <= 80%, B <= 95%, C rest) —
  // buildBreakdown already sorts by value desc and runs the cumulative sum this needs.
  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id, label: r.title, count: r.units, value: r.revenue })));
  res.json({ success: true, breakdown });
}

export async function getSellThrough(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const { current } = resolveRange(q.range, q.from, q.to);
  const daySpan = Math.max(1, (current.to.getTime() - current.from.getTime()) / 86_400_000);

  // Sold units come from the inventory ledger (real productId/variantId), not order line items
  // (sku-only, and SKUs aren't reliably unique across variants — see db.ts's index comment) — this
  // is the only reliable way to match "units sold" to "units currently on hand" for the same exact
  // variant.
  const sold = await db
    .collection('inventoryMovements')
    .aggregate([
      { $match: { tenantId, reason: 'Order fulfilled', createdAt: { $gte: current.from, $lt: current.to } } },
      {
        $group: {
          _id: { productId: '$productId', variantId: '$variantId' },
          title: { $first: '$productTitle' },
          variantLabel: { $first: '$variantLabel' },
          unitsSold: { $sum: '$quantity' },
        },
      },
    ])
    .toArray();

  const keys = sold.map((s) => ({ productId: s._id.productId, variantId: s._id.variantId })).filter((k) => k.productId && k.variantId);
  const stockRows =
    keys.length > 0
      ? await db
          .collection('inventoryLevels')
          .aggregate([
            { $match: { tenantId, $or: keys.map((k) => ({ productId: k.productId, variantId: k.variantId })) } },
            { $group: { _id: { productId: '$productId', variantId: '$variantId' }, onHand: { $sum: '$onHand' } } },
          ])
          .toArray()
      : [];
  const stockByKey = new Map(stockRows.map((s) => [`${s._id.productId}::${s._id.variantId}`, s.onHand as number]));

  const dto: SellThroughDTO = {
    rows: sold
      // Rows without a real productId/variantId can't be joined to inventoryLevels — leaving them
      // in would show currentStock defaulting to 0, which reads as "urgent restock" for what's
      // actually just an unlinked/legacy movement.
      .filter((s) => s._id.productId && s._id.variantId)
      .map((s) => {
        const key = `${s._id.productId}::${s._id.variantId}`;
        const currentStock = stockByKey.get(key) ?? 0;
        const unitsSoldPerDay = s.unitsSold / daySpan;
        return {
          productId: key,
          title: s.variantLabel ? `${s.title} — ${s.variantLabel}` : s.title ?? 'Untitled product',
          unitsSoldPerDay: Math.round(unitsSoldPerDay * 100) / 100,
          currentStock,
          daysOfInventory: unitsSoldPerDay > 0 ? Math.round(currentStock / unitsSoldPerDay) : null,
          percentageSold: s.unitsSold + currentStock > 0 ? Math.round((s.unitsSold / (s.unitsSold + currentStock)) * 1000) / 10 : null,
        };
      })
      .sort((a, b) => (a.daysOfInventory ?? Infinity) - (b.daysOfInventory ?? Infinity)),
  };
  res.json({ success: true, sellThrough: dto });
}

export async function getStockoutCancellations(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = { ...baseMatch(tenantId, q.storeId), stage: 'Cancelled', cancelReason: 'Out of stock' };

  const series = await runAnalyticsSeries(match, q, { $sum: 1 });

  const { current } = resolveRange(q.range, q.from, q.to);
  const productRows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...match, createdAt: { $gte: current.from, $lt: current.to } } },
      { $unwind: '$lineItems' },
      { $group: { _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] }, title: { $first: '$lineItems.title' }, count: { $sum: '$lineItems.quantity' }, value: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } } } },
    ])
    .toArray();
  const topAffectedProducts = buildBreakdown(productRows.map((r) => ({ key: r._id, label: r.title, count: r.count, value: r.value }))).rows;

  const dto: StockoutCancellationsDTO = { series, topAffectedProducts };
  res.json({ success: true, stockoutCancellations: dto });
}

// Same shape as getBlocklistHitRate (a rate against every order placed) plus getStockoutCancellations'
// per-day series and per-product breakdown — spam is the one cancellation reason sellers want to
// watch on both axes at once: "is it getting worse right now" (series) and "which listing is a bot/
// junk-order magnet" (topAffectedProducts, e.g. a viral ad drawing bait orders on one product).
export async function getSpamOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  const dateMatch = { ...match, createdAt: { $gte: current.from, $lt: current.to } };
  const spamMatch = { ...dateMatch, stage: 'Cancelled', cancelReason: 'Spam' };

  const [totalAgg] = await db.collection('orders').aggregate([{ $match: dateMatch }, { $group: { _id: null, count: { $sum: 1 } } }]).toArray();
  const [spamAgg] = await db.collection('orders').aggregate([{ $match: spamMatch }, { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$total' } } }]).toArray();
  const series = await runAnalyticsSeries({ ...match, stage: 'Cancelled', cancelReason: 'Spam' }, q, { $sum: 1 });

  const productRows = await db
    .collection('orders')
    .aggregate([
      { $match: spamMatch },
      { $unwind: '$lineItems' },
      { $group: { _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] }, title: { $first: '$lineItems.title' }, count: { $sum: '$lineItems.quantity' }, value: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } } } },
    ])
    .toArray();
  const topAffectedProducts = buildBreakdown(productRows.map((r) => ({ key: r._id, label: r.title, count: r.count, value: r.value }))).rows;

  const totalOrders = totalAgg?.count ?? 0;
  const spamOrders = spamAgg?.count ?? 0;
  const dto: SpamOrdersDTO = {
    totalOrders,
    spamOrders,
    spamRate: totalOrders > 0 ? Math.round((spamOrders / totalOrders) * 1000) / 10 : null,
    valueLost: spamAgg?.value ?? 0,
    series,
    topAffectedProducts,
  };
  res.json({ success: true, spamOrders: dto });
}

export async function getItemsBoughtTogether(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  // $expr/$size keeps this to orders that can actually form a pair. Keyed by sku falling back to
  // title (same key the JS loop below uses) — unioning '$lineItems.sku' directly would collapse
  // every title-only (no-sku) line item down to one shared `null`, silently dropping orders whose
  // products just don't have SKUs from ever counting as multi-item.
  match.$expr = {
    $gte: [{ $size: { $setUnion: [{ $map: { input: '$lineItems', as: 'li', in: { $ifNull: ['$$li.sku', '$$li.title'] } } }] } }, 2],
  };

  const orders = await db.collection('orders').find(match).project({ lineItems: 1 }).limit(2000).toArray();

  const pairCounts = new Map<string, { productA: string; productB: string; count: number }>();
  for (const order of orders) {
    const keys = [...new Set((order.lineItems ?? []).map((li: any) => li.sku ?? li.title).filter(Boolean))] as string[];
    keys.sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const pairKey = `${keys[i]}|||${keys[j]}`;
        const existing = pairCounts.get(pairKey);
        if (existing) existing.count += 1;
        else pairCounts.set(pairKey, { productA: keys[i], productB: keys[j], count: 1 });
      }
    }
  }

  const dto: ItemsBoughtTogetherDTO = {
    rows: [...pairCounts.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 30)
      .map((p) => ({ productA: p.productA, productB: p.productB, pairCount: p.count })),
  };
  res.json({ success: true, itemsBoughtTogether: dto });
}

export async function getReturnedProducts(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.stage = { $in: ['Returned', 'RTO Initiated', 'QC Pending'] };
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const [rows, shippedRows] = await Promise.all([
    db
      .collection('orders')
      .aggregate([
        { $match: match },
        { $unwind: '$lineItems' },
        {
          $group: {
            _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] },
            title: { $first: '$lineItems.title' },
            image: { $first: '$lineItems.image' },
            unitsSold: { $sum: '$lineItems.quantity' },
            revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } },
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { unitsSold: -1 } },
        { $limit: limit },
      ])
      .toArray(),
    // Denominator for return rate: units shipped-or-beyond for the same product/period, regardless
    // of final outcome — reuses the same key so a returned-only product (100% of a tiny number)
    // doesn't look identical to one with the same rate on real volume.
    db
      .collection('orders')
      .aggregate([
        { $match: { ...baseMatch(tenantId, q.storeId), createdAt: { $gte: current.from, $lt: current.to }, stage: { $in: ['Ready for Pickup', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending', 'Delivered', 'Partial Delivered', 'Returned'] } } },
        { $unwind: '$lineItems' },
        { $group: { _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] }, unitsShipped: { $sum: '$lineItems.quantity' } } },
      ])
      .toArray(),
  ]);

  const shippedByKey = new Map(shippedRows.map((r) => [r._id, r.unitsShipped as number]));

  const dto: ProductRankingDTO = {
    rows: rows.map((r) => {
      const unitsShipped = shippedByKey.get(r._id) ?? r.unitsSold;
      return {
        productId: r._id ?? 'unknown',
        title: r.title ?? 'Untitled product',
        image: r.image ?? null,
        unitsSold: r.unitsSold,
        orderCount: r.orderCount,
        revenue: r.revenue,
        cogs: null,
        grossProfit: null,
        marginPercent: null,
        returnRate: unitsShipped > 0 ? Math.round((r.unitsSold / unitsShipped) * 1000) / 10 : null,
      };
    }),
  };
  res.json({ success: true, ranking: dto });
}

export async function getWeeklyPatterns(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $group: {
          // Mongo's $dayOfWeek is 1=Sunday..7=Saturday; shift to 0=Sunday..6=Saturday to match the
          // shared WeeklyPatternCellDTO convention (JS Date#getDay()). Computed in Bangladesh local
          // time, not UTC — a UTC hour-of-day would shift every order's apparent order-time by 6
          // hours, which defeats the point of a "when do orders come in" staffing chart.
          _id: { day: { $subtract: [{ $dayOfWeek: { date: '$createdAt', timezone: 'Asia/Dhaka' } }, 1] }, hour: { $hour: { date: '$createdAt', timezone: 'Asia/Dhaka' } } },
          count: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
    ])
    .toArray();

  const cells = rows.map((r) => ({ dayOfWeek: r._id.day, hour: r._id.hour, orderCount: r.count, revenue: r.revenue }));
  const maxOrderCount = cells.reduce((m, c) => Math.max(m, c.orderCount), 0);
  const dto: WeeklyPatternDTO = { cells, maxOrderCount };
  res.json({ success: true, weeklyPattern: dto });
}

// --- Phase 6: gaps between the original recommendation and the first build pass ---

export async function getPartialDeliveryRate(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.stage = { $in: ['Delivered', 'Partial Delivered'] };

  const rows = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$total' } } }])
    .toArray();

  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id, label: r._id === 'Partial Delivered' ? 'Partially delivered' : 'Fully delivered', count: r.count, value: r.value })));
  res.json({ success: true, breakdown });
}

export async function getChannelPerformance(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: '$storeId',
          total: { $sum: 1 },
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
          revenue: { $sum: '$total' },
        },
      },
    ])
    .toArray();

  const storeIds: string[] = rows.map((r) => r._id).filter(Boolean);
  const stores = await db
    .collection('stores')
    .find({ tenantId, _id: { $in: storeIds.map((id) => new ObjectId(id)) } })
    .toArray();
  const storeById = new Map(stores.map((s) => [s._id.toString(), s]));

  const breakdown = buildBreakdown(
    rows.map((r) => {
      const store = storeById.get(r._id);
      const resolved = r.delivered + r.rto;
      return {
        key: r._id ?? 'unknown',
        label: store ? `${store.displayName} (${store.platform === 'shopify' ? 'Shopify' : 'WooCommerce'})` : 'Unknown store',
        count: r.total,
        value: r.revenue,
        secondaryRate: resolved > 0 ? Math.round((r.delivered / resolved) * 1000) / 10 : null,
        secondaryValue: resolved > 0 ? Math.round((r.rto / resolved) * 1000) / 10 : null,
      };
    })
  );
  res.json({ success: true, breakdown });
}

// Adjustment/write-off/count-correction reasons only — deliberately excludes 'Order fulfilled' /
// 'Order returned' (routine sales flow, already covered by other cards) and 'Transfer in'/'Transfer
// out' (net-zero relocations, not a gain or loss).
const ADJUSTMENT_REASONS = ['Damaged stock', 'Lost', 'Wrong Product', 'Lost in transit', 'Manual adjustment', 'Cycle count', 'Wrong entry', 'Found stock', 'Short-shipped by supplier', 'Damaged on arrival'];

export async function getInventoryAdjustments(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const { current } = resolveRange(q.range, q.from, q.to);

  const rows = await db
    .collection('inventoryMovements')
    .aggregate([
      { $match: { tenantId, reason: { $in: ADJUSTMENT_REASONS }, createdAt: { $gte: current.from, $lt: current.to } } },
      { $group: { _id: '$reason', count: { $sum: { $abs: '$delta' } }, value: { $sum: { $abs: { $ifNull: ['$valueDelta', 0] } } } } },
    ])
    .toArray();

  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id, label: r._id, count: r.count, value: r.value })));
  res.json({ success: true, breakdown });
}

export async function getInventoryThroughput(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const [orderedAgg, receivedAgg, shippedAgg, skuAgg, valueAgg] = await Promise.all([
    db.collection('orders').aggregate([{ $match: match }, { $unwind: '$lineItems' }, { $group: { _id: null, units: { $sum: '$lineItems.quantity' } } }]).toArray(),
    db
      .collection('inventoryMovements')
      .aggregate([{ $match: { tenantId, reason: { $in: ['Incoming Stock received', 'Incoming Stock'] }, createdAt: { $gte: current.from, $lt: current.to } } }, { $group: { _id: null, units: { $sum: '$delta' } } }])
      .toArray(),
    db
      .collection('orders')
      .aggregate([
        { $match: { ...baseMatch(tenantId, q.storeId), history: { $elemMatch: { label: 'Ready for Pickup', at: { $gte: current.from, $lt: current.to } } } } },
        { $unwind: '$lineItems' },
        { $group: { _id: null, units: { $sum: '$lineItems.quantity' } } },
      ])
      .toArray(),
    db.collection('products').aggregate([{ $match: { tenantId } }, { $unwind: '$variants' }, { $match: { 'variants.sku': { $ne: null } } }, { $group: { _id: '$variants.sku' } }, { $count: 'total' }]).toArray(),
    db.collection('inventoryLevels').aggregate([{ $match: { tenantId } }, { $group: { _id: null, value: { $sum: { $multiply: ['$onHand', { $ifNull: ['$unitCost', 0] }] } } } }]).toArray(),
  ]);

  const dto: InventoryThroughputDTO = {
    totalOrdered: orderedAgg[0]?.units ?? 0,
    totalReceived: receivedAgg[0]?.units ?? 0,
    totalShipped: shippedAgg[0]?.units ?? 0,
    uniqueSkus: skuAgg[0]?.total ?? 0,
    totalInventoryValue: Math.round((valueAgg[0]?.value ?? 0) * 100) / 100,
  };
  res.json({ success: true, throughput: dto });
}

export async function getShippingAndTracking(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const series = await runAnalyticsSeries(match, q, { $sum: '$shippingFee' });

  const { current } = resolveRange(q.range, q.from, q.to);
  const shippedMatch = { ...match, createdAt: { $gte: current.from, $lt: current.to }, stage: { $in: ['Ready for Pickup', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending', 'Delivered', 'Partial Delivered', 'Returned'] } };
  const [agg] = await db
    .collection('orders')
    .aggregate([{ $match: shippedMatch }, { $group: { _id: null, total: { $sum: 1 }, withTracking: { $sum: { $cond: [{ $ne: ['$courierTrackingId', null] }, 1, 0] } } } }])
    .toArray();

  const dto: ShippingTrackingDTO = {
    series,
    totalShippingFee: series.totalCurrent,
    trackingIncludedRate: agg?.total > 0 ? Math.round((agg.withTracking / agg.total) * 1000) / 10 : null,
  };
  res.json({ success: true, shippingTracking: dto });
}

export async function getNewCustomerRevenue(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { granularity, bucketCount, current, comparison } = resolveRange(q.range, q.from, q.to, q.comparisonMode, q.comparisonFrom, q.comparisonTo);
  const skipComparison = comparisonDisabled(q);

  const firstOrderRows = await db
    .collection('orders')
    .aggregate([{ $match: { ...match, customerPhone: { $ne: null } } }, { $group: { _id: '$customerPhone', first: { $min: '$createdAt' } } }])
    .toArray();
  const firstOrderByPhone = new Map(firstOrderRows.map((r) => [r._id as string, new Date(r.first).getTime()]));

  async function classifyWindow(window: TrendWindow) {
    const orders = await db
      .collection('orders')
      .find({ ...match, createdAt: { $gte: window.from, $lt: window.to } })
      .project({ createdAt: 1, customerPhone: 1, total: 1 })
      .toArray();

    const points = Array.from({ length: bucketCount }, (_, i) => ({
      index: i,
      label: bucketLabel(granularity, window.from, i),
      date: bucketDate(granularity, window.from, i).toISOString(),
      newRevenue: 0,
      returningRevenue: 0,
    }));

    for (const o of orders) {
      const idx = bucketIndexJs(granularity, window.from, new Date(o.createdAt));
      if (idx < 0 || idx >= bucketCount) continue;
      const isNew = !o.customerPhone || firstOrderByPhone.get(o.customerPhone) === new Date(o.createdAt).getTime();
      if (isNew) points[idx].newRevenue += o.total;
      else points[idx].returningRevenue += o.total;
    }
    return { from: window.from.toISOString(), to: window.to.toISOString(), points };
  }

  const [currentWindow, comparisonWindow] = await Promise.all([
    classifyWindow(current),
    skipComparison ? Promise.resolve({ from: comparison.from.toISOString(), to: comparison.to.toISOString(), points: [] }) : classifyWindow(comparison),
  ]);
  const dto: NewCustomerRevenueDTO = { granularity, current: currentWindow, comparison: comparisonWindow };
  res.json({ success: true, series: dto });
}

// --- Phase 7: gaps identified against the user's own COD analytics checklist ---

export async function getNetSalesOverTime(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = { ...baseMatch(tenantId, q.storeId), stage: { $nin: ['Cancelled', 'Returned'] } };
  const series = await runAnalyticsSeries(match, q, { $sum: '$total' });
  res.json({ success: true, series });
}

export async function getProfitByCourier(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.cogsTotal = { $ne: null };
  match.courierPartner = { $ne: null };
  // See getProfitByProduct: a Returned order's cogsTotal is reversed toward zero, so including it
  // here would show it as almost pure profit instead of the loss it actually was.
  match.stage = { $in: ['Delivered', 'Partial Delivered'] };

  const rows = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: '$courierPartner', count: { $sum: 1 }, revenue: { $sum: '$total' }, cogs: { $sum: '$cogsTotal' } } }])
    .toArray();

  const breakdown = buildBreakdown(
    rows.map((r) => {
      const grossProfit = r.revenue - r.cogs;
      return { key: r._id, label: r._id, count: r.count, value: Math.round(grossProfit * 100) / 100, secondaryRate: r.revenue > 0 ? Math.round((grossProfit / r.revenue) * 1000) / 10 : null, secondaryValue: r.revenue };
    })
  );
  res.json({ success: true, breakdown });
}

export async function getProfitByZone(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.cogsTotal = { $ne: null };
  // See getProfitByProduct: a Returned order's cogsTotal is reversed toward zero, so including it
  // here would show it as almost pure profit instead of the loss it actually was.
  match.stage = { $in: ['Delivered', 'Partial Delivered'] };

  const rows = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$deliveryZone', 'Unspecified'] }, count: { $sum: 1 }, revenue: { $sum: '$total' }, cogs: { $sum: '$cogsTotal' } } }])
    .toArray();

  const breakdown = buildBreakdown(
    rows.map((r) => {
      const grossProfit = r.revenue - r.cogs;
      return { key: r._id, label: r._id, count: r.count, value: Math.round(grossProfit * 100) / 100, secondaryRate: r.revenue > 0 ? Math.round((grossProfit / r.revenue) * 1000) / 10 : null, secondaryValue: r.revenue };
    })
  );
  res.json({ success: true, breakdown });
}

export async function getDeadStock(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const { current } = resolveRange(q.range, q.from, q.to);

  const [inStock, lastSoldRows] = await Promise.all([
    db
      .collection('inventoryLevels')
      .aggregate([
        { $match: { tenantId, onHand: { $gt: 0 } } },
        { $group: { _id: { productId: '$productId', variantId: '$variantId' }, title: { $first: '$productTitle' }, variantLabel: { $first: '$variantLabel' }, onHand: { $sum: '$onHand' }, unitCost: { $first: '$unitCost' } } },
      ])
      .toArray(),
    db
      .collection('inventoryMovements')
      .aggregate([
        { $match: { tenantId, reason: 'Order fulfilled' } },
        { $group: { _id: { productId: '$productId', variantId: '$variantId' }, lastSoldAt: { $max: '$createdAt' } } },
      ])
      .toArray(),
  ]);

  const lastSoldByKey = new Map(lastSoldRows.map((r) => [`${r._id.productId}::${r._id.variantId}`, r.lastSoldAt as Date]));

  // "Dead" means no sale since the start of the selected range — pick a longer range (60/90 days)
  // from the filter above for a meaningful signal; a 7-day window will flag almost everything.
  const rows = inStock
    .map((s) => {
      const key = `${s._id.productId}::${s._id.variantId}`;
      const lastSoldAt = lastSoldByKey.get(key) ?? null;
      const isDead = !lastSoldAt || new Date(lastSoldAt) < current.from;
      return {
        productId: key,
        title: s.variantLabel ? `${s.title} — ${s.variantLabel}` : s.title ?? 'Untitled product',
        currentStock: s.onHand,
        daysSinceLastSale: lastSoldAt ? Math.round((Date.now() - new Date(lastSoldAt).getTime()) / 86_400_000) : null,
        inventoryValue: Math.round(s.onHand * (s.unitCost ?? 0) * 100) / 100,
        isDead,
      };
    })
    .filter((r) => r.isDead)
    .sort((a, b) => (b.daysSinceLastSale ?? Infinity) - (a.daysSinceLastSale ?? Infinity))
    .map(({ isDead, ...r }) => r);

  const dto: DeadStockDTO = { rows };
  res.json({ success: true, deadStock: dto });
}

// The automatic half of duplicate detection (same phone, same Dhaka day, 2+ orders — the live
// per-order version of this same check lives in ordersController's findPossibleDuplicates) joined
// against the manual half: which of those flagged orders a staff member actually looked at and
// cancelled with reason "Duplicate order". Same totalOrders/rate/series shape as getSpamOrders, so
// the two "which cancel reason, how often, on what day" questions read the same way for both.
export async function getDuplicateOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  const dateMatch = { ...match, createdAt: { $gte: current.from, $lt: current.to } };
  const phoneMatch = { ...dateMatch, customerPhone: { $ne: null } };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: phoneMatch },
      {
        $group: {
          // Bucketed in Bangladesh local time, not UTC — this product's orders are placed and
          // reviewed on Dhaka time, so grouping by UTC day would split/merge same-day duplicates
          // across the day boundary for several hours around midnight BD time.
          _id: { phone: '$customerPhone', day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Dhaka' } } },
          customerName: { $last: '$customerName' },
          orderCount: { $sum: 1 },
          orderNumbers: { $push: '$number' },
          totalValue: { $sum: '$total' },
          confirmedOrderNumbers: {
            $push: { $cond: [{ $and: [{ $eq: ['$stage', 'Cancelled'] }, { $eq: ['$cancelReason', 'Duplicate order'] }] }, '$number', '$$REMOVE'] },
          },
        },
      },
      { $match: { orderCount: { $gte: 2 } } },
      { $sort: { orderCount: -1 } },
      { $limit: 50 },
    ])
    .toArray();

  const [totalAgg] = await db.collection('orders').aggregate([{ $match: dateMatch }, { $group: { _id: null, count: { $sum: 1 } } }]).toArray();
  const confirmedMatch = { ...dateMatch, stage: 'Cancelled', cancelReason: 'Duplicate order' };
  const [confirmedAgg] = await db.collection('orders').aggregate([{ $match: confirmedMatch }, { $group: { _id: null, count: { $sum: 1 } } }]).toArray();
  const series = await runAnalyticsSeries({ ...match, stage: 'Cancelled', cancelReason: 'Duplicate order' }, q, { $sum: 1 });

  const totalOrders = totalAgg?.count ?? 0;
  const confirmedOrders = confirmedAgg?.count ?? 0;
  const dto: DuplicateOrdersDTO = {
    groups: rows.map((r) => ({
      phone: r._id.phone,
      customerName: r.customerName ?? null,
      date: r._id.day,
      orderCount: r.orderCount,
      orderNumbers: r.orderNumbers,
      totalValue: r.totalValue,
      confirmedOrderNumbers: r.confirmedOrderNumbers ?? [],
    })),
    totalOrders,
    confirmedOrders,
    confirmationRate: totalOrders > 0 ? Math.round((confirmedOrders / totalOrders) * 1000) / 10 : null,
    series,
  };
  res.json({ success: true, duplicateOrders: dto });
}

// --- Phase 8: courier settlement reconciliation, marketing ROAS, address quality, SLA breach ---

const PROVIDER_TO_PARTNER: Record<string, string> = { steadfast: 'Steadfast', pathao: 'Pathao' };

export async function getCourierReconciliation(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const storeMatch = baseMatch(tenantId, q.storeId);

  const couriers = await db.collection('couriers').find({ tenantId }).toArray();

  const [deliveredAgg, returnedAgg, paidAgg] = await Promise.all([
    db
      .collection('orders')
      .aggregate([
        { $match: { ...storeMatch, courierPartner: { $ne: null }, paymentMethod: 'Cash on Delivery', stage: { $in: ['Delivered', 'Partial Delivered'] } } },
        { $group: { _id: '$courierPartner', deliveredCodAmount: { $sum: '$total' }, courierCharges: { $sum: { $ifNull: ['$courierCharge', 0] } } } },
      ])
      .toArray(),
    // RTO cost — a real cash outflow to the courier even though nothing was collected, so it has
    // to reduce expectedReceivable the same way courierCharges does, not just sit as a separate loss figure.
    db
      .collection('orders')
      .aggregate([
        { $match: { ...storeMatch, courierPartner: { $ne: null }, courierConsignmentId: { $ne: null }, stage: 'Returned' } },
        { $group: { _id: '$courierPartner', returnCharges: { $sum: { $ifNull: ['$courierReturnCharge', 0] } } } },
      ])
      .toArray(),
    db.collection('courierSettlements').aggregate([{ $match: { tenantId } }, { $group: { _id: '$provider', paid: { $sum: '$amount' } } }]).toArray(),
  ]);

  const deliveredByPartner = new Map(deliveredAgg.map((r) => [r._id, r]));
  const returnedByPartner = new Map(returnedAgg.map((r) => [r._id, r.returnCharges as number]));
  const paidByProvider = new Map(paidAgg.map((r) => [r._id, r.paid as number]));

  const rows = couriers.map((c) => {
    const partner = PROVIDER_TO_PARTNER[c.provider] ?? c.provider;
    const delivered = deliveredByPartner.get(partner);
    const deliveredCodAmount = delivered?.deliveredCodAmount ?? 0;
    const courierCharges = delivered?.courierCharges ?? 0;
    const returnCharges = returnedByPartner.get(partner) ?? 0;
    const expectedReceivable = deliveredCodAmount - courierCharges - returnCharges;
    const paid = paidByProvider.get(c.provider) ?? 0;
    return { provider: c.provider, displayName: c.displayName, deliveredCodAmount, courierCharges, returnCharges, expectedReceivable, paid, due: Math.round((expectedReceivable - paid) * 100) / 100 };
  });

  // Aging: currently-unreconciled delivered COD orders, bucketed by days since delivery — a
  // date-independent snapshot, same reasoning as codCashflow's aging figure.
  const agingDocs = await db
    .collection('orders')
    .aggregate([
      { $match: { ...storeMatch, paymentMethod: 'Cash on Delivery', paymentStatus: 'COD Pending', stage: { $in: ['Delivered', 'Partial Delivered'] } } },
      { $project: { total: 1, deliveredEvt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $in: ['$$h.label', ['Delivered', 'Partial Delivered']] } } }, 0] } } },
    ])
    .toArray();

  const buckets = [
    { label: '0-3 days', min: 0, max: 3, count: 0, value: 0 },
    { label: '4-7 days', min: 4, max: 7, count: 0, value: 0 },
    { label: '8-15 days', min: 8, max: 15, count: 0, value: 0 },
    { label: '16+ days', min: 16, max: Infinity, count: 0, value: 0 },
  ];
  for (const d of agingDocs) {
    const at = d.deliveredEvt?.at;
    if (!at) continue;
    // Whole days, not the raw fractional value — with inclusive integer bucket bounds (0-3, 4-7,
    // 8-15, 16+), a fractional day like 3.5 or 7.2 would fail every bucket's `days <= max` test
    // (3.5 > 3 but also < 4) and silently vanish from every bucket instead of landing in one.
    const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
    const bucket = buckets.find((b) => days >= b.min && days <= b.max);
    if (bucket) {
      bucket.count += 1;
      bucket.value += d.total;
    }
  }

  const dto: CourierReconciliationDTO = { rows, aging: buckets.map((b) => ({ label: b.label, count: b.count, value: Math.round(b.value * 100) / 100 })) };
  res.json({ success: true, reconciliation: dto });
}

// Manifest-level operational view, distinct from getCourierReconciliation's lifetime cash balance —
// how many pickup batches went out per courier in the selected period, how big they were, and how
// long a batch sits Pending before the courier actually confirms receiving it. Scoped by
// handoverDate (when the batch was bagged up), same as getHandoverSales.
export async function getCourierHandoverReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const { current } = resolveRange(q.range, q.from, q.to);

  const [couriers, handovers] = await Promise.all([
    db.collection('couriers').find({ tenantId }).toArray(),
    db.collection('courierHandovers').find({ tenantId, handoverDate: { $gte: current.from, $lt: current.to } }).toArray(),
  ]);

  const handoversByProvider = new Map<string, typeof handovers>();
  for (const h of handovers) {
    const list = handoversByProvider.get(h.provider) ?? [];
    list.push(h);
    handoversByProvider.set(h.provider, list);
  }

  const rows: CourierHandoverReportRowDTO[] = couriers.map((c) => {
    const list = handoversByProvider.get(c.provider) ?? [];
    const confirmed = list.filter((h) => h.status === 'Confirmed');
    const pending = list.filter((h) => h.status === 'Pending');
    const confirmHours = confirmed
      .filter((h) => h.confirmedAt)
      .map((h) => (new Date(h.confirmedAt).getTime() - new Date(h.createdAt).getTime()) / 3_600_000);
    return {
      provider: c.provider,
      displayName: c.displayName,
      manifestCount: list.length,
      parcelCount: list.reduce((s, h) => s + h.parcelCount, 0),
      itemCount: list.reduce((s, h) => s + h.itemCount, 0),
      totalCodAmount: Math.round(list.reduce((s, h) => s + h.totalCodAmount, 0) * 100) / 100,
      confirmedCount: confirmed.length,
      pendingCount: pending.length,
      avgConfirmHours: confirmHours.length > 0 ? Math.round((confirmHours.reduce((s, v) => s + v, 0) / confirmHours.length) * 10) / 10 : null,
    };
  });

  // Aging: manifests still Pending right now (not just within the date filter — a batch created
  // weeks ago and still unconfirmed is exactly what this should surface), bucketed by days since
  // it was created, same bucket shape as courier reconciliation's COD aging.
  const pendingNow = await db.collection('courierHandovers').find({ tenantId, status: 'Pending' }).toArray();
  const buckets = [
    { label: '0-1 days', min: 0, max: 1, count: 0, value: 0 },
    { label: '2-3 days', min: 2, max: 3, count: 0, value: 0 },
    { label: '4-7 days', min: 4, max: 7, count: 0, value: 0 },
    { label: '8+ days', min: 8, max: Infinity, count: 0, value: 0 },
  ];
  for (const h of pendingNow) {
    const days = Math.floor((Date.now() - new Date(h.createdAt).getTime()) / 86_400_000);
    const bucket = buckets.find((b) => days >= b.min && days <= b.max);
    if (bucket) {
      bucket.count += 1;
      bucket.value += h.totalCodAmount;
    }
  }

  const dto: CourierHandoverReportDTO = {
    totalManifests: handovers.length,
    totalParcels: handovers.reduce((s, h) => s + h.parcelCount, 0),
    totalCodAmount: Math.round(handovers.reduce((s, h) => s + h.totalCodAmount, 0) * 100) / 100,
    pendingManifests: pendingNow.length,
    rows,
    aging: buckets.map((b) => ({ label: b.label, count: b.count, value: Math.round(b.value * 100) / 100 })),
  };
  res.json({ success: true, handoverReport: dto });
}

export async function getMarketingRoas(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const { current } = resolveRange(q.range, q.from, q.to);

  const [adSpendAgg, netSalesAgg, cogsAgg] = await Promise.all([
    db
      .collection('expenses')
      .aggregate([{ $match: { tenantId, category: 'Advertising', date: { $gte: current.from, $lt: current.to } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      .toArray(),
    db
      .collection('orders')
      .aggregate([
        { $match: { tenantId, createdAt: { $gte: current.from, $lt: current.to }, stage: { $nin: ['Cancelled', 'Returned'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ])
      .toArray(),
    db
      .collection('orders')
      .aggregate([{ $match: { tenantId, createdAt: { $gte: current.from, $lt: current.to }, cogsTotal: { $ne: null } } }, { $group: { _id: null, total: { $sum: '$cogsTotal' } } }])
      .toArray(),
  ]);

  const adSpend = adSpendAgg[0]?.total ?? 0;
  const netSales = netSalesAgg[0]?.total ?? 0;
  const grossProfit = netSales - (cogsAgg[0]?.total ?? 0);
  const series = await runAnalyticsSeries({ tenantId, category: 'Advertising' }, q, { $sum: '$amount' }, 'expenses', 'date');

  const dto: MarketingRoasDTO = {
    adSpend,
    netSales,
    grossProfit,
    roas: adSpend > 0 ? Math.round((netSales / adSpend) * 100) / 100 : null,
    profitRoas: adSpend > 0 ? Math.round((grossProfit / adSpend) * 100) / 100 : null,
    series,
  };
  res.json({ success: true, marketingRoas: dto });
}

// A cheap heuristic, not a real address-validation service: an address is "Missing" if blank,
// "Weak" if short or missing any digit (house/road/block numbers are almost always numeric in a
// real Bangladeshi address), otherwise "Good". Meant to correlate with RTO rate, not to gate orders.
function addressBucket(address: string | null): string {
  if (!address || !address.trim()) return 'Missing';
  const trimmed = address.trim();
  if (trimmed.length < 15 || !/\d/.test(trimmed)) return 'Weak';
  return 'Good';
}

export async function getAddressQuality(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const orders = await db
    .collection('orders')
    .find(match)
    .project({ address: 1, stage: 1 })
    .toArray();

  const byBucket = new Map<string, { count: number; delivered: number; resolved: number }>();
  for (const o of orders) {
    const bucket = addressBucket(o.address ?? null);
    const b = byBucket.get(bucket) ?? { count: 0, delivered: 0, resolved: 0 };
    b.count += 1;
    if (['Delivered', 'Partial Delivered', 'RTO Initiated', 'QC Pending', 'Returned'].includes(o.stage)) {
      b.resolved += 1;
      if (['Delivered', 'Partial Delivered'].includes(o.stage)) b.delivered += 1;
    }
    byBucket.set(bucket, b);
  }

  const dto: AddressQualityDTO = {
    rows: ['Good', 'Weak', 'Missing'].map((bucket) => {
      const b = byBucket.get(bucket) ?? { count: 0, delivered: 0, resolved: 0 };
      return { bucket, count: b.count, rtoRate: b.resolved > 0 ? Math.round(((b.resolved - b.delivered) / b.resolved) * 1000) / 10 : null };
    }),
  };
  res.json({ success: true, addressQuality: dto });
}

// Fixed defaults, not yet a tenant setting — disclosed in the SlaBreachDTO doc comment. Picked as
// reasonable COD-industry targets: confirm same-day, ship the next day, deliver within a work week.
const SLA_THRESHOLDS: { stage: string; fromLabel: string | null; toLabel: string; thresholdHours: number }[] = [
  { stage: 'Confirm within 6h', fromLabel: null, toLabel: 'Confirmed', thresholdHours: 6 },
  { stage: 'Ship within 24h of confirming', fromLabel: 'Confirmed', toLabel: 'Ready for Pickup', thresholdHours: 24 },
  { stage: 'Deliver within 120h of shipping', fromLabel: 'Ready for Pickup', toLabel: 'Delivered', thresholdHours: 120 },
];

export async function getSlaBreach(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const docs = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $project: {
          createdAt: 1,
          confirmedAt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Confirmed'] } } }, 0] },
          shippedAt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Ready for Pickup'] } } }, 0] },
          deliveredAt: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $in: ['$$h.label', ['Delivered', 'Partial Delivered']] } } }, 0] },
        },
      },
    ])
    .toArray();

  const fieldFor = (label: string | null) => (label === 'Confirmed' ? 'confirmedAt' : label === 'Ready for Pickup' ? 'shippedAt' : label === 'Delivered' ? 'deliveredAt' : 'createdAt');

  const rows = SLA_THRESHOLDS.map((t) => {
    const fromField = fieldFor(t.fromLabel);
    const toField = fieldFor(t.toLabel);
    let total = 0;
    let breached = 0;
    for (const d of docs) {
      const from = fromField === 'createdAt' ? d.createdAt : d[fromField]?.at;
      if (!from) continue;
      const to = d[toField]?.at;
      // An order that never reached the "to" stage is the worst case, not a non-case — excluding it
      // entirely (the old behavior) dropped exactly the stuck orders that should most inflate the
      // breach rate. If it's still open, judge it against "now": only count it once it has actually
      // blown the threshold (still-open-but-within-grace-period isn't a breach yet either way).
      const elapsedHours = ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 3_600_000;
      if (!to && elapsedHours <= t.thresholdHours) continue;
      total += 1;
      if (elapsedHours > t.thresholdHours) breached += 1;
    }
    return { stage: t.stage, thresholdHours: t.thresholdHours, totalOrders: total, breachedCount: breached, breachRate: total > 0 ? Math.round((breached / total) * 1000) / 10 : null };
  });

  const dto: SlaBreachDTO = { rows };
  res.json({ success: true, slaBreach: dto });
}

// --- Phase 9: closing the "mandatory" gaps from the user's own COD-metrics checklist ---

export async function getCallOutcomes(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...match, history: { $elemMatch: { label: 'Call attempt', at: { $gte: current.from, $lt: current.to } } } } },
      { $unwind: '$history' },
      { $match: { 'history.label': 'Call attempt', 'history.at': { $gte: current.from, $lt: current.to } } },
      { $group: { _id: '$history.detail', count: { $sum: 1 } } },
    ])
    .toArray();

  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id ?? 'No outcome recorded', label: r._id ?? 'No outcome recorded', count: r.count, value: r.count })));
  res.json({ success: true, breakdown });
}

export async function getFlagReasons(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.stage = 'Flagged';
  match.flagReason = { $ne: null };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      // flagReason is free text with per-order specifics baked in ("Out of stock: Leather Bag (2 of
      // 5 available)...") — grouping on the prefix before the first colon turns it back into a real
      // category instead of a long tail of one-off strings.
      { $group: { _id: { $arrayElemAt: [{ $split: ['$flagReason', ':'] }, 0] }, count: { $sum: 1 }, value: { $sum: '$total' } } },
    ])
    .toArray();

  const breakdown = buildBreakdown(rows.map((r) => ({ key: r._id, label: r._id, count: r.count, value: r.value })));
  res.json({ success: true, breakdown });
}

export async function getRescheduleEffectiveness(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  // holdReason/rescheduledFor both clear on resume, so the durable signal that an order was ever
  // rescheduled lives in its history — buildOrderUpdate writes the hold reason into the entry's
  // detail the moment it goes On Hold for that reason.
  match.history = { $elemMatch: { label: 'On Hold', detail: { $regex: '^Customer requested reschedule' } } };

  const rows = await db.collection('orders').aggregate([{ $match: match }, { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$total' } } }]).toArray();

  const CONVERTED = ['Delivered', 'Partial Delivered'];
  const LOST = ['Cancelled', 'Returned'];
  let converted = 0;
  let lost = 0;
  let pending = 0;
  const outcomeRows: { key: string; label: string; count: number; value: number }[] = [
    { key: 'Converted', label: 'Converted (delivered)', count: 0, value: 0 },
    { key: 'Lost', label: 'Lost (cancelled/returned)', count: 0, value: 0 },
    { key: 'Pending', label: 'Still in progress', count: 0, value: 0 },
  ];
  for (const r of rows) {
    const bucket = CONVERTED.includes(r._id) ? outcomeRows[0] : LOST.includes(r._id) ? outcomeRows[1] : outcomeRows[2];
    bucket.count += r.count;
    bucket.value += r.value;
    if (CONVERTED.includes(r._id)) converted += r.count;
    else if (LOST.includes(r._id)) lost += r.count;
    else pending += r.count;
  }
  const totalRescheduled = converted + lost + pending;

  const dto: RescheduleEffectivenessDTO = {
    totalRescheduled,
    convertedCount: converted,
    conversionRate: totalRescheduled > 0 ? Math.round((converted / totalRescheduled) * 1000) / 10 : null,
    breakdown: buildBreakdown(outcomeRows),
  };
  res.json({ success: true, rescheduleEffectiveness: dto });
}

export async function getBlocklistHitRate(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  const dateMatch = { ...match, createdAt: { $gte: current.from, $lt: current.to } };
  const blockedMatch = { ...dateMatch, stage: 'Cancelled', cancelReason: 'Blocked customer' };

  const [totalAgg] = await db.collection('orders').aggregate([{ $match: dateMatch }, { $group: { _id: null, count: { $sum: 1 } } }]).toArray();
  const [blockedAgg] = await db.collection('orders').aggregate([{ $match: blockedMatch }, { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$total' } } }]).toArray();
  const series = await runAnalyticsSeries({ ...match, stage: 'Cancelled', cancelReason: 'Blocked customer' }, q, { $sum: 1 });

  const totalOrders = totalAgg?.count ?? 0;
  const blockedHits = blockedAgg?.count ?? 0;
  const dto: BlocklistHitRateDTO = {
    totalOrders,
    blockedHits,
    hitRate: totalOrders > 0 ? Math.round((blockedHits / totalOrders) * 1000) / 10 : null,
    valueBlocked: blockedAgg?.value ?? 0,
    series,
  };
  res.json({ success: true, blocklistHitRate: dto });
}

export async function getRtoLoss(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.stage = { $in: ['Returned', 'RTO Initiated', 'QC Pending'] };

  const [agg] = await db
    .collection('orders')
    .aggregate([{ $match: match }, { $group: { _id: null, count: { $sum: 1 }, courierCharges: { $sum: { $ifNull: ['$courierCharge', 0] } }, shippingFees: { $sum: '$shippingFee' } } }])
    .toArray();

  const count = agg?.count ?? 0;
  const courierCharges = agg?.courierCharges ?? 0;
  const shippingFees = agg?.shippingFees ?? 0;

  // Deliberately excludes damaged-stock write-off value — shrinkage from a failed return is logged
  // per SKU (logReturnShrinkage), not per order, so it can't be attributed back to *this* RTO'd
  // order without guessing. This is the courier/shipping-cost floor of the real loss, not the ceiling.
  // `courierCharge` is only ever set once, at dispatch (see dispatchCourierConsignment) — it's the
  // one-way outbound fee, not a round-trip figure, since no return-leg charge is captured anywhere.
  const breakdown = buildBreakdown([
    { key: 'courierCharges', label: 'Courier charges (outbound)', count, value: courierCharges },
    { key: 'shippingFees', label: 'Original shipping fee', count, value: shippingFees },
  ]);

  const dto: RtoLossDTO = { totalLoss: Math.round((courierCharges + shippingFees) * 100) / 100, breakdown };
  res.json({ success: true, rtoLoss: dto });
}

// Order-level view of the return pipeline — returnedProducts is per-SKU and rtoLoss is purely the
// cost side; this is "how many orders, which stage of the RTO Initiated/QC Pending/Returned leg
// they're currently sitting in, and which courier/store they're coming from." Same
// ['RTO Initiated', 'QC Pending', 'Returned'] stage set used by getReturnedProducts/getRtoLoss.
export async function getOrderReturnReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  const returnMatch = { ...match, stage: { $in: ['RTO Initiated', 'QC Pending', 'Returned'] } };

  const STAGE_LABELS: Record<string, string> = { 'RTO Initiated': 'RTO in transit', 'QC Pending': 'Awaiting QC', Returned: 'Returned to stock' };

  const [totalAgg, shippedAgg, stageRows, courierRows, storeRows, stores] = await Promise.all([
    db.collection('orders').aggregate([{ $match: returnMatch }, { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$total' } } }]).toArray(),
    // Denominator for return rate: every order that ever left Processing in the period, whatever
    // it went on to become — same "shipped-or-beyond" set getReturnedProducts uses per-unit.
    db
      .collection('orders')
      .aggregate([
        { $match: { ...match, stage: { $in: ['Ready for Pickup', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending', 'Delivered', 'Partial Delivered', 'Returned'] } } },
        { $group: { _id: null, count: { $sum: 1 } } },
      ])
      .toArray(),
    db.collection('orders').aggregate([{ $match: returnMatch }, { $group: { _id: '$stage', count: { $sum: 1 }, value: { $sum: '$total' } } }]).toArray(),
    db.collection('orders').aggregate([{ $match: returnMatch }, { $group: { _id: { $ifNull: ['$courierPartner', 'Unassigned'] }, count: { $sum: 1 }, value: { $sum: '$total' } } }]).toArray(),
    db.collection('orders').aggregate([{ $match: returnMatch }, { $group: { _id: '$storeId', count: { $sum: 1 }, value: { $sum: '$total' } } }]).toArray(),
    db.collection('stores').find({ tenantId }).project({ displayName: 1 }).toArray(),
  ]);

  const storeNameById = new Map(stores.map((s) => [s._id.toString(), s.displayName as string]));
  const totalCount = totalAgg[0]?.count ?? 0;
  const totalValue = totalAgg[0]?.value ?? 0;
  const shippedOrBeyond = shippedAgg[0]?.count ?? 0;

  const dto: OrderReturnReportDTO = {
    totalCount,
    totalValue,
    returnRate: shippedOrBeyond > 0 ? Math.round((totalCount / shippedOrBeyond) * 1000) / 10 : null,
    byStage: buildBreakdown(stageRows.map((r) => ({ key: r._id, label: STAGE_LABELS[r._id] ?? r._id, count: r.count, value: r.value }))),
    byCourier: buildBreakdown(courierRows.map((r) => ({ key: r._id, label: r._id, count: r.count, value: r.value }))),
    byStore: buildBreakdown(
      storeRows.map((r) => ({ key: r._id?.toString() ?? 'unknown', label: storeNameById.get(r._id?.toString()) ?? 'Unknown store', count: r.count, value: r.value }))
    ),
  };
  res.json({ success: true, returnReport: dto });
}

export async function getMarginWaterfall(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  const dateMatch = { ...match, createdAt: { $gte: current.from, $lt: current.to } };

  const [grossAgg, lostAgg, deliveredAgg] = await Promise.all([
    db.collection('orders').aggregate([{ $match: dateMatch }, { $group: { _id: null, total: { $sum: '$total' }, discount: { $sum: '$discount' } } }]).toArray(),
    // Must match every stage "Gross sales" counts but never converts to real revenue — RTO
    // Initiated/QC Pending orders are still in-flight back to the warehouse, not yet Returned, but
    // their full `total` is already sitting in `gross` above with nothing here to deduct it.
    db.collection('orders').aggregate([{ $match: { ...dateMatch, stage: { $in: ['Cancelled', 'Returned', 'RTO Initiated', 'QC Pending'] } } }, { $group: { _id: null, total: { $sum: '$total' } } }]).toArray(),
    db
      .collection('orders')
      .aggregate([
        { $match: { ...dateMatch, stage: { $in: ['Delivered', 'Partial Delivered'] } } },
        { $group: { _id: null, courierCharges: { $sum: { $ifNull: ['$courierCharge', 0] } }, cogs: { $sum: { $ifNull: ['$cogsTotal', 0] } } } },
      ])
      .toArray(),
  ]);

  const gross = grossAgg[0]?.total ?? 0;
  const discount = grossAgg[0]?.discount ?? 0;
  const lost = lostAgg[0]?.total ?? 0;
  const courierCharges = deliveredAgg[0]?.courierCharges ?? 0;
  const cogs = deliveredAgg[0]?.cogs ?? 0;
  const netProfit = gross - discount - lost - courierCharges - cogs;

  const dto: MarginWaterfallDTO = {
    steps: [
      { label: 'Gross sales', value: Math.round(gross * 100) / 100 },
      { label: 'Discounts', value: -Math.round(discount * 100) / 100 },
      { label: 'Cancelled/RTO loss', value: -Math.round(lost * 100) / 100 },
      { label: 'Courier charges', value: -Math.round(courierCharges * 100) / 100 },
      { label: 'COGS', value: -Math.round(cogs * 100) / 100 },
    ],
    netProfit: Math.round(netProfit * 100) / 100,
  };
  res.json({ success: true, marginWaterfall: dto });
}

export async function getCohortRetention(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);

  const docs = await db
    .collection('orders')
    .find({ ...match, customerPhone: { $ne: null } })
    .project({ customerPhone: 1, createdAt: 1 })
    .toArray();

  const byPhone = new Map<string, Date[]>();
  for (const d of docs) {
    const arr = byPhone.get(d.customerPhone) ?? [];
    arr.push(new Date(d.createdAt));
    byPhone.set(d.customerPhone, arr);
  }

  const cohorts = new Map<string, { newCustomers: number; retained30: number; retained60: number; retained90: number }>();
  for (const dates of byPhone.values()) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0];
    const cohortMonth = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, '0')}`;
    const bucket = cohorts.get(cohortMonth) ?? { newCustomers: 0, retained30: 0, retained60: 0, retained90: 0 };
    bucket.newCustomers += 1;
    const hasRepeatWithin = (days: number) => dates.some((d) => d.getTime() > first.getTime() && d.getTime() - first.getTime() <= days * 86_400_000);
    if (hasRepeatWithin(30)) bucket.retained30 += 1;
    if (hasRepeatWithin(60)) bucket.retained60 += 1;
    if (hasRepeatWithin(90)) bucket.retained90 += 1;
    cohorts.set(cohortMonth, bucket);
  }

  const now = Date.now();
  const rows: CohortRetentionRowDTO[] = [...cohorts.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 24)
    .map(([cohortMonth, b]) => {
      const cohortStartMs = new Date(`${cohortMonth}-01T00:00:00.000Z`).getTime();
      const daysSinceCohortStart = (now - cohortStartMs) / 86_400_000;
      return {
        cohortMonth,
        newCustomers: b.newCustomers,
        // Null, not 0%, until the cohort has actually had time to mature — a cohort from last week
        // can't have a meaningful 90-day retention figure yet.
        retained30d: daysSinceCohortStart >= 30 ? Math.round((b.retained30 / b.newCustomers) * 1000) / 10 : null,
        retained60d: daysSinceCohortStart >= 60 ? Math.round((b.retained60 / b.newCustomers) * 1000) / 10 : null,
        retained90d: daysSinceCohortStart >= 90 ? Math.round((b.retained90 / b.newCustomers) * 1000) / 10 : null,
      };
    });

  const dto: CohortRetentionDTO = { rows };
  res.json({ success: true, cohortRetention: dto });
}

// --- Product-wise order-outcome breakdown: for every product ordered in the selected period, how
// many of those orders got cancelled, RTO'd, or delivered — the per-product view topProducts (pure
// revenue) and returnedProducts (post-shipment only) don't give on their own. ---

export async function getProductPerformance(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] },
          title: { $first: '$lineItems.title' },
          image: { $first: '$lineItems.image' },
          orderCount: { $sum: 1 },
          unitsOrdered: { $sum: '$lineItems.quantity' },
          revenue: { $sum: { $multiply: ['$lineItems.quantity', '$lineItems.price'] } },
          cancelledOrders: { $sum: { $cond: [{ $eq: ['$stage', 'Cancelled'] }, 1, 0] } },
          cancelledUnits: { $sum: { $cond: [{ $eq: ['$stage', 'Cancelled'] }, '$lineItems.quantity', 0] } },
          spamOrders: { $sum: { $cond: [{ $and: [{ $eq: ['$stage', 'Cancelled'] }, { $eq: ['$cancelReason', 'Spam'] }] }, 1, 0] } },
          duplicateOrders: { $sum: { $cond: [{ $and: [{ $eq: ['$stage', 'Cancelled'] }, { $eq: ['$cancelReason', 'Duplicate order'] }] }, 1, 0] } },
          deliveredOrders: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          deliveredUnits: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, '$lineItems.quantity', 0] } },
          rtoOrders: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
          rtoUnits: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, '$lineItems.quantity', 0] } },
        },
      },
      { $sort: { orderCount: -1 } },
      { $limit: limit },
    ])
    .toArray();

  const dto: ProductPerformanceDTO = {
    rows: rows.map((r) => {
      const resolved = r.deliveredOrders + r.rtoOrders;
      return {
        productId: r._id ?? 'unknown',
        title: r.title ?? 'Untitled product',
        image: r.image ?? null,
        orderCount: r.orderCount,
        unitsOrdered: r.unitsOrdered,
        revenue: r.revenue,
        cancelledOrders: r.cancelledOrders,
        cancelledUnits: r.cancelledUnits,
        cancelRate: r.orderCount > 0 ? Math.round((r.cancelledOrders / r.orderCount) * 1000) / 10 : null,
        spamOrders: r.spamOrders,
        spamRate: r.orderCount > 0 ? Math.round((r.spamOrders / r.orderCount) * 1000) / 10 : null,
        duplicateOrders: r.duplicateOrders,
        duplicateRate: r.orderCount > 0 ? Math.round((r.duplicateOrders / r.orderCount) * 1000) / 10 : null,
        rtoOrders: r.rtoOrders,
        rtoUnits: r.rtoUnits,
        rtoRate: resolved > 0 ? Math.round((r.rtoOrders / resolved) * 1000) / 10 : null,
        deliveredOrders: r.deliveredOrders,
        deliveredUnits: r.deliveredUnits,
        deliveredRate: resolved > 0 ? Math.round((r.deliveredOrders / resolved) * 1000) / 10 : null,
      };
    }),
  };
  res.json({ success: true, productPerformance: dto });
}

// --- Gaps closed against a second, separately-sourced BD-courier-tool report checklist. ---

// Same "last qualifying event per order, not per matching history entry" fix as windowGrossProfit —
// an order can carry more than one 'Confirmed' event (confirmed, held from Confirmed, resumed back
// into Confirmed re-pushes the label), so a plain unwind+match would double-count that order.
async function windowConfirmedSales(match: Record<string, unknown>, window: TrendWindow, granularity: TrendGranularity, bucketCount: number): Promise<AnalyticsSeriesWindowDTO> {
  return bucketedWindowWithPipeline(
    'orders',
    [
      { $match: { ...match, history: { $elemMatch: { label: 'Confirmed', at: { $gte: window.from, $lt: window.to } } } } },
      {
        $addFields: {
          qualifyingEvent: {
            $arrayElemAt: [
              { $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $and: [{ $eq: ['$$h.label', 'Confirmed'] }, { $gte: ['$$h.at', window.from] }, { $lt: ['$$h.at', window.to] }] } } },
              -1,
            ],
          },
        },
      },
    ],
    window,
    granularity,
    bucketCount,
    { $sum: '$total' },
    'qualifyingEvent.at'
  );
}

// "How much did we confirm today", not "how much came in today" — every other *OverTime card in
// this file buckets by order creation date, but a lot of what's created never confirms (junk/fraud/
// no-answer), which understates a COD business's real day-to-day pace. Bucketed by the order's own
// Confirmed-event date instead.
export async function getConfirmedSalesOverTime(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { granularity, bucketCount, current, comparison } = resolveRange(q.range, q.from, q.to, q.comparisonMode, q.comparisonFrom, q.comparisonTo);
  const skipComparison = comparisonDisabled(q);
  const [currentWindow, comparisonWindow] = await Promise.all([
    windowConfirmedSales(match, current, granularity, bucketCount),
    skipComparison ? Promise.resolve(emptySeriesWindow(comparison)) : windowConfirmedSales(match, comparison, granularity, bucketCount),
  ]);
  const totalCurrent = currentWindow.points.reduce((s, p) => s + p.value, 0);
  const totalComparison = comparisonWindow.points.reduce((s, p) => s + p.value, 0);
  const series: AnalyticsSeriesDTO = {
    granularity,
    current: currentWindow,
    comparison: comparisonWindow,
    totalCurrent,
    totalComparison,
    trend: skipComparison ? null : pctTrend(totalCurrent, totalComparison),
  };
  res.json({ success: true, series });
}

// Every order placed in the period, split by paymentStatus — the specific thing this surfaces is
// 'Advance Paid' volume (an upfront deposit meant to screen out fake COD orders) and, via
// secondaryRate, whether it actually correlates with a higher delivered rate the way it's supposed to.
export async function getPaymentStatusBreakdown(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: '$paymentStatus',
          count: { $sum: 1 },
          value: { $sum: '$total' },
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
        },
      },
    ])
    .toArray();

  const breakdown = buildBreakdown(
    rows.map((r) => {
      const resolved = r.delivered + r.rto;
      return { key: r._id ?? 'Unknown', label: r._id ?? 'Unknown', count: r.count, value: r.value, secondaryRate: resolved > 0 ? Math.round((r.delivered / resolved) * 1000) / 10 : null };
    })
  );
  res.json({ success: true, breakdown });
}

// Broader than confirmationPerformance's byAgent (which only ever looks at who confirmed) — every
// history event with a `by` is one staff action, so this covers who's shipping fastest, clearing
// holds, and making calls, not just who's confirming orders.
export async function getEmployeeActivity(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...match, history: { $elemMatch: { by: { $ne: null }, at: { $gte: current.from, $lt: current.to } } } } },
      { $unwind: '$history' },
      { $match: { 'history.by': { $ne: null }, 'history.at': { $gte: current.from, $lt: current.to } } },
      {
        $group: {
          _id: '$history.by',
          totalActions: { $sum: 1 },
          confirmed: { $sum: { $cond: [{ $eq: ['$history.label', 'Confirmed'] }, 1, 0] } },
          shipped: { $sum: { $cond: [{ $eq: ['$history.label', 'Ready for Pickup'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['$history.label', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          cancelled: { $sum: { $cond: [{ $eq: ['$history.label', 'Cancelled'] }, 1, 0] } },
          // Matches both the current wording and the older "Resumed from hold" text still sitting
          // in history entries written before the button was renamed to Reattempt — otherwise this
          // count would silently drop every hold resolved before the rename.
          holdResolved: { $sum: { $cond: [{ $in: ['$history.detail', ['Reattempted from hold', 'Resumed from hold']] }, 1, 0] } },
          callAttempts: { $sum: { $cond: [{ $eq: ['$history.label', 'Call attempt'] }, 1, 0] } },
        },
      },
      { $sort: { totalActions: -1 } },
    ])
    .toArray();

  const dto: EmployeeActivityDTO = {
    rows: rows.map((r) => ({
      agent: r._id,
      totalActions: r.totalActions,
      confirmed: r.confirmed,
      shipped: r.shipped,
      delivered: r.delivered,
      cancelled: r.cancelled,
      holdResolved: r.holdResolved,
      callAttempts: r.callAttempts,
    })),
  };
  res.json({ success: true, employeeActivity: dto });
}

// The cross-cut neither courierPerformance (per-courier only) nor productPerformance (per-product
// only) gives: for THIS product via THIS courier, what's the delivered/RTO rate — the thing you'd
// actually want before deciding "route this SKU's parcels to the other courier instead."
export async function getProductCourierHistory(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);
  match.createdAt = { $gte: current.from, $lt: current.to };
  match.courierPartner = { $ne: null };
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: match },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: { key: { $ifNull: ['$lineItems.sku', '$lineItems.title'] }, courierPartner: '$courierPartner' },
          title: { $first: '$lineItems.title' },
          unitsShipped: { $sum: '$lineItems.quantity' },
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, '$lineItems.quantity', 0] } },
          rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, '$lineItems.quantity', 0] } },
        },
      },
      { $sort: { unitsShipped: -1 } },
      { $limit: limit },
    ])
    .toArray();

  const dto: ProductCourierHistoryDTO = {
    rows: rows.map((r) => {
      const resolved = r.delivered + r.rto;
      return {
        productId: r._id.key ?? 'unknown',
        title: r.title ?? 'Untitled product',
        courierPartner: r._id.courierPartner,
        unitsShipped: r.unitsShipped,
        deliveredRate: resolved > 0 ? Math.round((r.delivered / resolved) * 1000) / 10 : null,
        rtoRate: resolved > 0 ? Math.round((r.rto / resolved) * 1000) / 10 : null,
      };
    }),
  };
  res.json({ success: true, productCourierHistory: dto });
}

// Raw daily order volume, every stage included — "leads" in COD-seller vocabulary means every
// incoming order before it's screened, which is exactly what this counts (unlike salesOverTime,
// which sums revenue, or orderFunnel, which only covers the currently-selected period as one total
// rather than a day-by-day trend).
export async function getDailyLeadQuantity(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const series = await runAnalyticsSeries(baseMatch(tenantId, q.storeId), q, { $sum: 1 });
  res.json({ success: true, series });
}

// Reads the 'COD amount changed' history event buildOrderUpdate now pushes whenever a shippingFee/
// discount edit actually moves an order's total — previously invisible, since no history entry
// existed for it at all. `detail` is a formatted "৳X → ৳Y" string (see buildOrderUpdate), parsed
// back out here rather than in the aggregation pipeline since regex capture-group math isn't worth
// expressing as a Mongo expression for what's normally a low-volume event.
export async function getCodChangeLog(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const match = baseMatch(tenantId, q.storeId);
  const { current } = resolveRange(q.range, q.from, q.to);

  const docs = await db
    .collection('orders')
    .aggregate([
      { $match: { ...match, history: { $elemMatch: { label: 'COD amount changed', at: { $gte: current.from, $lt: current.to } } } } },
      { $unwind: '$history' },
      { $match: { 'history.label': 'COD amount changed', 'history.at': { $gte: current.from, $lt: current.to } } },
      { $project: { by: '$history.by', detail: '$history.detail' } },
    ])
    .toArray();

  const byAgent = new Map<string, { count: number; totalDelta: number }>();
  for (const d of docs) {
    const agent = d.by ?? 'Unknown';
    const parsed = /৳([\d.]+) → ৳([\d.]+)/.exec(d.detail ?? '');
    const delta = parsed ? Math.abs(Number(parsed[2]) - Number(parsed[1])) : 0;
    const bucket = byAgent.get(agent) ?? { count: 0, totalDelta: 0 };
    bucket.count += 1;
    bucket.totalDelta += delta;
    byAgent.set(agent, bucket);
  }

  const breakdown = buildBreakdown([...byAgent.entries()].map(([agent, b]) => ({ key: agent, label: agent, count: b.count, value: Math.round(b.totalDelta * 100) / 100 })));
  res.json({ success: true, breakdown });
}

// COD collected per HANDOVER date rather than order-creation date — reads the separate
// courierHandovers collection (see couriersController.ts), not orders, since a handover batch's
// date is when parcels were physically bagged up for the courier, unrelated to when any of those
// orders were originally placed. Tenant-wide only: handovers aren't scoped to a single store.
export async function getHandoverSales(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const q = parseBaseQuery(req);
  const series = await runAnalyticsSeries({ tenantId }, q, { $sum: '$totalCodAmount' }, 'courierHandovers', 'handoverDate');
  res.json({ success: true, series });
}
