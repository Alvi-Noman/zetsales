import { useEffect, useState } from 'react';
import { UserPlus } from 'lucide-react';
import type { NewVsReturningDTO } from '@zetsales/shared';
import { getNewVsReturning } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<NewVsReturningDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getNewVsReturning(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

// Bespoke to this one card's two-series-per-bucket shape (not the generic single-value
// AnalyticsSeriesDTO the rest of the "over time" cards share) — a stacked bar keeps new vs
// returning legible without a second axis, per the dataviz "one axis" rule.
function StackedBars({ points, height = 120 }: { points: NewVsReturningDTO['current']['points']; height?: number }) {
  const max = Math.max(...points.map((p) => p.newCustomers + p.returningCustomers), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {points.map((p) => {
        const total = p.newCustomers + p.returningCustomers;
        const totalH = Math.max(2, (total / max) * height);
        const newH = total > 0 ? (p.newCustomers / total) * totalH : 0;
        return (
          <div key={p.index} className="group relative flex flex-1 flex-col justify-end" style={{ height }}>
            <div className="w-full rounded-t-[3px] bg-indigo-400" style={{ height: newH }} />
            <div className="w-full rounded-b-[3px] bg-slate-200" style={{ height: totalH - newH }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10.5px] font-medium text-white shadow-lg group-hover:block">
              {p.label}: {p.newCustomers} new, {p.returningCustomers} returning
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const totals = data?.current.points.reduce((acc, p) => ({ n: acc.n + p.newCustomers, r: acc.r + p.returningCustomers }), { n: 0, r: 0 });
  const returningShare = totals && totals.n + totals.r > 0 ? Math.round((totals.r / (totals.n + totals.r)) * 100) : null;
  return (
    <AnalyticsCardShell title="New vs. returning" cardKey="newVsReturning" loading={!data} headlineValue={returningShare != null ? `${returningShare}% returning` : undefined}>
      {data && <StackedBars points={data.current.points} height={72} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  const totals = data.current.points.reduce((acc, p) => ({ n: acc.n + p.newCustomers, r: acc.r + p.returningCustomers }), { n: 0, r: 0 });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-2 w-2 rounded-full bg-indigo-400" /> New customers
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(totals.n)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-300" /> Returning customers
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(totals.r)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <StackedBars points={data.current.points} height={220} />
      </div>
    </div>
  );
}

export const newVsReturningCard: AnalyticsCardDefinition = {
  key: 'newVsReturning',
  title: 'New vs. returning',
  category: 'Customers',
  description: 'How much of your order volume comes from customers who have ordered before.',
  icon: UserPlus,
  CardComponent: Card,
  DetailComponent: Detail,
};
