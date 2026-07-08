import { useEffect, useState } from 'react';
import { Flag } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getFlagReasons } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getFlagReasons(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Flag reasons" cardKey="flagReasons" loading={!data} headlineValue={data ? formatCount(data.totalCount) : undefined} trendGoodDirection="down">
      {data && <ParetoChart rows={data.rows} formatValue={formatCount} maxRows={4} barColor="#8b5cf6" />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Orders the system auto-flagged for a human to look at — usually an oversell/stock conflict at confirm time. Grouped by the category prefix, since the full message includes per-order
        specifics (product, quantity).
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatCount} maxRows={15} barColor="#8b5cf6" />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        emptyLabel="Nothing currently flagged"
        columns={[
          { key: 'label', header: 'Reason', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Value', align: 'right', render: (r) => formatMoney(r.value) },
        ]}
      />
    </div>
  );
}

export const flagReasonsCard: AnalyticsCardDefinition = {
  key: 'flagReasons',
  title: 'Flag reasons',
  category: 'Orders',
  description: 'Why orders are sitting auto-flagged for review, most common first.',
  icon: Flag,
  CardComponent: Card,
  DetailComponent: Detail,
};
