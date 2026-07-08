import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getSalesByPaymentMethod } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getSalesByPaymentMethod(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Sales by payment method" cardKey="salesByPaymentMethod" loading={!data} headlineValue={data ? formatMoney(data.totalValue) : undefined}>
      {data && (
        <div className="space-y-1.5">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.key} className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-500">{r.label}</span>
              <span className="font-semibold tabular-nums text-slate-700">{r.percentage}%</span>
            </div>
          ))}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.rows.map((r) => ({ key: r.key, label: r.label, value: r.value }))} formatValue={formatMoney} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Method', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'share', header: '% of total', align: 'right', render: (r) => `${r.percentage}%` },
        ]}
      />
    </div>
  );
}

export const salesByPaymentMethodCard: AnalyticsCardDefinition = {
  key: 'salesByPaymentMethod',
  title: 'Sales by payment method',
  category: 'Finance',
  description: 'COD vs. bKash/Nagad/Rocket/Card — how your customers are actually paying.',
  icon: Wallet,
  CardComponent: Card,
  DetailComponent: Detail,
};
