import { useEffect, useState } from 'react';
import { TimerOff } from 'lucide-react';
import type { SlaBreachDTO } from '@zetsales/shared';
import { getSlaBreach } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<SlaBreachDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getSlaBreach(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const worst = data?.rows.reduce((w, r) => ((r.breachRate ?? 0) > (w?.breachRate ?? 0) ? r : w), data.rows[0]);
  return (
    <AnalyticsCardShell title="SLA breaches" cardKey="slaBreach" loading={!data} headlineValue={worst?.breachRate != null ? formatPercent(worst.breachRate) : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-1.5">
          {data.rows.map((r) => (
            <div key={r.stage} className="flex items-center justify-between text-[11.5px]">
              <span className="truncate text-slate-500">{r.stage}</span>
              <span className="font-semibold tabular-nums text-slate-700">{r.breachRate != null ? formatPercent(r.breachRate) : '—'}</span>
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
        Fixed default targets (confirm within 6h, ship within 24h of confirming, deliver within 5 days of shipping) — not yet a setting you can tune per business, so treat these as reasonable
        starting benchmarks rather than your actual SLA.
      </p>
      <RankedTable
        keyField={(r) => r.stage}
        rows={data.rows}
        columns={[
          { key: 'stage', header: 'Target', render: (r) => <span className="font-medium text-slate-700">{r.stage}</span> },
          { key: 'total', header: 'Orders measured', align: 'right', render: (r) => formatCount(r.totalOrders) },
          { key: 'breached', header: 'Breached', align: 'right', render: (r) => formatCount(r.breachedCount) },
          { key: 'rate', header: 'Breach rate', align: 'right', render: (r) => (r.breachRate != null ? <span className="font-semibold text-slate-900">{formatPercent(r.breachRate)}</span> : '—') },
        ]}
      />
    </div>
  );
}

export const slaBreachCard: AnalyticsCardDefinition = {
  key: 'slaBreach',
  title: 'SLA breaches',
  category: 'Orders',
  description: 'How often orders miss reasonable confirm/ship/deliver time targets.',
  icon: TimerOff,
  CardComponent: Card,
  DetailComponent: Detail,
};
