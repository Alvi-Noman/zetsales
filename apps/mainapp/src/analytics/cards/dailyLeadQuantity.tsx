import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import type { AnalyticsSeriesDTO } from '@zetsales/shared';
import { getDailyLeadQuantity } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsSeriesDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getDailyLeadQuantity(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Daily lead quantity" cardKey="dailyLeadQuantity" loading={!data} headlineValue={data ? formatCount(data.totalCurrent) : undefined} trend={data?.trend ?? null}>
      {data && <SeriesChart series={data} color="#a855f7" formatValue={formatCount} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Every order placed each day, every stage included — "leads" in COD-seller terms means the raw incoming volume before any screening, unlike Sales over time (which sums revenue) or the
        Order funnel (one total for the whole period, not a day-by-day trend).
      </p>
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-black tabular-nums text-slate-900">{formatCount(data.totalCurrent)}</span>
        {data.trend != null && (
          <span className={`text-sm font-semibold tabular-nums ${data.trend >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {data.trend >= 0 ? '+' : ''}
            {data.trend}% vs previous period
          </span>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <SeriesChart series={data} color="#a855f7" formatValue={formatCount} height={220} />
      </div>
    </div>
  );
}

export const dailyLeadQuantityCard: AnalyticsCardDefinition = {
  key: 'dailyLeadQuantity',
  title: 'Daily lead quantity',
  category: 'Sales',
  description: 'Raw incoming order volume each day, before any confirmation or screening.',
  icon: Inbox,
  CardComponent: Card,
  DetailComponent: Detail,
};
