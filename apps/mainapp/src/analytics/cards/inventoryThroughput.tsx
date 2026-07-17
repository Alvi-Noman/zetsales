import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import type { InventoryThroughputDTO } from '@zetsales/shared';
import { getInventoryThroughput } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<InventoryThroughputDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getInventoryThroughput(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Inventory throughput" cardKey="inventoryThroughput" loading={!data} headlineValue={data ? formatCount(data.uniqueSkus) : undefined}>
      {data && (
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div>
            <p className="text-slate-400">Ordered</p>
            <p className="font-semibold tabular-nums text-slate-700">{formatCount(data.totalOrdered)}</p>
          </div>
          <div>
            <p className="text-slate-400">Received</p>
            <p className="font-semibold tabular-nums text-slate-700">{formatCount(data.totalReceived)}</p>
          </div>
          <div>
            <p className="text-slate-400">Ready for pickup</p>
            <p className="font-semibold tabular-nums text-slate-700">{formatCount(data.totalShipped)}</p>
          </div>
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  const tiles = [
    { label: 'Units ordered', value: formatCount(data.totalOrdered) },
    { label: 'Units received', value: formatCount(data.totalReceived) },
    { label: 'Units ready for pickup', value: formatCount(data.totalShipped) },
    { label: 'Unique SKUs in catalog', value: formatCount(data.uniqueSkus) },
    { label: 'Current inventory value', value: formatMoney(data.totalInventoryValue) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{t.label}</p>
          <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{t.value}</p>
        </div>
      ))}
    </div>
  );
}

export const inventoryThroughputCard: AnalyticsCardDefinition = {
  key: 'inventoryThroughput',
  title: 'Inventory throughput',
  category: 'Inventory',
  description: 'Units ordered, received, and shipped in this period, plus your current catalog size and inventory value.',
  icon: Boxes,
  CardComponent: Card,
  DetailComponent: Detail,
};
