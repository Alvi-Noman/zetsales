import { useEffect, useState } from 'react';
import { PackageOpen } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getPartialDeliveryRate } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getPartialDeliveryRate(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const partial = data?.rows.find((r) => r.key === 'Partial Delivered');
  const partialShare = data && data.totalCount > 0 && partial ? Math.round((partial.count / data.totalCount) * 100) : 0;
  return (
    <AnalyticsCardShell title="Partial delivery rate" cardKey="partialDeliveryRate" loading={!data} headlineValue={data ? `${partialShare}%` : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-1.5">
          {data.rows.map((r) => (
            <div key={r.key} className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-500">{r.label}</span>
              <span className="font-semibold tabular-nums text-slate-700">{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        A customer keeping only part of a multi-item order — the rest goes straight back into the RTO Initiated pipeline at the doorstep. Worth watching separately from a full delivery,
        since it's a different signal than either a clean delivery or a full refusal.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.rows.map((r) => ({ key: r.key, label: r.label, value: r.count }))} formatValue={formatCount} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'label', header: 'Outcome', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'share', header: '% of total', align: 'right', render: (r) => `${r.percentage}%` },
        ]}
      />
    </div>
  );
}

export const partialDeliveryRateCard: AnalyticsCardDefinition = {
  key: 'partialDeliveryRate',
  title: 'Partial delivery rate',
  category: 'Delivery',
  description: 'How often customers keep only part of a multi-item order instead of all or nothing.',
  icon: PackageOpen,
  CardComponent: Card,
  DetailComponent: Detail,
};
