import { useEffect, useState } from 'react';
import { Waves } from 'lucide-react';
import type { MarginWaterfallDTO, MarginWaterfallStepDTO } from '@zetsales/shared';
import { getMarginWaterfall } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<MarginWaterfallDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getMarginWaterfall(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

// A running-total bar list rather than a floating-segment waterfall chart — every step's own bar
// is still proportional to the largest magnitude in the set, and the running total after each step
// carries the "waterfall" narrative without a bespoke chart primitive for a single one-off card.
function WaterfallRows({ steps, netProfit }: { steps: MarginWaterfallStepDTO[]; netProfit: number }) {
  const maxMagnitude = Math.max(...steps.map((s) => Math.abs(s.value)), Math.abs(netProfit), 1);
  let running = 0;
  return (
    <div className="space-y-3">
      {steps.map((s) => {
        running += s.value;
        const isNegative = s.value < 0;
        return (
          <div key={s.label}>
            <div className="mb-1 flex items-baseline justify-between text-[12.5px]">
              <span className="font-medium text-slate-700">{s.label}</span>
              <span className={`font-semibold tabular-nums ${isNegative ? 'text-rose-600' : 'text-emerald-600'}`}>
                {isNegative ? '-' : '+'}
                {formatMoney(Math.abs(s.value))}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className={`h-2 rounded-full ${isNegative ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${Math.max(2, (Math.abs(s.value) / maxMagnitude) * 100)}%` }} />
            </div>
            <p className="mt-1 text-right text-[10.5px] text-slate-400">running total: {formatMoney(running)}</p>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-slate-200 pt-3">
        <span className="text-sm font-bold text-slate-900">Net profit</span>
        <span className={`text-lg font-black tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatMoney(netProfit)}</span>
      </div>
    </div>
  );
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Margin waterfall" cardKey="marginWaterfall" loading={!data} headlineValue={data ? formatMoney(data.netProfit) : undefined}>
      {data && (
        <div className="space-y-1.5">
          {data.steps.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-500">{s.label}</span>
              <span className={`font-semibold tabular-nums ${s.value < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {s.value < 0 ? '-' : '+'}
                {formatMoney(Math.abs(s.value))}
              </span>
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
        Gross sales down to net profit, one deduction at a time — courier charges and COGS are only counted for delivered orders, since those are the only costs actually realized.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <WaterfallRows steps={data.steps} netProfit={data.netProfit} />
      </div>
    </div>
  );
}

export const marginWaterfallCard: AnalyticsCardDefinition = {
  key: 'marginWaterfall',
  title: 'Margin waterfall',
  category: 'Finance',
  description: 'Gross sales down to net profit — discounts, cancellations/RTO, courier charges, and COGS, in order.',
  icon: Waves,
  CardComponent: Card,
  DetailComponent: Detail,
};
