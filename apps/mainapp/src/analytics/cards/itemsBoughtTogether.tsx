import { useEffect, useState } from 'react';
import { Combine } from 'lucide-react';
import type { ItemsBoughtTogetherDTO } from '@zetsales/shared';
import { getItemsBoughtTogether } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<ItemsBoughtTogetherDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getItemsBoughtTogether(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Items bought together" cardKey="itemsBoughtTogether" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={`${r.productA}-${r.productB}`} className="text-[11.5px]">
              <span className="text-slate-600">{r.productA}</span> <span className="text-slate-300">+</span> <span className="text-slate-600">{r.productB}</span>
              <span className="ml-2 font-semibold tabular-nums text-slate-800">×{r.pairCount}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No multi-item orders in this period</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <RankedTable
      keyField={(r) => `${r.productA}-${r.productB}`}
      rows={data.rows}
      emptyLabel="No multi-item orders in this period"
      columns={[
        { key: 'a', header: 'Product A', render: (r) => <span className="font-medium text-slate-700">{r.productA}</span> },
        { key: 'b', header: 'Product B', render: (r) => <span className="font-medium text-slate-700">{r.productB}</span> },
        { key: 'count', header: 'Bought together', align: 'right', render: (r) => formatCount(r.pairCount) },
      ]}
    />
  );
}

export const itemsBoughtTogetherCard: AnalyticsCardDefinition = {
  key: 'itemsBoughtTogether',
  title: 'Items bought together',
  category: 'Inventory',
  description: 'Which products commonly appear in the same order — a starting point for bundles or cross-sells.',
  icon: Combine,
  CardComponent: Card,
  DetailComponent: Detail,
};
