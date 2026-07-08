import { useEffect, useState } from 'react';
import { Truck } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getCourierPerformance } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCourierPerformance(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const best = data?.rows[0];
  return (
    <AnalyticsCardShell title="Courier performance" cardKey="courierPerformance" loading={!data} headlineValue={best ? `${best.secondaryRate ?? 0}%` : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatCount} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatCount} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={10} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Courier', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Parcels', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'delivered', header: 'Delivered rate', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
          { key: 'days', header: 'Avg delivery time', align: 'right', render: (r) => (r.secondaryValue != null ? `${r.secondaryValue}d` : '—') },
          { key: 'transit', header: 'Pending with courier', align: 'right', render: (r) => (r.tertiaryValue != null ? formatCount(r.tertiaryValue) : '—') },
        ]}
      />
    </div>
  );
}

export const courierPerformanceCard: AnalyticsCardDefinition = {
  key: 'courierPerformance',
  title: 'Courier performance',
  category: 'Delivery',
  description: 'Delivered vs. RTO rate and average delivery time, per courier partner.',
  icon: Truck,
  CardComponent: Card,
  DetailComponent: Detail,
};
