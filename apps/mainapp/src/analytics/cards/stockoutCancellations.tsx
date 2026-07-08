import { useEffect, useState } from 'react';
import { PackageX } from 'lucide-react';
import type { StockoutCancellationsDTO } from '@zetsales/shared';
import { getStockoutCancellations } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<StockoutCancellationsDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getStockoutCancellations(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell
      title="Stockout cancellations"
      cardKey="stockoutCancellations"
      loading={!data}
      headlineValue={data ? formatCount(data.series.totalCurrent) : undefined}
      trend={data?.series.trend ?? null}
      trendGoodDirection="down"
    >
      {data && <SeriesChart series={data.series} color="#e11d48" formatValue={formatCount} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Orders cancelled for "Out of stock", per day</p>
        <SeriesChart series={data.series} color="#e11d48" formatValue={formatCount} height={220} />
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">Most affected products</p>
        <RankedTable
          keyField={(r) => r.key}
          rows={data.topAffectedProducts}
          emptyLabel="No stockout cancellations in this period"
          columns={[
            { key: 'label', header: 'Product', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
            { key: 'units', header: 'Units missed', align: 'right', render: (r) => formatCount(r.count) },
            { key: 'value', header: 'Revenue lost', align: 'right', render: (r) => formatMoney(r.value) },
          ]}
        />
      </div>
    </div>
  );
}

export const stockoutCancellationsCard: AnalyticsCardDefinition = {
  key: 'stockoutCancellations',
  title: 'Stockout cancellations',
  category: 'Inventory',
  description: 'Orders lost to being out of stock, and which products it happens to most.',
  icon: PackageX,
  CardComponent: Card,
  DetailComponent: Detail,
};
