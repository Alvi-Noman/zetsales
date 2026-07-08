import { useEffect, useState } from 'react';
import { CopyX } from 'lucide-react';
import type { DuplicateOrdersDTO } from '@zetsales/shared';
import { getDuplicateOrders } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<DuplicateOrdersDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getDuplicateOrders(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell
      title="Duplicate orders"
      cardKey="duplicateOrders"
      loading={!data}
      headlineValue={data?.confirmationRate != null ? formatPercent(data.confirmationRate) : undefined}
      trend={data?.series.trend ?? null}
      trendGoodDirection="down"
    >
      {data && <SeriesChart series={data.series} color="#9333ea" formatValue={formatCount} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Same phone number placing 2+ orders on the same day is flagged automatically below — could be an accidental double-submit, or a customer testing whether you'll actually confirm a large
        batch. "Confirmed" is the manual half: whichever of those flagged orders staff actually looked at and cancelled with reason "Duplicate order".
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Orders</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.totalOrders)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Confirmed duplicates</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.confirmedOrders)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Flagged groups</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.groups.length)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Confirmed duplicate cancellations, per day</p>
        <SeriesChart series={data.series} color="#9333ea" formatValue={formatCount} height={220} />
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">Automatically flagged: same phone, same day, 2+ orders</p>
        <RankedTable
          keyField={(r) => `${r.phone}-${r.date}`}
          rows={data.groups}
          emptyLabel="No same-day repeats found"
          columns={[
            {
              key: 'customer',
              header: 'Customer',
              render: (r) => (
                <span>
                  <span className="font-medium text-slate-700">{r.customerName || 'Unnamed'}</span>
                  <span className="ml-2 text-slate-400">{r.phone}</span>
                </span>
              ),
            },
            { key: 'date', header: 'Date', render: (r) => r.date },
            { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatCount(r.orderCount) },
            { key: 'numbers', header: 'Order #s', render: (r) => <span className="text-slate-500">{r.orderNumbers.join(', ')}</span> },
            {
              key: 'confirmed',
              header: 'Confirmed duplicate',
              render: (r) =>
                r.confirmedOrderNumbers.length > 0 ? (
                  <span className="font-medium text-rose-600">{r.confirmedOrderNumbers.join(', ')}</span>
                ) : (
                  <span className="text-slate-300">Not yet reviewed</span>
                ),
            },
            { key: 'value', header: 'Combined value', align: 'right', render: (r) => formatMoney(r.totalValue) },
          ]}
        />
      </div>
    </div>
  );
}

export const duplicateOrdersCard: AnalyticsCardDefinition = {
  key: 'duplicateOrders',
  title: 'Duplicate orders',
  category: 'Customers',
  description: 'Same phone number ordering more than once on the same day, and how many turned out to actually be duplicates.',
  icon: CopyX,
  CardComponent: Card,
  DetailComponent: Detail,
};
