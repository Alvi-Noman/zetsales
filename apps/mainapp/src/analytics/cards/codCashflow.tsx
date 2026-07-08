import { useEffect, useState } from 'react';
import { Banknote } from 'lucide-react';
import type { CodCashflowDTO } from '@zetsales/shared';
import { getCodCashflow } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<CodCashflowDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCodCashflow(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="COD cash flow" cardKey="codCashflow" loading={!data} headlineValue={data ? formatMoney(data.outstanding) : undefined}>
      {data && <SeriesChart series={data.series} color="#e11d48" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">COD collected</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(data.collected)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">COD outstanding right now</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(data.outstanding)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Avg days to collect</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{data.avgDaysToCollect != null ? `${data.avgDaysToCollect}d` : '—'}</p>
        </div>
      </div>
      <p className="text-xs text-slate-400">
        "Collected" and "outstanding" are lifetime snapshots, not scoped to the date filter above — a courier balance carries forward. "Avg days to collect" only counts orders marked collected
        via the "Mark COD collected" action (Order detail → ⋯ menu), since that's the only place a real collection date gets recorded.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">COD actually collected, per day</p>
        <SeriesChart series={data.collectedSeries} color="#059669" formatValue={formatMoney} height={220} />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">COD value placed each day, still outstanding as of today</p>
        <SeriesChart series={data.series} color="#e11d48" formatValue={formatMoney} height={220} />
      </div>
    </div>
  );
}

export const codCashflowCard: AnalyticsCardDefinition = {
  key: 'codCashflow',
  title: 'COD cash flow',
  category: 'Finance',
  description: 'How much COD cash is outstanding, and how stale it is.',
  icon: Banknote,
  CardComponent: Card,
  DetailComponent: Detail,
};
