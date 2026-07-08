import { useEffect, useState } from 'react';
import { ClipboardEdit } from 'lucide-react';
import type { AnalyticsBreakdownDTO } from '@zetsales/shared';
import { getInventoryAdjustments } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { ParetoChart } from '../../components/analytics/charts/ParetoChart';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsBreakdownDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getInventoryAdjustments(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Inventory adjustments" cardKey="inventoryAdjustments" loading={!data} headlineValue={data ? formatMoney(data.totalValue) : undefined} trendGoodDirection="down">
      {data && <ParetoChart rows={data.rows} formatValue={formatMoney} maxRows={4} barColor="#f97316" />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-400">Damage, loss, cycle-count corrections, and receiving discrepancies — routine sales/returns and warehouse-to-warehouse transfers aren't counted here.</p>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <ParetoChart rows={data.rows} formatValue={formatMoney} maxRows={15} barColor="#f97316" />
      </div>
      <RankedTable
        keyField={(r) => r.key}
        rows={data.rows}
        emptyLabel="No inventory adjustments in this period"
        columns={[
          { key: 'label', header: 'Reason', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
          { key: 'count', header: 'Units', align: 'right', render: (r) => formatCount(r.count) },
          { key: 'value', header: 'Value', align: 'right', render: (r) => formatMoney(r.value) },
        ]}
      />
    </div>
  );
}

export const inventoryAdjustmentsCard: AnalyticsCardDefinition = {
  key: 'inventoryAdjustments',
  title: 'Inventory adjustments',
  category: 'Inventory',
  description: 'Damage, loss, and count corrections, by reason.',
  icon: ClipboardEdit,
  CardComponent: Card,
  DetailComponent: Detail,
};
