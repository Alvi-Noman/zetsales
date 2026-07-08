// Shared by ordersController (order pipeline trends) and analyticsController (every "over time"
// analytics card) — a single place that turns a date-range preset into a bucketed current window
// plus an "intelligently" matched comparison window (see resolveRange doc below), so every trend
// chart in the app compares apples to apples the same way.

export type TrendGranularity = 'hour' | 'day' | 'month';

export interface TrendWindow {
  from: Date;
  to: Date;
}

export interface RangeResolution {
  granularity: TrendGranularity;
  bucketCount: number;
  current: TrendWindow;
  comparison: TrendWindow;
}

// Maps a date-range preset to a (current window, comparison window, granularity) triple: a single
// day compares hour-by-hour against the previous day, a run of N days compares against the N days
// immediately before it, a month compares against the same elapsed span of the previous month, and
// a year compares month-by-month against the previous year. Both windows always resolve to the
// same bucket count so two series can be overlaid position-for-position (hour 0 vs hour 0, day 3
// vs day 3, etc) even though the real calendar dates differ.
export function resolveRange(range: string, customFrom?: string, customTo?: string): RangeResolution {
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

export function bucketDate(granularity: TrendGranularity, from: Date, index: number): Date {
  if (granularity === 'hour') return new Date(from.getTime() + index * 3_600_000);
  if (granularity === 'day') return new Date(from.getTime() + index * 86_400_000);
  return new Date(from.getFullYear(), from.getMonth() + index, 1);
}

export function bucketLabel(granularity: TrendGranularity, from: Date, index: number): string {
  const d = bucketDate(granularity, from, index);
  if (granularity === 'hour') return d.toLocaleTimeString('en-US', { hour: 'numeric' });
  if (granularity === 'day') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// Pure-JS mirror of bucketIndexExpr, for callers that already pulled documents into Node (e.g. to
// classify each one against a value that isn't a plain field, like "is this customer's first-ever
// order") instead of aggregating server-side.
export function bucketIndexJs(granularity: TrendGranularity, from: Date, date: Date): number {
  if (granularity === 'hour') return Math.floor((date.getTime() - from.getTime()) / 3_600_000);
  if (granularity === 'day') return Math.floor((date.getTime() - from.getTime()) / 86_400_000);
  return (date.getFullYear() - from.getFullYear()) * 12 + (date.getMonth() - from.getMonth());
}

// `dateField` is the bare Mongo field name (no leading `$'), e.g. 'createdAt'.
export function bucketIndexExpr(granularity: TrendGranularity, from: Date, dateField = 'createdAt'): Record<string, unknown> {
  const field = `$${dateField}`;
  if (granularity === 'hour') return { $floor: { $divide: [{ $subtract: [field, from] }, 3_600_000] } };
  if (granularity === 'day') return { $floor: { $divide: [{ $subtract: [field, from] }, 86_400_000] } };
  return {
    $add: [
      { $multiply: [{ $subtract: [{ $year: field }, from.getFullYear()] }, 12] },
      { $subtract: [{ $month: field }, from.getMonth() + 1] },
    ],
  };
}
