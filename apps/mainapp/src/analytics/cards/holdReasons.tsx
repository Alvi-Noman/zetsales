import { useEffect, useState } from 'react';
import { PauseCircle } from 'lucide-react';
import type { HoldReasonsDTO } from '@zetsales/shared';
import { getHoldReasons } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<HoldReasonsDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getHoldReasons(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Hold reasons" cardKey="holdReasons" loading={!data} headlineValue={data ? formatCount(data.breakdown.totalCount) : undefined}>
      {data && <ParetoChart rows={data.breakdown.rows} formatValue={formatCount} maxRows={4} barColor="#f97316" />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        A snapshot of orders on hold right now, not a running total — the reason field clears the moment an order resumes, so this can only reflect what's currently stuck.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.breakdown.rows} formatValue={formatCount} maxRows={15} barColor="#f97316" />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.breakdown.rows}
        emptyLabel="Nothing on hold right now"
        columns={[
          { key: 'label', header: 'Reason', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Value on hold', align: 'right', render: (r) => formatMoney(r.value) },
        ]}
      />
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">How long they've been stuck</p>
        <RankedTable
          keyField={(r) => r.label}
          rows={data.aging}
          columns={[
            { key: 'label', header: 'Age', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
            { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
            { key: 'value', header: 'Value', align: 'right', render: (r) => formatMoney(r.value) },
          ]}
        />
      </div>
    </div>
  );
}

export const holdReasonsCard: AnalyticsCardDefinition = {
  key: 'holdReasons',
  title: 'Hold reasons',
  category: 'Delivery',
  description: 'Why orders are currently stuck on hold, ranked by how often — and how long they have been stuck.',
  icon: PauseCircle,
  CardComponent: Card,
  DetailComponent: Detail,
};
