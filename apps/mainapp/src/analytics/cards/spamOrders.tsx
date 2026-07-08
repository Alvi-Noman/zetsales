import { useEffect, useState } from 'react';
import { MailWarning } from 'lucide-react';
import type { SpamOrdersDTO } from '@zetsales/shared';
import { getSpamOrders } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<SpamOrdersDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getSpamOrders(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Spam orders" cardKey="spamOrders" loading={!data} headlineValue={data?.spamRate != null ? formatPercent(data.spamRate) : undefined} trendGoodDirection="down">
      {data && <SeriesChart series={data.series} color="#dc2626" formatValue={formatCount} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Orders cancelled with reason "Spam" — the pace it's happening at, and which products draw it most (a viral ad or a bait listing tends to concentrate spam on one specific product).
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Orders</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.totalOrders)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Spam orders</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.spamOrders)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Value lost</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(data.valueLost)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Spam cancellations, per day</p>
        <SeriesChart series={data.series} color="#dc2626" formatValue={formatCount} height={220} />
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">Most affected products</p>
        <RankedTable
          keyField={(r) => r.key}
          rows={data.topAffectedProducts}
          emptyLabel="No spam cancellations in this period"
          columns={[
            { key: 'label', header: 'Product', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
            { key: 'units', header: 'Units', align: 'right', render: (r) => formatCount(r.count) },
            { key: 'value', header: 'Revenue lost', align: 'right', render: (r) => formatMoney(r.value) },
          ]}
        />
      </div>
    </div>
  );
}

export const spamOrdersCard: AnalyticsCardDefinition = {
  key: 'spamOrders',
  title: 'Spam orders',
  category: 'Orders',
  description: 'How often orders turn out to be spam, the daily trend, and which products draw it most.',
  icon: MailWarning,
  CardComponent: Card,
  DetailComponent: Detail,
};
