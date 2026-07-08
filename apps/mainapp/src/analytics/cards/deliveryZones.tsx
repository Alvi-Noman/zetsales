import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getDeliveryZones } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getDeliveryZones(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Delivery zones" cardKey="deliveryZones" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={15} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Zone', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'delivered', header: 'Delivered rate', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
          { key: 'rto', header: 'RTO rate', align: 'right', render: (r) => (r.secondaryValue != null ? formatPercent(r.secondaryValue) : '—') },
        ]}
      />
    </div>
  );
}

export const deliveryZonesCard: AnalyticsCardDefinition = {
  key: 'deliveryZones',
  title: 'Delivery zones',
  category: 'Delivery',
  description: 'Where orders ship, and which zones have the worst RTO rate.',
  icon: MapPin,
  CardComponent: Card,
  DetailComponent: Detail,
};
