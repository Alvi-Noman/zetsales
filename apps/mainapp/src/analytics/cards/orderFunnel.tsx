import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import type { OrderFunnelDTO } from '@zetsales/shared';
import { getOrderFunnel } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { FunnelChart } from '../../components/analytics/charts/FunnelChart';
import { formatCount } from '../format';
import type { AnalyticsCardComponentProps } from '../types';
import type { AnalyticsCardDefinition } from '../types';

function useFunnel(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<OrderFunnelDTO | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    void getOrderFunnel(query).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useFunnel(query);
  const deliveredStage = data?.stages[data.stages.length - 1];
  return (
    <AnalyticsCardShell title="Order funnel" cardKey="orderFunnel" loading={!data} headlineValue={deliveredStage ? formatCount(deliveredStage.count) : undefined} trend={null}>
      {data && (
        <div className="space-y-1.5">
          {data.stages.map((s) => (
            <div key={s.stage} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-[10.5px] text-slate-400">{s.stage}</span>
              <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-indigo-400" style={{ width: `${Math.max(4, s.conversionFromStart)}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-slate-500">{s.conversionFromStart}%</span>
            </div>
          ))}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useFunnel(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">{formatCount(data.totalEntered)} orders entered this funnel</p>
        <FunnelChart stages={data.stages} formatCount={formatCount} />
      </div>
      <p className="text-xs text-slate-400">
        "Reached" a stage means the order's own history shows it got at least that far, even if it later fell off (cancelled, returned) — not just where it sits right now.
      </p>
    </div>
  );
}

export const orderFunnelCard: AnalyticsCardDefinition = {
  key: 'orderFunnel',
  title: 'Order funnel',
  category: 'Orders',
  description: 'How far orders get through Pending → Confirmed → Processing → Shipped → Delivered before falling off.',
  icon: Filter,
  CardComponent: Card,
  DetailComponent: Detail,
};
