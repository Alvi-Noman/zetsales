import { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import type { AnalyticsSeriesDTO } from '@zetsales/shared';
import { getConfirmedSalesOverTime } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsSeriesDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getConfirmedSalesOverTime(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Confirmed sales over time" cardKey="confirmedSalesOverTime" loading={!data} headlineValue={data ? formatMoney(data.totalCurrent) : undefined} trend={data?.trend ?? null}>
      {data && <SeriesChart series={data} color="#0ea5e9" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Bucketed by when each order was actually <span className="font-medium text-slate-600">confirmed</span>, not when it was placed — raw creates include no-answers, fraud, and duplicates
        that never confirm, which understates a COD business's real day-to-day pace. An order confirmed more than once (held from Confirmed, then resumed) only counts once, on its latest
        confirmation within the window.
      </p>
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
        <SeriesChart series={data} color="#0ea5e9" formatValue={formatMoney} height={220} />
      </div>
    </div>
  );
}

export const confirmedSalesOverTimeCard: AnalyticsCardDefinition = {
  key: 'confirmedSalesOverTime',
  title: 'Confirmed sales over time',
  category: 'Sales',
  description: 'How much order value was confirmed each day — not just placed — the number that actually reflects your team keeping up.',
  icon: PhoneCall,
  CardComponent: Card,
  DetailComponent: Detail,
};
