import { useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getSalesByStore } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getSalesByStore(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Sales by store" cardKey="salesByStore" loading={!data} headlineValue={data ? formatMoney(data.totalValue) : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatMoney} maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} maxRows={20} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Store', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'share', header: '% of total', align: 'right', render: (r) => `${r.percentage}%` },
        ]}
      />
    </div>
  );
}

export const salesByStoreCard: AnalyticsCardDefinition = {
  key: 'salesByStore',
  title: 'Sales by store',
  category: 'Sales',
  description: 'Revenue split across every connected Shopify/WooCommerce store.',
  icon: Store,
  CardComponent: Card,
  DetailComponent: Detail,
};
