import { useEffect, useState } from 'react';
import { PhoneCall } from 'lucide-react';
import type { ConfirmationPerformanceDTO } from '@zetsales/shared';
import { getConfirmationPerformance } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatMinutes, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<ConfirmationPerformanceDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getConfirmationPerformance(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell
      title="Confirmation performance"
      cardKey="confirmationPerformance"
      loading={!data}
      headlineValue={data?.confirmationRate != null ? formatPercent(data.confirmationRate) : '—'}
    >
      {data && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-slate-400">Avg time to confirm</p>
            <p className="font-semibold text-slate-700 tabular-nums">{formatMinutes(data.avgTimeToConfirmMinutes)}</p>
          </div>
          <div>
            <p className="text-slate-400">Avg call attempts</p>
            <p className="font-semibold text-slate-700 tabular-nums">{data.avgCallAttempts ?? '—'}</p>
          </div>
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;

  const maxDist = Math.max(...data.callAttemptsDistribution.map((d) => d.count), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Orders', value: formatCount(data.totalPending) },
          { label: 'Confirmed', value: formatCount(data.totalConfirmed) },
          { label: 'Confirmation rate', value: data.confirmationRate != null ? formatPercent(data.confirmationRate) : '—' },
          { label: 'Avg time to first contact', value: formatMinutes(data.avgTimeToFirstContactMinutes) },
          { label: 'Avg time to confirm', value: formatMinutes(data.avgTimeToConfirmMinutes) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{m.label}</p>
            <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Call attempts before confirming</p>
        <div className="flex items-end gap-3">
          {data.callAttemptsDistribution.map((d) => (
            <div key={d.attempts} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[11px] font-semibold tabular-nums text-slate-600">{d.count}</span>
              <div className="flex h-24 w-full items-end rounded-md bg-slate-50">
                <div className="w-full rounded-md bg-indigo-400" style={{ height: `${Math.max(4, (d.count / maxDist) * 100)}%` }} />
              </div>
              <span className="text-[10.5px] text-slate-400">{d.attempts >= 4 ? '4+' : d.attempts} calls</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">By agent</p>
        <p className="mb-3 text-xs text-slate-400">Only counts confirmations made after this attribution started recording — older orders won't have an agent attached.</p>
        <RankedTable
          keyField={(r) => r.agent}
          rows={data.byAgent}
          emptyLabel="No attributed confirmations yet in this period"
          columns={[
            { key: 'agent', header: 'Agent', render: (r) => <span className="font-medium text-slate-700">{r.agent}</span> },
            { key: 'count', header: 'Confirmed', align: 'right', render: (r) => formatCount(r.confirmedCount) },
            { key: 'attempts', header: 'Avg calls', align: 'right', render: (r) => r.avgCallAttempts ?? '—' },
            { key: 'time', header: 'Avg time to confirm', align: 'right', render: (r) => formatMinutes(r.avgTimeToConfirmMinutes) },
            { key: 'delivered', header: 'Delivered rate', align: 'right', render: (r) => (r.deliveredRate != null ? formatPercent(r.deliveredRate) : '—') },
            { key: 'rto', header: 'RTO rate', align: 'right', render: (r) => (r.rtoRate != null ? formatPercent(r.rtoRate) : '—') },
            { key: 'score', header: 'Composite score', align: 'right', render: (r) => (r.compositeScore != null ? <span className="font-semibold text-slate-900">{r.compositeScore}</span> : '—') },
          ]}
        />
      </div>
    </div>
  );
}

export const confirmationPerformanceCard: AnalyticsCardDefinition = {
  key: 'confirmationPerformance',
  title: 'Confirmation performance',
  category: 'Orders',
  description: 'How fast and how reliably pending orders get confirmed, and by whom.',
  icon: PhoneCall,
  CardComponent: Card,
  DetailComponent: Detail,
};
