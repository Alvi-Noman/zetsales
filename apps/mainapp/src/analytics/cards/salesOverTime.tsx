import { useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import type { AnalyticsSeriesDTO } from '@zetsales/shared';
import { getSalesOverTime } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsSeriesDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getSalesOverTime(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Sales over time" cardKey="salesOverTime" loading={!data} headlineValue={data ? formatMoney(data.totalCurrent) : undefined} trend={data?.trend ?? null}>
      {data && <SeriesChart series={data} color="#6366f1" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-black tabular-nums text-slate-900">{formatMoney(data.totalCurrent)}</span>
        {data.trend != null && (
          <span className={`text-sm font-semibold tabular-nums ${data.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {data.trend >= 0 ? '+' : ''}
            {data.trend}% vs previous period
          </span>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <SeriesChart series={data} color="#6366f1" formatValue={formatMoney} height={220} />
      </div>
    </div>
  );
}

export const salesOverTimeCard: AnalyticsCardDefinition = {
  key: 'salesOverTime',
  title: 'Sales over time',
  category: 'Sales',
  description: 'Total order value placed each day, compared to the previous equivalent period.',
  icon: LineChart,
  CardComponent: Card,
  DetailComponent: Detail,
};
