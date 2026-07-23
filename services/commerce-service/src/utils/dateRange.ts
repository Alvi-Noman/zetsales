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

// The comparison side of a range is user-selectable from Analytics' date-range control (see
// ComparisonMenu on the frontend): the "intelligently matched" period below is still the default
// (and the only option prior to this type existing), but a seller comparing seasonal sales cares
// about the same window last year, not last week.
export type ComparisonMode = 'previousPeriod' | 'previousYear' | 'previousYearMatchDay' | 'custom' | 'none';

// Maps a date-range preset to a (current window, comparison window, granularity) triple: a single
// day compares hour-by-hour against the previous day, a run of N days compares against the N days
// immediately before it, a month compares against the same elapsed span of the previous month, and
// a year compares month-by-month against the previous year. Both windows always resolve to the
// same bucket count so two series can be overlaid position-for-position (hour 0 vs hour 0, day 3
// vs day 3, etc) even though the real calendar dates differ.
function resolveBaseRange(range: string, customFrom?: string, customTo?: string): RangeResolution {
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
      const rawSpanMs = to.getTime() - from.getTime();
      // A single-day custom window (Home's "Today"/"Yesterday" filters, passed as explicit custom
      // bounds rather than the literal 'today'/'yesterday' range keys — see HomePage.tsx's
      // getOrderTrends call — to avoid resolving against the server's own clock instead of the
      // tenant's) still deserves an hourly curve, not a single flat day-bucket.
      if (rawSpanMs <= 25 * 3_600_000) {
        return { granularity: 'hour', bucketCount: 24, current: { from, to }, comparison: { from: addDays(from, -1), to: addDays(to, -1) } };
      }
      const spanMs = Math.max(rawSpanMs, 86_400_000);
      const bucketCount = Math.max(1, Math.ceil(spanMs / 86_400_000));
      return { granularity: 'day', bucketCount, current: { from, to }, comparison: { from: new Date(from.getTime() - spanMs), to: from } };
    }
    default:
      return daySpan(7);
  }
}

// Bangladesh doesn't observe DST, so a plain calendar-day arithmetic shift is safe here — no real
// timezone library needed (same reasoning as ordersController's dhakaDayBounds).
function addDaysUtc(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function shiftYear(d: Date, n: number): Date {
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

// Public entry point: resolves the (current, comparison, granularity) triple exactly as before by
// default (comparisonMode omitted or 'previousPeriod'), then optionally overrides just the
// comparison window — current/granularity/bucketCount are untouched, so this never disturbs the
// main series a caller is charting, only what it's measured against.
//
// 'none' is deliberately NOT special-cased here — it still resolves a real previousPeriod-shaped
// window so every existing call site keeps working unmodified. Suppressing the actual comparison
// line/trend number for 'none' happens one layer up, in analyticsController, at the handful of
// places that build an AnalyticsSeriesDTO — this function only ever answers "which two windows",
// not "should a caller display the second one".
export function resolveRange(
  range: string,
  customFrom?: string,
  customTo?: string,
  comparisonMode?: ComparisonMode,
  comparisonFrom?: string,
  comparisonTo?: string
): RangeResolution {
  const base = resolveBaseRange(range, customFrom, customTo);
  if (!comparisonMode || comparisonMode === 'previousPeriod' || comparisonMode === 'none') return base;

  if (comparisonMode === 'previousYear') {
    return { ...base, comparison: { from: shiftYear(base.current.from, -1), to: shiftYear(base.current.to, -1) } };
  }
  if (comparisonMode === 'previousYearMatchDay') {
    // Shifted by 364 days (52 whole weeks), not exactly one calendar year, so the comparison day
    // lands on the same weekday as today — a seller comparing "this Friday" wants last year's
    // Friday, not whatever weekday the same calendar date happened to fall on.
    return { ...base, comparison: { from: addDaysUtc(base.current.from, -364), to: addDaysUtc(base.current.to, -364) } };
  }
  if (comparisonMode === 'custom' && comparisonFrom && comparisonTo) {
    return { ...base, comparison: { from: new Date(comparisonFrom), to: new Date(comparisonTo) } };
  }
  return base;
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
