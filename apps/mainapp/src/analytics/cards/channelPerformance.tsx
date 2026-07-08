import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getChannelPerformance } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getChannelPerformance(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Channel outcome" cardKey="channelPerformance" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Grouped by store, not by marketing channel (Facebook/Instagram/WhatsApp) — this app doesn't capture a per-order marketing-channel field yet, so store is the closest real proxy
        available. Unlike the plain "Sales by store" card, this one tracks what actually happened to those orders, not just their revenue.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={10} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Store', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'delivered', header: 'Delivered rate', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
          { key: 'rto', header: 'RTO rate', align: 'right', render: (r) => (r.secondaryValue != null ? formatPercent(r.secondaryValue) : '—') },
        ]}
      />
    </div>
  );
}

export const channelPerformanceCard: AnalyticsCardDefinition = {
  key: 'channelPerformance',
  title: 'Channel outcome',
  category: 'Sales',
  description: 'Not just how much each store sells — what actually happens to those orders (delivered vs. RTO).',
  icon: Radio,
  CardComponent: Card,
  DetailComponent: Detail,
};
