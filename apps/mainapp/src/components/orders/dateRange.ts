export type DateRangeKey = 'all' | 'today' | 'yesterday' | 'last7' | 'last14' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';

export interface CustomDateRange {
  from: string;
  to: string;
}

export const DATE_RANGE_LABELS: Record<DateRangeKey, string> = {
  all: 'All time',
  today: 'Today',
  yesterday: 'Yesterday',
  last7: 'Last 7 days',
  last14: 'Last 14 days',
  last30: 'Last 30 days',
  last90: 'Last 90 days',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  thisYear: 'This year',
  custom: 'Custom range',
};

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(23, 59, 59, 999);
  return copy;
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateInputToStart(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return startOfDay(new Date(year, month - 1, day));
}

function dateInputToEnd(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return endOfDay(new Date(year, month - 1, day));
}

export function formatRangeLabel(key: DateRangeKey, customRange?: CustomDateRange | null): string {
  if (key === 'custom' && customRange?.from && customRange?.to) {
    const from = dateInputToStart(customRange.from);
    const to = dateInputToEnd(customRange.to);
    if (from && to) {
      if (from.toDateString() === to.toDateString()) return formatShort(from);
      return `${formatShort(from)} - ${formatShort(to)}`;
    }
  }
  return DATE_RANGE_LABELS[key];
}

// Resolves a preset key into concrete from/to bounds sent to the API. Custom ranges pass their
// own explicit from/to instead of calling this.
export function getRangeBounds(key: DateRangeKey, customRange?: CustomDateRange | null): { from: string | null; to: string | null } {
  const now = new Date();
  switch (key) {
    case 'today':
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: startOfDay(y).toISOString(), to: endOfDay(y).toISOString() };
    }
    case 'last7': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: startOfDay(from).toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'last14': {
      const from = new Date(now);
      from.setDate(from.getDate() - 13);
      return { from: startOfDay(from).toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'last30': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: startOfDay(from).toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'last90': {
      const from = new Date(now);
      from.setDate(from.getDate() - 89);
      return { from: startOfDay(from).toISOString(), to: endOfDay(now).toISOString() };
    }
    case 'thisMonth':
      return { from: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)).toISOString(), to: endOfDay(now).toISOString() };
    case 'lastMonth': {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(from).toISOString(), to: endOfDay(to).toISOString() };
    }
    case 'thisYear':
      return { from: startOfDay(new Date(now.getFullYear(), 0, 1)).toISOString(), to: endOfDay(now).toISOString() };
    case 'custom': {
      const from = customRange?.from ? dateInputToStart(customRange.from) : null;
      const to = customRange?.to ? dateInputToEnd(customRange.to) : null;
      return { from: from?.toISOString() ?? null, to: to?.toISOString() ?? null };
    }
    default:
      return { from: null, to: null };
  }
}
