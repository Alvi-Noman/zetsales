import { useEffect, useState } from 'react';
import { AlertTriangle, Clock3 } from 'lucide-react';
import type { FulfillmentTimeDTO } from '@zetsales/shared';
import { getFulfillmentTime } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { formatHours } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<FulfillmentTimeDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getFulfillmentTime(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const overall = data?.stages.find((s) => s.fromStage === 'Pending' && s.toStage === 'Delivered');
  return (
    <AnalyticsCardShell title="Order-to-fulfillment time" cardKey="fulfillmentTime" loading={!data} headlineValue={overall ? formatHours(overall.avgHours) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.stages
            .filter((s) => !(s.fromStage === 'Pending' && s.toStage === 'Delivered'))
            .map((s) => (
              <div key={`${s.fromStage}-${s.toStage}`} className="flex items-center justify-between text-[11.5px]">
                <span className="text-slate-400">
                  {s.fromStage} → {s.toStage}
                </span>
                <span className="font-semibold tabular-nums text-slate-700">{formatHours(s.avgHours)}</span>
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

  const legStages = data.stages.filter((s) => !(s.fromStage === 'Pending' && s.toStage === 'Delivered'));
  const bottleneck = legStages.reduce((worst, s) => ((s.avgHours ?? -1) > (worst?.avgHours ?? -1) ? s : worst), legStages[0]);

  return (
    <div className="space-y-4">
      {bottleneck?.avgHours != null && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
          <AlertTriangle size={15} className="shrink-0" />
          Slowest leg: <span className="font-semibold">{bottleneck.fromStage} → {bottleneck.toStage}</span>, averaging {formatHours(bottleneck.avgHours)}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.stages.map((s) => (
          <div
            key={`${s.fromStage}-${s.toStage}`}
            className={`rounded-xl border p-4 ${s === bottleneck ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}
          >
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              {s.fromStage} → {s.toStage}
            </p>
            <div className="mt-2 flex items-baseline gap-4">
              <div>
                <p className="text-lg font-bold tabular-nums text-slate-900">{formatHours(s.avgHours)}</p>
                <p className="text-[10.5px] text-slate-400">average</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-slate-500">{formatHours(s.medianHours)}</p>
                <p className="text-[10.5px] text-slate-400">median</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const fulfillmentTimeCard: AnalyticsCardDefinition = {
  key: 'fulfillmentTime',
  title: 'Order-to-fulfillment time',
  category: 'Orders',
  description: 'How long orders spend in each leg of the pipeline, from placed to delivered.',
  icon: Clock3,
  CardComponent: Card,
  DetailComponent: Detail,
};
