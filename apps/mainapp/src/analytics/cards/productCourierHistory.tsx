import { useEffect, useState } from 'react';
import { Route } from 'lucide-react';
import type { ProductCourierHistoryDTO } from '@zetsales/shared';
import { getProductCourierHistory } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query'], limit: number) {
  const [data, setData] = useState<ProductCourierHistoryDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getProductCourierHistory({ ...query, limit }).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo, limit]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 5);
  return (
    <AnalyticsCardShell title="Product courier history" cardKey="productCourierHistory" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={`${r.productId}::${r.courierPartner}`} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">
                {r.title} <span className="text-slate-300">· {r.courierPartner}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{r.deliveredRate != null ? formatPercent(r.deliveredRate) : '—'}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No courier-shipped orders in this period</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 100);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        The cross-cut neither Courier performance (per-courier only) nor Product performance (per-product only) gives — for this exact product via this exact courier, what's the delivered/RTO
        rate. Useful for deciding whether a specific SKU's parcels should route to a different courier.
      </p>
      <RankedTable
        keyField={(r) => `${r.productId}::${r.courierPartner}`}
        rows={data.rows}
        emptyLabel="No courier-shipped orders in this period"
        columns={[
          { key: 'title', header: 'Product', render: (r) => <span className="font-medium text-slate-700">{r.title}</span> },
          { key: 'courier', header: 'Courier', render: (r) => r.courierPartner },
          { key: 'units', header: 'Units shipped', align: 'right', render: (r) => formatCount(r.unitsShipped) },
          { key: 'delivered', header: 'Delivered rate', align: 'right', render: (r) => (r.deliveredRate != null ? <span className="font-semibold text-emerald-600">{formatPercent(r.deliveredRate)}</span> : '—') },
          { key: 'rto', header: 'RTO rate', align: 'right', render: (r) => (r.rtoRate != null ? <span className="text-amber-600">{formatPercent(r.rtoRate)}</span> : '—') },
        ]}
      />
    </div>
  );
}

export const productCourierHistoryCard: AnalyticsCardDefinition = {
  key: 'productCourierHistory',
  title: 'Product courier history',
  category: 'Delivery',
  description: 'Delivered/RTO rate for each product, broken down by which courier shipped it.',
  icon: Route,
  CardComponent: Card,
  DetailComponent: Detail,
};
