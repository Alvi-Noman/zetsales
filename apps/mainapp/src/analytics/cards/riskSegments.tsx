import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getRiskSegments } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getRiskSegments(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const risky = data?.rows.find((r) => r.key === 'Risky');
  const riskyShare = data && risky ? Math.round((risky.count / data.totalCount) * 100) : 0;
  return (
    <AnalyticsCardShell title="Customer risk segments" cardKey="riskSegments" loading={!data} headlineValue={data ? `${riskyShare}% risky` : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-1.5">
          {data.rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-500">{r.label}</span>
              <span className="font-semibold tabular-nums text-slate-700">{r.count}</span>
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
        Computed the same way as each order's own risk badge: Trusted (≥70% delivery success), Risky (&lt;40%), Normal (in between), New Customer (no resolved orders yet) — here rolled up
        across every customer.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.rows.map((r) => ({ key: r.key, label: r.label, value: r.count }))} formatValue={formatCount} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Segment', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Customers', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'revenue', header: 'Lifetime revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'success', header: 'Avg delivery success', align: 'right', render: (r) => (r.secondaryRate != null ? formatPercent(r.secondaryRate) : '—') },
        ]}
      />
    </div>
  );
}

export const riskSegmentsCard: AnalyticsCardDefinition = {
  key: 'riskSegments',
  title: 'Customer risk segments',
  category: 'Customers',
  description: 'How many customers are Trusted, Normal, Risky, or brand New, and how much revenue each group represents.',
  icon: ShieldAlert,
  CardComponent: Card,
  DetailComponent: Detail,
};
