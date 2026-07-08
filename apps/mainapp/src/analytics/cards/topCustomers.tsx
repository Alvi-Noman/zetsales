import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import type { RepeatCustomersDTO } from '@zetsales/shared';
import { getTopCustomers } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<RepeatCustomersDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getTopCustomers(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const total = data ? data.oneTimeCount + data.repeatCount : 0;
  const repeatShare = data && total > 0 ? Math.round((data.repeatCount / total) * 100) : null;
  return (
    <AnalyticsCardShell title="Repeat customers" cardKey="topCustomers" loading={!data} headlineValue={repeatShare != null ? `${repeatShare}%` : undefined}>
      {data && (
        <div className="space-y-2.5">
          {data.topCustomers.slice(0, 4).map((c) => (
            <div key={c.phone} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{c.name || c.phone}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatMoney(c.totalSpend)}</span>
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
  const total = data.oneTimeCount + data.repeatCount;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">One-time customers</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.oneTimeCount)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Repeat customers</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.repeatCount)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Revenue from repeats</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{data.repeatRevenueShare != null ? formatPercent(data.repeatRevenueShare) : '—'}</p>
        </div>
      </div>
      {total > 0 && (
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-2.5 bg-indigo-400" style={{ width: `${(data.repeatCount / total) * 100}%` }} />
        </div>
      )}
      <RankedTable
        keyField={(r) => r.phone}
        rows={data.topCustomers}
        columns={[
          {
            key: 'name',
            header: 'Customer',
            render: (r) => (
              <span>
                <span className="font-medium text-slate-700">{r.name || 'Unnamed'}</span>
                <span className="ml-2 text-slate-400">{r.phone}</span>
                {r.isBlocked && <span className="ml-2 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">Blocked</span>}
              </span>
            ),
          },
          { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatCount(r.orderCount) },
          { key: 'spend', header: 'Lifetime spend', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.totalSpend)}</span> },
          { key: 'success', header: 'Delivery success', align: 'right', render: (r) => (r.successRate != null ? formatPercent(r.successRate) : '—') },
        ]}
      />
    </div>
  );
}

export const topCustomersCard: AnalyticsCardDefinition = {
  key: 'topCustomers',
  title: 'Repeat customers',
  category: 'Customers',
  description: 'One-time vs. repeat customers, and who your highest lifetime spenders are.',
  icon: Users,
  CardComponent: Card,
  DetailComponent: Detail,
};
