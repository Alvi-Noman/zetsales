import { useEffect, useState } from 'react';
import { PackageCheck } from 'lucide-react';
import type { AnalyticsSeriesDTO } from '@zetsales/shared';
import { getHandoverSales } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsSeriesDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getHandoverSales(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Handover date-wise sales" cardKey="handoverSales" loading={!data} headlineValue={data ? formatMoney(data.totalCurrent) : undefined} trend={data?.trend ?? null}>
      {data && <SeriesChart series={data} color="#14b8a6" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        COD value bucketed by the date parcels were physically handed over to a courier office (see Courier Handovers, under Integrations → Couriers) rather than order-creation date — this
        card is empty until at least one handover batch has been recorded. Not scoped by store, since a courier handover covers parcels from every connected store at once.
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
        <SeriesChart series={data} color="#14b8a6" formatValue={formatMoney} height={220} />
      </div>
    </div>
  );
}

export const handoverSalesCard: AnalyticsCardDefinition = {
  key: 'handoverSales',
  title: 'Handover date-wise sales',
  category: 'Delivery',
  description: 'COD value handed over to courier each day, bucketed by handover date rather than order-creation date.',
  icon: PackageCheck,
  CardComponent: Card,
  DetailComponent: Detail,
};
