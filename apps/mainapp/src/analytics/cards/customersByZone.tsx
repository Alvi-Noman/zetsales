import { useEffect, useState } from 'react';
import { Map } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getCustomersByZone } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCustomersByZone(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Customers by location" cardKey="customersByZone" loading={!data} headlineValue={data ? formatCount(data.totalCount) : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatCount} maxRows={4} barColor="#14b8a6" />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">Each customer is counted once, under their most recent delivery zone — a lifetime view, not scoped to the date filter above.</p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatCount} maxRows={15} barColor="#14b8a6" />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Zone', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Customers', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'revenue', header: 'Lifetime revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'delivered', header: 'Delivered rate', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
        ]}
      />
    </div>
  );
}

export const customersByZoneCard: AnalyticsCardDefinition = {
  key: 'customersByZone',
  title: 'Customers by location',
  category: 'Customers',
  description: 'Where your customers are, by delivery zone.',
  icon: Map,
  CardComponent: Card,
  DetailComponent: Detail,
};
