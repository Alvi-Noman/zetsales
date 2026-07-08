import { useEffect, useState } from 'react';
import { PhoneOutgoing } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getCallOutcomes } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCallOutcomes(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const confirmed = data?.rows.find((r) => r.key === 'Confirmed');
  const rate = data && data.totalCount > 0 && confirmed ? Math.round((confirmed.count / data.totalCount) * 100) : 0;
  return (
    <AnalyticsCardShell title="Call outcomes" cardKey="callOutcomes" loading={!data} headlineValue={data ? `${rate}% confirmed` : undefined}>
      {data && (
        <div className="space-y-1.5">
          {data.rows.slice(0, 4).map((r) => (
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
        What actually happened on confirmation calls, not just how many were made — only counts attempts logged with an outcome after this attribution started recording.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.rows.map((r) => ({ key: r.key, label: r.label, value: r.count }))} formatValue={formatCount} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        emptyLabel="No logged call attempts in this period"
        columns={[
          { key: 'label', header: 'Outcome', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Attempts', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'share', header: '% of total', align: 'right', render: (r) => formatPercent(r.percentage) },
        ]}
      />
    </div>
  );
}

export const callOutcomesCard: AnalyticsCardDefinition = {
  key: 'callOutcomes',
  title: 'Call outcomes',
  category: 'Orders',
  description: 'Answered and confirmed, rescheduled, no answer, wrong number — what confirmation calls actually resolve to.',
  icon: PhoneOutgoing,
  CardComponent: Card,
  DetailComponent: Detail,
};
