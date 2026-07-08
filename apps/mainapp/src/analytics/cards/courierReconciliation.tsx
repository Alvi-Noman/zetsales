import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import type { CourierReconciliationDTO } from '@zetsales/shared';
import { getCourierReconciliation } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<CourierReconciliationDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCourierReconciliation(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const totalDue = data?.rows.reduce((s, r) => s + r.due, 0) ?? 0;
  return (
    <AnalyticsCardShell title="Courier reconciliation" cardKey="courierReconciliation" loading={!data} headlineValue={data ? formatMoney(totalDue) : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.provider} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.displayName}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{formatMoney(r.due)} due</span>
            </div>
          ))}
          {data.rows.length === 0 && <p className="text-xs text-slate-300">No couriers connected yet</p>}
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
        Delivered COD and Due are lifetime running balances, not scoped to the date filter above — a courier's outstanding balance carries forward, so a period-scoped number would be
        misleading. "Due" = Delivered COD − Courier Charges − Payouts you've recorded below each courier in Integrations.
      </p>
      <RankedTable
        keyField={(r) => r.provider}
        rows={data.rows}
        emptyLabel="Connect a courier in Integrations to see reconciliation"
        columns={[
          { key: 'name', header: 'Courier', render: (r) => <span className="font-medium text-slate-700">{r.displayName}</span> },
          { key: 'delivered', header: 'Delivered COD', align: 'right', render: (r) => formatMoney(r.deliveredCodAmount) },
          { key: 'charges', header: 'Courier charges', align: 'right', render: (r) => formatMoney(r.courierCharges) },
          { key: 'receivable', header: 'Expected receivable', align: 'right', render: (r) => formatMoney(r.expectedReceivable) },
          { key: 'paid', header: 'Paid', align: 'right', render: (r) => formatMoney(r.paid) },
          { key: 'due', header: 'Due', align: 'right', render: (r) => <span className="font-semibold text-slate-900">{formatMoney(r.due)}</span> },
        ]}
      />
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">COD payment aging</p>
        <p className="mb-3 text-xs text-slate-400">Delivered orders still marked COD Pending, by how long they've been waiting.</p>
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

export const courierReconciliationCard: AnalyticsCardDefinition = {
  key: 'courierReconciliation',
  title: 'Courier reconciliation',
  category: 'Delivery',
  description: 'How much each courier owes you for delivered COD orders — the core "is cash actually converting" report.',
  icon: Receipt,
  CardComponent: Card,
  DetailComponent: Detail,
};
