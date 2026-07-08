import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { AnalyticsBreakdownDTO, AnalyticsBreakdownRowDTO } from '@zetsales/shared';
import { getAbcAnalysis } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function abcClassOf(row: AnalyticsBreakdownRowDTO): 'A' | 'B' | 'C' {
  if (row.cumulativePercentage <= 80) return 'A';
  if (row.cumulativePercentage <= 95) return 'B';
  return 'C';
}

const CLASS_STYLE: Record<'A' | 'B' | 'C', string> = {
  A: 'bg-emerald-50 text-emerald-700',
  B: 'bg-amber-50 text-amber-700',
  C: 'bg-slate-100 text-slate-500',
};

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getAbcAnalysis(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const classA = data?.rows.filter((r) => abcClassOf(r) === 'A').length ?? 0;
  return (
    <AnalyticsCardShell title="ABC product analysis" cardKey="abcAnalysis" loading={!data} headlineValue={data ? `${classA} class A` : undefined}>
      {data && <ParetoChart rows={data.rows} formatValue={formatMoney} maxRows={4} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">
        Class A products make up the top 80% of revenue, B the next 15%, C the long tail — the classic Pareto cut, applied to what actually sold in this period.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} maxRows={20} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        columns={[
          { key: 'class', header: 'Class', render: (r) => <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${CLASS_STYLE[abcClassOf(r)]}`}>{abcClassOf(r)}</span> },
          { key: 'label', header: 'Product', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'units', header: 'Units sold', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
          { key: 'cum', header: 'Cumulative %', align: 'right', render: (r) => `${r.cumulativePercentage}%` },
        ]}
      />
    </div>
  );
}

export const abcAnalysisCard: AnalyticsCardDefinition = {
  key: 'abcAnalysis',
  title: 'ABC product analysis',
  category: 'Inventory',
  description: 'Which products drive most of your revenue (A), and which are the long tail (C).',
  icon: BarChart3,
  CardComponent: Card,
  DetailComponent: Detail,
};
