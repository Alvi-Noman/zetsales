import { useEffect, useState } from 'react';
import { UserPlus2 } from 'lucide-react';
import type { NewCustomerRevenueDTO } from '@zetsales/shared';
import { getNewCustomerRevenue } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<NewCustomerRevenueDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getNewCustomerRevenue(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

// Same stacked-bar treatment as the "New vs. returning" card (counts) — this one sums revenue per
// bucket instead, since "how many new customers" and "how much money comes from new customers" can
// tell very different stories (a handful of big new-customer orders vs. a lot of small repeat ones).
function StackedBars({ points, height = 120, formatValue }: { points: NewCustomerRevenueDTO['current']['points']; height?: number; formatValue: (v: number) => string }) {
  const max = Math.max(...points.map((p) => p.newRevenue + p.returningRevenue), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {points.map((p) => {
        const total = p.newRevenue + p.returningRevenue;
        const totalH = Math.max(2, (total / max) * height);
        const newH = total > 0 ? (p.newRevenue / total) * totalH : 0;
        return (
          <div key={p.index} className="group relative flex flex-1 flex-col justify-end" style={{ height }}>
            <div className="w-full rounded-t-[3px] bg-emerald-400" style={{ height: newH }} />
            <div className="w-full rounded-b-[3px] bg-slate-200" style={{ height: totalH - newH }} />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10.5px] font-medium text-white shadow-lg group-hover:block">
              {p.label}: {formatValue(p.newRevenue)} new, {formatValue(p.returningRevenue)} returning
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const totals = data?.current.points.reduce((acc, p) => ({ n: acc.n + p.newRevenue, r: acc.r + p.returningRevenue }), { n: 0, r: 0 });
  return (
    <AnalyticsCardShell title="New customer revenue" cardKey="newCustomerRevenue" loading={!data} headlineValue={totals ? formatMoney(totals.n) : undefined}>
      {data && <StackedBars points={data.current.points} height={72} formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  const totals = data.current.points.reduce((acc, p) => ({ n: acc.n + p.newRevenue, r: acc.r + p.returningRevenue }), { n: 0, r: 0 });
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> Revenue from new customers
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(totals.n)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-300" /> Revenue from returning customers
          </p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(totals.r)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <StackedBars points={data.current.points} height={220} formatValue={formatMoney} />
      </div>
    </div>
  );
}

export const newCustomerRevenueCard: AnalyticsCardDefinition = {
  key: 'newCustomerRevenue',
  title: 'New customer revenue',
  category: 'Customers',
  description: 'How much revenue comes from customers ordering for the first time, vs. everyone else.',
  icon: UserPlus2,
  CardComponent: Card,
  DetailComponent: Detail,
};
