import type { Response } from 'express';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { resolveRange, bucketLabel, bucketIndexExpr, type TrendGranularity, type TrendWindow } from '../utils/dateRange.js';
import type {
  CallCenterAgentDTO,
  CallCenterHourlyVolumeDTO,
  CallCenterKpisDTO,
  CallCenterLeaderboardEntryDTO,
  CallCenterOverviewDTO,
  CallCenterPresenceStatus,
  CallCenterQueueItemDTO,
  TeamRole,
} from '@zetsales/shared';

// A call is "in progress" for ACTIVE_WINDOW_MS after the agent's most recent order-history action.
// There is no manual sign-in/sign-out or break tracking in Call Center.
const ACTIVE_WINDOW_MS = 90_000;
const QUEUE_LIMIT = 40;
const SLA_MINUTES = 120;
const FAILED_OUTCOMES = ['No Answer', 'Wrong Number', 'Switched Off', 'Busy', 'Customer Cancelled'];

function scopedOrderMatch(tenantId: string, storeId?: string): Record<string, unknown> {
  return storeId ? { tenantId, storeId } : { tenantId };
}

function historyRange(from: Date, to: Date): Record<string, Date> {
  return { $gte: from, $lte: to };
}

function parseCallCenterQuery(req: AuthenticatedRequest) {
  const range = typeof req.query.range === 'string' ? req.query.range : 'today';
  const customFrom = typeof req.query.from === 'string' ? req.query.from : undefined;
  const customTo = typeof req.query.to === 'string' ? req.query.to : undefined;
  const storeId = typeof req.query.storeId === 'string' && req.query.storeId !== 'all' ? req.query.storeId : undefined;
  return { ...resolveRange(range, customFrom, customTo), storeId };
}

async function loadAgentStats(tenantId: string, window: TrendWindow, storeId?: string) {
  const db = getDb();
  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...scopedOrderMatch(tenantId, storeId), history: { $elemMatch: { by: { $ne: null }, at: historyRange(window.from, window.to) } } } },
      { $unwind: '$history' },
      { $match: { 'history.by': { $ne: null }, 'history.at': historyRange(window.from, window.to) } },
      {
        $group: {
          _id: '$history.by',
          callsToday: { $sum: { $cond: [{ $eq: ['$history.label', 'Call attempt'] }, 1, 0] } },
          confirmedToday: { $sum: { $cond: [{ $eq: ['$history.label', 'Confirmed'] }, 1, 0] } },
          failedToday: {
            $sum: { $cond: [{ $and: [{ $eq: ['$history.label', 'Call attempt'] }, { $in: ['$history.detail', FAILED_OUTCOMES] }] }, 1, 0] },
          },
          lastActionAt: { $max: '$history.at' },
        },
      },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id as string, r]));
}

async function loadAgentQualityStats(tenantId: string, storeId?: string) {
  const db = getDb();
  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: scopedOrderMatch(tenantId, storeId) },
      { $addFields: { confirmEvent: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$history', []] }, as: 'h', cond: { $eq: ['$$h.label', 'Confirmed'] } } }, 0] } } },
      { $match: { confirmEvent: { $ne: null } } },
      {
        $group: {
          _id: '$confirmEvent.by',
          delivered: { $sum: { $cond: [{ $in: ['$stage', ['Delivered', 'Partial Delivered']] }, 1, 0] } },
          rto: { $sum: { $cond: [{ $in: ['$stage', ['RTO Initiated', 'QC Pending', 'Returned']] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  return new Map(
    rows.map((r) => {
      const resolved = r.delivered + r.rto;
      return [r._id as string, resolved > 0 ? Math.round((r.delivered / resolved) * 1000) / 10 : null];
    })
  );
}

async function loadConfirmTimes(tenantId: string, window: TrendWindow, storeId?: string) {
  const db = getDb();
  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...scopedOrderMatch(tenantId, storeId), history: { $elemMatch: { label: 'Confirmed', at: historyRange(window.from, window.to) } } } },
      {
        $addFields: {
          confirmEvent: {
            $arrayElemAt: [
              {
                $filter: {
                  input: '$history',
                  as: 'h',
                  cond: { $and: [{ $eq: ['$$h.label', 'Confirmed'] }, { $gte: ['$$h.at', window.from] }, { $lte: ['$$h.at', window.to] }] },
                },
              },
              0,
            ],
          },
        },
      },
      { $match: { 'confirmEvent.at': historyRange(window.from, window.to) } },
      { $addFields: { timeToConfirmMinutes: { $divide: [{ $subtract: ['$confirmEvent.at', '$createdAt'] }, 60000] } } },
      { $group: { _id: '$confirmEvent.by', avgTimeToConfirmMinutes: { $avg: '$timeToConfirmMinutes' } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [r._id as string, Math.round(r.avgTimeToConfirmMinutes)]));
}

function visibleBucketCount(granularity: TrendGranularity, window: TrendWindow, bucketCount: number): number {
  const spanMs = Math.max(0, window.to.getTime() - window.from.getTime());
  if (granularity === 'hour') return Math.min(bucketCount, Math.floor(spanMs / 3_600_000) + 1);
  if (granularity === 'day') return Math.min(bucketCount, Math.floor(spanMs / 86_400_000) + 1);
  return bucketCount;
}

async function loadHourlyVolume(tenantId: string, window: TrendWindow, granularity: TrendGranularity, bucketCount: number, storeId?: string): Promise<CallCenterHourlyVolumeDTO[]> {
  const db = getDb();
  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...scopedOrderMatch(tenantId, storeId), history: { $elemMatch: { label: { $in: ['Call attempt', 'Confirmed'] }, at: historyRange(window.from, window.to) } } } },
      { $unwind: '$history' },
      { $match: { 'history.label': { $in: ['Call attempt', 'Confirmed'] }, 'history.at': historyRange(window.from, window.to) } },
      {
        $group: {
          _id: bucketIndexExpr(granularity, window.from, 'history.at'),
          calls: { $sum: { $cond: [{ $eq: ['$history.label', 'Call attempt'] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $eq: ['$history.label', 'Confirmed'] }, 1, 0] } },
        },
      },
    ])
    .toArray();
  const byBucket = new Map(rows.map((r) => [r._id as number, r]));
  const points: CallCenterHourlyVolumeDTO[] = [];
  const pointCount = visibleBucketCount(granularity, window, bucketCount);
  for (let i = 0; i < pointCount; i++) {
    const r = byBucket.get(i);
    points.push({ hour: i, label: bucketLabel(granularity, window.from, i), calls: r?.calls ?? 0, confirmed: r?.confirmed ?? 0 });
  }
  return points;
}

async function loadQueue(tenantId: string, storeId?: string): Promise<{ queue: CallCenterQueueItemDTO[]; slaBreachCount: number }> {
  const db = getDb();
  const docs = await db
    .collection('orders')
    .find({ ...scopedOrderMatch(tenantId, storeId), stage: { $in: ['Pending', 'Flagged'] } })
    .sort({ isPriorityCall: -1, createdAt: 1 })
    .limit(QUEUE_LIMIT)
    .toArray();

  const now = Date.now();
  let slaBreachCount = 0;
  const queue: CallCenterQueueItemDTO[] = docs.map((doc) => {
    const waitingMinutes = Math.round((now - new Date(doc.createdAt).getTime()) / 60000);
    if (waitingMinutes > SLA_MINUTES) slaBreachCount += 1;
    const lastCallEvent = [...(doc.history ?? [])].reverse().find((h: any) => h.label === 'Call attempt');
    return {
      orderId: doc._id.toString(),
      number: doc.number,
      customerName: doc.customerName ?? null,
      customerPhone: doc.customerPhone ?? null,
      total: doc.total,
      callAttempts: doc.callAttempts ?? 0,
      waitingMinutes,
      lastOutcome: lastCallEvent?.detail ?? null,
      isPriorityCall: doc.isPriorityCall ?? false,
    };
  });
  return { queue, slaBreachCount };
}

export async function getCallCenterOverview(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { current, granularity, bucketCount, storeId } = parseCallCenterQuery(req);

  const [members, statsByAgent, qualityStats, confirmTimes, hourlyVolume, { queue, slaBreachCount }] = await Promise.all([
    db.collection('users').find({ tenantId, role: { $ne: 'viewer' } }).project({ email: 1, role: 1 }).toArray(),
    loadAgentStats(tenantId, current, storeId),
    loadAgentQualityStats(tenantId, storeId),
    loadConfirmTimes(tenantId, current, storeId),
    loadHourlyVolume(tenantId, current, granularity, bucketCount, storeId),
    loadQueue(tenantId, storeId),
  ]);

  const now = Date.now();

  const agents: CallCenterAgentDTO[] = members.map((m) => {
    const email = m.email as string;
    const stats = statsByAgent.get(email);
    const lastActionAt = stats?.lastActionAt ? new Date(stats.lastActionAt).getTime() : null;

    let status: CallCenterPresenceStatus;
    let statusSince: number;
    if (lastActionAt && now - lastActionAt < ACTIVE_WINDOW_MS) {
      status = 'onCall';
      statusSince = lastActionAt;
    } else if (lastActionAt) {
      status = 'available';
      statusSince = lastActionAt;
    } else {
      status = 'offline';
      statusSince = current.from.getTime();
    }

    return {
      email,
      role: (m.role as TeamRole) ?? 'agent',
      status,
      statusSince: new Date(statusSince).toISOString(),
      statusDurationSeconds: Math.max(0, Math.round((now - statusSince) / 1000)),
      callsToday: stats?.callsToday ?? 0,
      confirmedToday: stats?.confirmedToday ?? 0,
      failedToday: stats?.failedToday ?? 0,
      avgTimeToConfirmMinutes: confirmTimes.get(email) ?? null,
      isYou: email === req.user!.email,
    };
  });

  let callsToday = 0;
  let confirmedToday = 0;
  let failedToday = 0;
  for (const s of statsByAgent.values()) {
    callsToday += s.callsToday;
    confirmedToday += s.confirmedToday;
    failedToday += s.failedToday;
  }
  const allConfirmMinutes = [...confirmTimes.values()];
  const avgTimeToConfirmMinutesToday = allConfirmMinutes.length > 0 ? Math.round(allConfirmMinutes.reduce((a, b) => a + b, 0) / allConfirmMinutes.length) : null;

  const kpis: CallCenterKpisDTO = {
    callsToday,
    confirmedToday,
    failedToday,
    rescheduledToday: 0,
    pendingQueueCount: queue.length,
    confirmationRateToday: callsToday > 0 ? Math.round((confirmedToday / callsToday) * 1000) / 10 : null,
    avgTimeToConfirmMinutesToday,
    avgTimeToFirstCallMinutesToday: null,
    slaBreachCount,
  };

  const leaderboard: CallCenterLeaderboardEntryDTO[] = [...statsByAgent.entries()]
    .filter(([, s]) => s.confirmedToday > 0)
    .sort((a, b) => b[1].confirmedToday - a[1].confirmedToday)
    .slice(0, 8)
    .map(([email, s]) => {
      const deliveredRate = qualityStats.get(email) ?? null;
      const avgTimeToConfirmMinutes = confirmTimes.get(email) ?? null;
      const attemptsForScore = Math.max(1, s.callsToday / Math.max(1, s.confirmedToday));
      return {
        email,
        confirmedCount: s.confirmedToday,
        avgTimeToConfirmMinutes,
        deliveredRate,
        compositeScore: deliveredRate != null ? Math.round((deliveredRate / attemptsForScore) * 10) / 10 : null,
      };
    });

  const dto: CallCenterOverviewDTO = { kpis, agents, queue, hourlyVolume, leaderboard };
  res.json({ success: true, callCenter: dto });
}
