import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getCancelReasons } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCancelReasons(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Cancel reasons" cardKey="cancelReasons" loading={!data} headlineValue={data ? formatCount(data.totalCount) : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatCount} maxRows={4} barColor="#e11d48" />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatCount} maxRows={15} barColor="#e11d48" />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        emptyLabel="No cancelled orders in this period"
        columns={[
          { key: 'label', header: 'Reason', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Revenue lost', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'share', header: '% of cancellations', align: 'right', render: (r) => `${r.percentage}%` },
        ]}
      />
    </div>
  );
}

export const cancelReasonsCard: AnalyticsCardDefinition = {
  key: 'cancelReasons',
  title: 'Cancel reasons',
  category: 'Delivery',
  description: 'Why orders get cancelled, ranked by how often and how much revenue it costs.',
  icon: Ban,
  CardComponent: Card,
  DetailComponent: Detail,
};
