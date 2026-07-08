import { useEffect, useState } from 'react';
import { CalendarCheck2 } from 'lucide-react';
import type { RescheduleEffectivenessDTO } from '@zetsales/shared';
import { getRescheduleEffectiveness } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<RescheduleEffectivenessDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getRescheduleEffectiveness(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell
      title="Reschedule effectiveness"
      cardKey="rescheduleEffectiveness"
      loading={!data}
      headlineValue={data?.conversionRate != null ? formatPercent(data.conversionRate) : undefined}
    >
      {data && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-slate-400">Rescheduled</p>
            <p className="font-semibold text-slate-700 tabular-nums">{formatCount(data.totalRescheduled)}</p>
          </div>
          <div>
            <p className="text-slate-400">Converted</p>
            <p className="font-semibold text-slate-700 tabular-nums">{formatCount(data.convertedCount)}</p>
          </div>
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
        Orders that went On Hold for "Customer requested reschedule" at some point — what actually happened to them afterward.
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.breakdown.rows.map((r) => ({ key: r.key, label: r.label, value: r.count }))} formatValue={formatCount} />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.breakdown.rows}
        columns={[
          { key: 'label', header: 'Outcome', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Value', align: 'right', render: (r) => formatMoney(r.value) },
        ]}
      />
    </div>
  );
}

export const rescheduleEffectivenessCard: AnalyticsCardDefinition = {
  key: 'rescheduleEffectiveness',
  title: 'Reschedule effectiveness',
  category: 'Orders',
  description: 'When a customer asks to reschedule, how often that actually turns into a delivery.',
  icon: CalendarCheck2,
  CardComponent: Card,
  DetailComponent: Detail,
};
