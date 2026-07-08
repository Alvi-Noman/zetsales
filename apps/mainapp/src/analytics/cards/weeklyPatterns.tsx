import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import type { WeeklyPatternDTO } from '@zetsales/shared';
import { getWeeklyPatterns } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { HeatmapGrid } from '../../components/analytics/charts/HeatmapGrid';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<WeeklyPatternDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getWeeklyPatterns(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const total = data?.cells.reduce((s, c) => s + c.orderCount, 0) ?? 0;
  return (
    <AnalyticsCardShell title="Weekly sales patterns" cardKey="weeklyPatterns" loading={!data} headlineValue={data ? formatCount(total) : undefined}>
      {data && <HeatmapGrid cells={data.cells} maxOrderCount={data.maxOrderCount} formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Darker cells mean more orders placed in that hour — useful for staffing confirmation calls and courier handover windows.</p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <HeatmapGrid cells={data.cells} maxOrderCount={data.maxOrderCount} formatValue={formatMoney} />
      </div>
    </div>
  );
}

export const weeklyPatternsCard: AnalyticsCardDefinition = {
  key: 'weeklyPatterns',
  title: 'Weekly sales patterns',
  category: 'Inventory',
  description: 'When orders actually come in, by day of week and hour.',
  icon: CalendarClock,
  CardComponent: Card,
  DetailComponent: Detail,
};
