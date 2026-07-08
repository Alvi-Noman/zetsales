import { useEffect, useState } from 'react';
import { ReceiptText } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getCodChangeLog } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCodChangeLog(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="COD change log" cardKey="codChangeLog" loading={!data} headlineValue={data ? formatCount(data.totalCount) : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatCount(r.count)}</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No COD amount changes in this period</p>}
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
        Every time a shipping fee or discount edit changed an order's total (the amount collected on delivery) after it was placed, grouped by who made the change. A high count here is worth a
        look — frequent late COD adjustments usually mean pricing or shipping-fee mistakes upstream.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} maxRows={10} barColor="#f97316" />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        emptyLabel="No COD amount changes in this period"
        columns={[
          { key: 'label', header: 'Changed by', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Changes', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Total amount shifted', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.value)}</span> },
        ]}
      />
    </div>
  );
}

export const codChangeLogCard: AnalyticsCardDefinition = {
  key: 'codChangeLog',
  title: 'COD change log',
  category: 'Finance',
  description: 'Who adjusted the COD amount on an order after it was placed, and by how much — a proxy for upstream pricing/shipping-fee mistakes.',
  icon: ReceiptText,
  CardComponent: Card,
  DetailComponent: Detail,
};
