import { useEffect, useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import type { RfmSegmentsDTO } from '@zetsales/shared';
import { getRfmSegments } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<RfmSegmentsDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getRfmSegments(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Customer segments (RFM)" cardKey="rfmSegments" loading={!data} headlineValue={data ? formatCount(data.segments.totalCount) : undefined}>
      {data && <ParetoChart rows={data.segments.rows} formatValue={formatCount} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Segments blend recency, frequency, and lifetime spend with delivery success rate — a COD customer who orders often but rarely accepts delivery isn't a "good" customer, so it isn't
        scored as one here.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.segments.rows} formatValue={formatCount} formatSecondaryRate={formatPercent} secondaryRateLabel="delivered" maxRows={10} />
      </div>
      <RankedTable
        keyField={(r) => r.phone}
        rows={data.customers}
        columns={[
          {
            key: 'name',
            header: 'Customer',
            render: (r) => (
              <span>
                <span className="font-medium text-slate-700">{r.name || 'Unnamed'}</span>
                <span className="ml-2 text-slate-400">{r.phone}</span>
              </span>
            ),
          },
          { key: 'segment', header: 'Segment', render: (r) => <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">{r.segment}</span> },
          { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatCount(r.orderCount) },
          { key: 'recency', header: 'Last order', align: 'right', render: (r) => (r.recencyDays != null ? `${r.recencyDays}d ago` : '—') },
          { key: 'spend', header: 'Lifetime spend', align: 'right', render: (r) => formatMoney(r.totalSpend) },
        ]}
      />
    </div>
  );
}

export const rfmSegmentsCard: AnalyticsCardDefinition = {
  key: 'rfmSegments',
  title: 'Customer segments (RFM)',
  category: 'Customers',
  description: 'Recency, frequency, and monetary value segments — weighted by delivery success, not just order count.',
  icon: LayoutGrid,
  CardComponent: Card,
  DetailComponent: Detail,
};
