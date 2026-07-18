import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import type { OrderReturnReportDTO } from '@zetsales/shared';
import { getOrderReturnReport } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { DonutChart } from '../../components/analytics/charts/DonutChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<OrderReturnReportDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getOrderReturnReport(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Order return report" cardKey="orderReturnReport" loading={!data} headlineValue={data ? formatCount(data.totalCount) : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-500">Return rate</span>
            <span className="font-semibold tabular-nums text-slate-700">{data.returnRate != null ? `${data.returnRate}%` : '—'}</span>
          </div>
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-500">Revenue tied up</span>
            <span className="font-semibold tabular-nums text-slate-700">{formatMoney(data.totalValue)}</span>
          </div>
          {data.byStage.rows.slice(0, 2).map((r) => (
            <div key={r.key} className="flex items-center justify-between text-[11.5px]">
              <span className="text-slate-500">{r.label}</span>
              <span className="font-semibold tabular-nums text-slate-700">{formatCount(r.count)}</span>
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
        Order-level view of the return pipeline — RTO Initiated, QC Pending, and Returned orders created in this period. Return rate is these orders as a share of every order that ever left
        Processing (Ready for Pickup or later), the same denominator "Top returned products" uses per unit. For per-SKU return rates see that card; for the courier/shipping cost of these
        returns see "RTO loss".
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <DonutChart slices={data.byStage.rows.map((r) => ({ key: r.key, label: r.label, value: r.count }))} formatValue={formatCount} />
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">By pipeline stage</p>
        <RankedTable
          keyField={(r) => r.key}
          rows={data.byStage.rows}
          emptyLabel="No returns in this period"
          columns={[
            { key: 'label', header: 'Stage', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
            { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
            { key: 'value', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
            { key: 'share', header: '% of returns', align: 'right', render: (r) => `${r.percentage}%` },
          ]}
        />
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">By courier</p>
        <RankedTable
          keyField={(r) => r.key}
          rows={data.byCourier.rows}
          emptyLabel="No returns in this period"
          columns={[
            { key: 'label', header: 'Courier', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
            { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
            { key: 'value', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
            { key: 'share', header: '% of returns', align: 'right', render: (r) => `${r.percentage}%` },
          ]}
        />
      </div>
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">By store</p>
        <RankedTable
          keyField={(r) => r.key}
          rows={data.byStore.rows}
          emptyLabel="No returns in this period"
          columns={[
            { key: 'label', header: 'Store', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
            { key: 'count', header: 'Orders', align: 'right', render: (r) => formatCount(r.count) },
            { key: 'value', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.value) },
            { key: 'share', header: '% of returns', align: 'right', render: (r) => `${r.percentage}%` },
          ]}
        />
      </div>
    </div>
  );
}

export const orderReturnReportCard: AnalyticsCardDefinition = {
  key: 'orderReturnReport',
  title: 'Order return report',
  category: 'Delivery',
  description: 'Order-level return pipeline — how many orders, at which stage of RTO/QC/Returned, broken down by courier and store.',
  icon: Undo2,
  CardComponent: Card,
  DetailComponent: Detail,
};
