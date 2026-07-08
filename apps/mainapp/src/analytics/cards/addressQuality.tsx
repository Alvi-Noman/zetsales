import { useEffect, useState } from 'react';
import { MapPinCheck } from 'lucide-react';
import type { AddressQualityDTO } from '@zetsales/shared';
import { getAddressQuality } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AddressQualityDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getAddressQuality(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const total = data?.rows.reduce((s, r) => s + r.count, 0) ?? 0;
  const weakOrMissing = data ? (data.rows.find((r) => r.bucket === 'Weak')?.count ?? 0) + (data.rows.find((r) => r.bucket === 'Missing')?.count ?? 0) : 0;
  const share = total > 0 ? Math.round((weakOrMissing / total) * 100) : 0;
  return (
    <AnalyticsCardShell title="Address quality" cardKey="addressQuality" loading={!data} headlineValue={data ? `${share}% weak/missing` : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-1.5">
          {data.rows.map((r) => (
            <div key={r.bucket} className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-500">{r.bucket}</span>
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
        A cheap heuristic, not real address validation: "Missing" is blank, "Weak" is short or has no digits (house/road numbers are almost always numeric), otherwise "Good". Meant to
        correlate with RTO rate, not to block anyone from ordering.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.rows.map((r) => ({ key: r.bucket, label: r.bucket, value: r.count }))} formatValue={formatCount} />
      </div>
      <RankedTable
        keyField={(r) => r.bucket}
        rows={data.rows}
        columns={[
          { key: 'bucket', header: 'Quality', render: (r) => <span className="font-medium text-slate-700">{r.bucket}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'rto', header: 'RTO rate', align: 'right', render: (r) => (r.rtoRate != null ? formatPercent(r.rtoRate) : '—') },
        ]}
      />
    </div>
  );
}

export const addressQualityCard: AnalyticsCardDefinition = {
  key: 'addressQuality',
  title: 'Address quality',
  category: 'Delivery',
  description: 'How many orders have a weak or missing address, and whether that correlates with RTO.',
  icon: MapPinCheck,
  CardComponent: Card,
  DetailComponent: Detail,
};
