import { useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import type { DeadStockDTO } from '@zetsales/shared';
import { getDeadStock } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<DeadStockDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getDeadStock(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Dead stock" cardKey="deadStock" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.productId} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{r.daysSinceLastSale != null ? `${r.daysSinceLastSale}d` : 'never'}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">Nothing dead in the selected range</p>}
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
        In stock, but no sale since the start of the selected date range — pick a longer range (60/90 days) above for a meaningful list; a 7-day window will flag almost your whole catalog.
      </p>
      <RankedTable
        keyField={(r) => r.productId}
        rows={data.rows}
        emptyLabel="Nothing dead in the selected range"
        columns={[
          { key: 'title', header: 'Product', render: (r) => <span className="font-medium text-slate-700">{r.title}</span> },
          { key: 'stock', header: 'Current stock', align: 'right', render: (r) => formatCount(r.currentStock) },
          { key: 'days', header: 'Days since last sale', align: 'right', render: (r) => (r.daysSinceLastSale != null ? `${r.daysSinceLastSale}d` : 'Never sold') },
          { key: 'value', header: 'Tied-up value', align: 'right', render: (r) => formatMoney(r.inventoryValue) },
        ]}
      />
    </div>
  );
}

export const deadStockCard: AnalyticsCardDefinition = {
  key: 'deadStock',
  title: 'Dead stock',
  category: 'Inventory',
  description: "Products sitting in stock with no sales in the selected period — capital that isn't moving.",
  icon: Archive,
  CardComponent: Card,
  DetailComponent: Detail,
};
