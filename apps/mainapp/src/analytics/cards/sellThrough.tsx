import { useEffect, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import type { SellThroughDTO } from '@zetsales/shared';
import { getSellThrough } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<SellThroughDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getSellThrough(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const lowStock = data?.rows.filter((r) => r.daysOfInventory != null && r.daysOfInventory <= 7).length ?? 0;
  return (
    <AnalyticsCardShell title="Sell-through" cardKey="sellThrough" loading={!data} headlineValue={data ? `${lowStock} low stock` : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.productId} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{r.daysOfInventory != null ? `${r.daysOfInventory}d left` : '—'}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No units sold in this period</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Sorted by days of inventory remaining at the current sales pace — matched by real product/variant identity from the inventory ledger, not by SKU text (SKUs can repeat across
        variants).
      </p>
      <RankedTable
        keyField={(r) => r.productId}
        rows={data.rows}
        emptyLabel="No units sold in this period"
        columns={[
          { key: 'title', header: 'Product', render: (r) => <span className="font-medium text-slate-700">{r.title}</span> },
          { key: 'perDay', header: 'Units/day', align: 'right', render: (r) => r.unitsSoldPerDay },
          { key: 'stock', header: 'Current stock', align: 'right', render: (r) => formatCount(r.currentStock) },
          { key: 'days', header: 'Days of inventory', align: 'right', render: (r) => (r.daysOfInventory != null ? `${r.daysOfInventory}d` : '—') },
          { key: 'sold', header: '% sold through', align: 'right', render: (r) => (r.percentageSold != null ? formatPercent(r.percentageSold) : '—') },
        ]}
      />
    </div>
  );
}

export const sellThroughCard: AnalyticsCardDefinition = {
  key: 'sellThrough',
  title: 'Sell-through',
  category: 'Inventory',
  description: "How many days of stock are left at each product's current sales pace.",
  icon: PackageSearch,
  CardComponent: Card,
  DetailComponent: Detail,
};
