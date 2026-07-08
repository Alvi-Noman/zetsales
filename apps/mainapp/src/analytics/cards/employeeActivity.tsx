import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import type { EmployeeActivityDTO } from '@zetsales/shared';
import { getEmployeeActivity } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<EmployeeActivityDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getEmployeeActivity(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Employee activity" cardKey="employeeActivity" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.agent} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.agent}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatCount(r.totalActions)} actions</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No staff-attributed activity in this period</p>}
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
        Broader than the Confirmation performance card's per-agent breakdown (which only ever looks at who confirmed) — every stage change and call attempt is logged with who did it, so this
        covers who's shipping fastest and clearing holds, not just who's confirming.
      </p>
      <RankedTable
        keyField={(r) => r.agent}
        rows={data.rows}
        emptyLabel="No staff-attributed activity in this period"
        columns={[
          { key: 'agent', header: 'Staff member', render: (r) => <span className="font-medium text-slate-700">{r.agent}</span> },
          { key: 'total', header: 'Total actions', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatCount(r.totalActions)}</span> },
          { key: 'confirmed', header: 'Confirmed', align: 'right', render: (r) => formatCount(r.confirmed) },
          { key: 'shipped', header: 'Shipped', align: 'right', render: (r) => formatCount(r.shipped) },
          { key: 'delivered', header: 'Delivered', align: 'right', render: (r) => formatCount(r.delivered) },
          { key: 'cancelled', header: 'Cancelled', align: 'right', render: (r) => formatCount(r.cancelled) },
          { key: 'holdResolved', header: 'Holds resolved', align: 'right', render: (r) => formatCount(r.holdResolved) },
          { key: 'calls', header: 'Call attempts', align: 'right', render: (r) => formatCount(r.callAttempts) },
        ]}
      />
    </div>
  );
}

export const employeeActivityCard: AnalyticsCardDefinition = {
  key: 'employeeActivity',
  title: 'Employee activity',
  category: 'Orders',
  description: 'Every staff-attributed action across the whole pipeline — confirming, shipping, resolving holds, calling — not just confirmation.',
  icon: Users,
  CardComponent: Card,
  DetailComponent: Detail,
};
