import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import type { ProductRankingDTO } from '@zetsales/shared';
import { getTopProducts } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query'], limit: number) {
  const [data, setData] = useState<ProductRankingDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getTopProducts({ ...query, limit }).then(setData);
  }, [query.range, query.from, query.to, query.storeId, limit]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 5);
  return (
    <AnalyticsCardShell title="Top products" cardKey="topProducts" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.productId} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatMoney(r.revenue)}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No sales in this period</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 50);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <RankedTable
      keyField={(r) => r.productId}
      rows={data.rows}
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
        { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatCount(r.orderCount) },
        { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.revenue)}</span> },
      ]}
    />
  );
}

export const topProductsCard: AnalyticsCardDefinition = {
  key: 'topProducts',
  title: 'Top products',
  category: 'Sales',
  description: 'Best-selling products and variants by revenue.',
  icon: Package,
  CardComponent: Card,
  DetailComponent: Detail,
};
