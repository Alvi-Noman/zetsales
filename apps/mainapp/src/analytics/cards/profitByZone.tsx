import { useEffect, useState } from 'react';
import { MapPinned } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getProfitByZone } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getProfitByZone(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Profit by district" cardKey="profitByZone" loading={!data} headlineValue={data ? formatMoney(data.totalValue) : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="margin" maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">Revenue minus product cost, by delivery zone — the areas that sell well aren't always the ones that are actually profitable once returns and RTO land there.</p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="margin" maxRows={15} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        emptyLabel="No delivered orders with known cost in this period"
        columns={[
          { key: 'label', header: 'District/Zone', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => (r.secondaryValue != null ? formatMoney(r.secondaryValue) : '—') },
          { key: 'profit', header: 'Gross profit', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.value)}</span> },
          { key: 'margin', header: 'Margin', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
        ]}
      />
    </div>
  );
}

export const profitByZoneCard: AnalyticsCardDefinition = {
  key: 'profitByZone',
  title: 'Profit by district',
  category: 'Finance',
  description: 'Gross profit contribution by delivery zone.',
  icon: MapPinned,
  CardComponent: Card,
  DetailComponent: Detail,
};
