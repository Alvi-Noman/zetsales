import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import type { ProductRankingDTO } from '@zetsales/shared';
import { getProfitByProduct } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query'], limit: number) {
  const [data, setData] = useState<ProductRankingDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getProfitByProduct({ ...query, limit }).then(setData);
  }, [query.range, query.from, query.to, query.storeId, limit]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 5);
  return (
    <AnalyticsCardShell title="Profit by product" cardKey="profitByProduct" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.productId} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{r.grossProfit != null ? formatMoney(r.grossProfit) : '—'}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No delivered orders with known cost in this period</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 50);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Cost is only known once a delivered order's inventory was consumed at a tracked unit cost — apportioned to each line item by its share of the order's subtotal, since cost is tracked
        per order, not per line.
      </p>
      <RankedTable
        keyField={(r) => r.productId}
        rows={data.rows}
        emptyLabel="No delivered orders with known cost in this period"
        columns={[
          {
            key: 'title',
            header: 'Product',
            render: (r) => (
              <span className="flex items-center gap-2.5">
                {r.image ? <img src={r.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" /> : <span className="h-8 w-8 shrink-0 rounded-md bg-slate-100" />}
                <span className="min-w-0 truncate font-medium text-slate-700">{r.title}</span>
              </span>
            ),
          },
          { key: 'units', header: 'Units sold', align: 'right', render: (r) => formatCount(r.unitsSold) },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.revenue) },
          { key: 'cogs', header: 'COGS', align: 'right', render: (r) => (r.cogs != null ? formatMoney(r.cogs) : '—') },
          { key: 'profit', header: 'Gross profit', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{r.grossProfit != null ? formatMoney(r.grossProfit) : '—'}</span> },
          { key: 'margin', header: 'Margin', align: 'right', render: (r) => (r.marginPercent != null ? formatPercent(r.marginPercent) : '—') },
        ]}
      />
    </div>
  );
}

export const profitByProductCard: AnalyticsCardDefinition = {
  key: 'profitByProduct',
  title: 'Profit by product',
  category: 'Finance',
  description: 'Which products actually make money once cost of goods is accounted for.',
  icon: Coins,
  CardComponent: Card,
  DetailComponent: Detail,
};
