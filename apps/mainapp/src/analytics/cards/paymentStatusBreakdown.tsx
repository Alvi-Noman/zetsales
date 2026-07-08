import { useEffect, useState } from 'react';
import { BadgeDollarSign } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getPaymentStatusBreakdown } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getPaymentStatusBreakdown(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const advance = data?.rows.find((r) => r.key === 'Advance Paid');
  return (
    <AnalyticsCardShell title="Advance payment breakdown" cardKey="paymentStatusBreakdown" loading={!data} headlineValue={data ? formatCount(advance?.count ?? 0) : undefined}>
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
      <p className="text-xs text-slate-400">
        Every order placed in the period, split by payment status. <span className="font-medium text-slate-600">Advance Paid</span> is the one worth watching — an upfront deposit is meant to
        screen out fake COD orders, so its delivered rate should read noticeably higher than COD Pending's.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.rows.map((r) => ({ key: r.key, label: r.label, value: r.value }))} formatValue={formatMoney} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Payment status', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Value', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'delivered', header: 'Delivered rate', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
        ]}
      />
    </div>
  );
}

export const paymentStatusBreakdownCard: AnalyticsCardDefinition = {
  key: 'paymentStatusBreakdown',
  title: 'Advance payment breakdown',
  category: 'Finance',
  description: 'Orders by payment status — how much COD volume comes with an upfront deposit, and whether that actually improves delivery odds.',
  icon: BadgeDollarSign,
  CardComponent: Card,
  DetailComponent: Detail,
};
