import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getProfitByCourier } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getProfitByCourier(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Profit by courier" cardKey="profitByCourier" loading={!data} headlineValue={data ? formatMoney(data.totalValue) : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="margin" maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Revenue minus product cost, by which courier shipped the order — this doesn't net out the courier's own delivery fee (not tracked anywhere yet), so treat it as gross profit
        contribution, not the courier's true cost-effectiveness.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="margin" maxRows={10} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        emptyLabel="No delivered orders with known cost in this period"
        columns={[
          { key: 'label', header: 'Courier', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => (r.secondaryValue != null ? formatMoney(r.secondaryValue) : '—') },
          { key: 'profit', header: 'Gross profit', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.value)}</span> },
          { key: 'margin', header: 'Margin', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
        ]}
      />
    </div>
  );
}

export const profitByCourierCard: AnalyticsCardDefinition = {
  key: 'profitByCourier',
  title: 'Profit by courier',
  category: 'Finance',
  description: 'Gross profit contribution by courier partner.',
  icon: Landmark,
  CardComponent: Card,
  DetailComponent: Detail,
};
