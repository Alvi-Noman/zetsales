import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { OrderAgentUpsellPerformanceDTO } from '@zetsales/shared';
import { getOrderAgentUpsellPerformance } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<OrderAgentUpsellPerformanceDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getOrderAgentUpsellPerformance(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const totalAmount = data ? data.rows.reduce((sum, r) => sum + r.totalAmount, 0) : 0;
  return (
    <AnalyticsCardShell title="Order agent upsell performance" cardKey="orderAgentUpsellPerformance" loading={!data} headlineValue={data ? formatMoney(totalAmount) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.agent} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.agent}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatMoney(r.totalAmount)}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No upsells added in this period</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Every extra line item an agent added to an order via the order drawer's "add product" flow before it was confirmed — this is what upselling means here, not a call outcome. Sourced from
        the same order history log as the Confirmation and Employee activity reports.
      </p>
      <RankedTable
        keyField={(r) => r.agent}
        rows={data.rows}
        emptyLabel="No upsells added in this period"
        columns={[
          { key: 'agent', header: 'Agent', render: (r) => <span className="font-medium text-slate-700">{r.agent}</span> },
          { key: 'upsellCount', header: 'Upsells', align: 'right', render: (r) => formatCount(r.upsellCount) },
          { key: 'itemsAdded', header: 'Items added', align: 'right', render: (r) => formatCount(r.itemsAdded) },
          { key: 'ordersUpsold', header: 'Orders upsold', align: 'right', render: (r) => formatCount(r.ordersUpsold) },
          { key: 'totalAmount', header: 'Upsell value', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.totalAmount)}</span> },
        ]}
      />
    </div>
  );
}

export const orderAgentUpsellPerformanceCard: AnalyticsCardDefinition = {
  key: 'orderAgentUpsellPerformance',
  title: 'Order agent upsell performance',
  category: 'Orders',
  description: 'Per agent, how many extra items they added to orders in the drawer before confirmation, and how much revenue that upselling added.',
  icon: TrendingUp,
  CardComponent: Card,
  DetailComponent: Detail,
};
