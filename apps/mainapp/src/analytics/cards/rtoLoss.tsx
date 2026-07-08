import { useEffect, useState } from 'react';
import { FlameKindling } from 'lucide-react';
import type { RtoLossDTO } from '@zetsales/shared';
import { getRtoLoss } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<RtoLossDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getRtoLoss(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="RTO loss" cardKey="rtoLoss" loading={!data} headlineValue={data ? formatMoney(data.totalLoss) : undefined} trendGoodDirection="down">
      {data && <ParetoChart rows={data.breakdown.rows} formatValue={formatMoney} maxRows={4} barColor="#e11d48" />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Courier outbound delivery charge plus the original shipping fee, for every order that ended up Returned or in the RTO pipeline — a floor on the real loss, not the ceiling: no
        return-leg courier fee is captured anywhere, and damaged-stock write-offs from failed returns are logged per SKU, not per order, so neither is attributable back into this figure.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.breakdown.rows} formatValue={formatMoney} maxRows={10} barColor="#e11d48" />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.breakdown.rows}
        columns={[
          { key: 'label', header: 'Component', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'RTO/returned orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Amount', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.value)}</span> },
        ]}
      />
    </div>
  );
}

export const rtoLossCard: AnalyticsCardDefinition = {
  key: 'rtoLoss',
  title: 'RTO loss',
  category: 'Finance',
  description: 'The real cost of a failed delivery — outbound courier charge plus the shipping fee already spent.',
  icon: FlameKindling,
  CardComponent: Card,
  DetailComponent: Detail,
};
