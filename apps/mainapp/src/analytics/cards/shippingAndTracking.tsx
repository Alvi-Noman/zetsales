import { useEffect, useState } from 'react';
import { ScanLine } from 'lucide-react';
import type { ShippingTrackingDTO } from '@zetsales/shared';
import { getShippingAndTracking } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<ShippingTrackingDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getShippingAndTracking(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Shipping & tracking" cardKey="shippingAndTracking" loading={!data} headlineValue={data ? formatMoney(data.totalShippingFee) : undefined} trend={data?.series.trend ?? null}>
      {data && <SeriesChart series={data.series} color="#8b5cf6" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Shipping fee revenue</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(data.totalShippingFee)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Orders with a tracking ID</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{data.trackingIncludedRate != null ? formatPercent(data.trackingIncludedRate) : '—'}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Shipping fee collected, per day</p>
        <SeriesChart series={data.series} color="#8b5cf6" formatValue={formatMoney} height={220} />
      </div>
    </div>
  );
}

export const shippingAndTrackingCard: AnalyticsCardDefinition = {
  key: 'shippingAndTracking',
  title: 'Shipping & tracking',
  category: 'Delivery',
  description: 'Shipping fee revenue over time, and what share of shipped orders have a tracking ID attached.',
  icon: ScanLine,
  CardComponent: Card,
  DetailComponent: Detail,
};
