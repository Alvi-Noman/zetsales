import { useEffect, useState } from 'react';
import { PiggyBank } from 'lucide-react';
import type { AnalyticsSeriesDTO } from '@zetsales/shared';
import { getNetSalesOverTime } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsSeriesDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getNetSalesOverTime(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Net sales" cardKey="netSalesOverTime" loading={!data} headlineValue={data ? formatMoney(data.totalCurrent) : undefined} trend={data?.trend ?? null}>
      {data && <SeriesChart series={data} color="#10b981" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">Order value excluding anything Cancelled or Returned — gross sales alone overstates what a COD business actually keeps.</p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <SeriesChart series={data} color="#10b981" formatValue={formatMoney} height={220} />
      </div>
    </div>
  );
}

export const netSalesOverTimeCard: AnalyticsCardDefinition = {
  key: 'netSalesOverTime',
  title: 'Net sales',
  category: 'Sales',
  description: 'Order value after excluding cancelled and returned orders — not the same as gross sales.',
  icon: PiggyBank,
  CardComponent: Card,
  DetailComponent: Detail,
};
