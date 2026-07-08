import { useEffect, useState } from 'react';
import { CopyX } from 'lucide-react';
import type { DuplicateOrdersDTO } from '@zetsales/shared';
import { getDuplicateOrders } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<DuplicateOrdersDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getDuplicateOrders(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Duplicate orders" cardKey="duplicateOrders" loading={!data} headlineValue={data ? formatCount(data.groups.length) : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-2">
          {data.groups.slice(0, 4).map((g) => (
            <div key={`${g.phone}-${g.date}`} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{g.customerName || g.phone}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">×{g.orderCount}</span>
            </div>
          ))}
          {data.groups.length === 0 && <p className="text-xs text-slate-300">No same-day repeats found</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Same phone number placing 2+ orders on the same day — could be an accidental double-submit, or a customer testing whether you'll actually confirm a large batch. Worth a quick look,
        not an automatic block.
      </p>
      <RankedTable
        keyField={(r) => `${r.phone}-${r.date}`}
        rows={data.groups}
        emptyLabel="No same-day repeats found"
        columns={[
          {
            key: 'customer',
            header: 'Customer',
            render: (r) => (
              <span>
                <span className="font-medium text-slate-700">{r.customerName || 'Unnamed'}</span>
                <span className="ml-2 text-slate-400">{r.phone}</span>
              </span>
            ),
          },
          { key: 'date', header: 'Date', render: (r) => r.date },
          { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatCount(r.orderCount) },
          { key: 'numbers', header: 'Order #s', render: (r) => <span className="text-slate-500">{r.orderNumbers.join(', ')}</span> },
          { key: 'value', header: 'Combined value', align: 'right', render: (r) => formatMoney(r.totalValue) },
        ]}
      />
    </div>
  );
}

export const duplicateOrdersCard: AnalyticsCardDefinition = {
  key: 'duplicateOrders',
  title: 'Duplicate orders',
  category: 'Customers',
  description: 'Same phone number ordering more than once on the same day.',
  icon: CopyX,
  CardComponent: Card,
  DetailComponent: Detail,
};
