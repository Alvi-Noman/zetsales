import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import type { AnalyticsSeriesDTO } from '@zetsales/shared';
import { getAovOverTime } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsSeriesDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getAovOverTime(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const avg = data && data.current.points.length > 0 ? data.current.points.reduce((s, p) => s + p.value, 0) / data.current.points.filter((p) => p.value > 0).length || 0 : 0;
  return (
    <AnalyticsCardShell title="Average order value" cardKey="aovOverTime" loading={!data} headlineValue={data ? formatMoney(avg) : undefined} trend={data?.trend ?? null}>
      {data && <SeriesChart series={data} color="#3b82f6" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Average order value, per day</p>
        <SeriesChart series={data} color="#3b82f6" formatValue={formatMoney} height={220} />
      </div>
      <p className="text-xs text-slate-400">Averaged across all orders placed that day, regardless of current stage.</p>
    </div>
  );
}

export const aovOverTimeCard: AnalyticsCardDefinition = {
  key: 'aovOverTime',
  title: 'Average order value',
  category: 'Sales',
  description: 'How much a typical order is worth, and whether that is trending up or down.',
  icon: Receipt,
  CardComponent: Card,
  DetailComponent: Detail,
};
