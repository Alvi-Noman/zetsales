import { useEffect, useState } from 'react';
import { ShieldBan } from 'lucide-react';
import type { BlocklistHitRateDTO } from '@zetsales/shared';
import { getBlocklistHitRate } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<BlocklistHitRateDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getBlocklistHitRate(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Blocklist hit rate" cardKey="blocklistHitRate" loading={!data} headlineValue={data?.hitRate != null ? formatPercent(data.hitRate) : undefined}>
      {data && <SeriesChart series={data.series} color="#ca8a04" formatValue={formatCount} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">How many incoming orders come from a blocked phone number and get auto-cancelled — an estimate of the loss the blocklist is actually preventing.</p>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Orders</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.totalOrders)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Blocked hits</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatCount(data.blockedHits)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Value blocked</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{formatMoney(data.valueBlocked)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Blocked-customer attempts, per day</p>
        <SeriesChart series={data.series} color="#ca8a04" formatValue={formatCount} height={220} />
      </div>
    </div>
  );
}

export const blocklistHitRateCard: AnalyticsCardDefinition = {
  key: 'blocklistHitRate',
  title: 'Blocklist hit rate',
  category: 'Customers',
  description: 'How often a blocked customer tries to order again, and how much that would have cost.',
  icon: ShieldBan,
  CardComponent: Card,
  DetailComponent: Detail,
};
