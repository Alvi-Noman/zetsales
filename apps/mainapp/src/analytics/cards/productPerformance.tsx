import { useEffect, useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import type { ProductPerformanceDTO, ProductPerformanceRowDTO } from '@zetsales/shared';
import { getProductPerformance } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query'], limit: number) {
  const [data, setData] = useState<ProductPerformanceDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getProductPerformance({ ...query, limit }).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo, limit]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 50);
  // Compact tile answers the headline question directly — which products cancel the most —
  // so it re-sorts by cancel count rather than reusing the detail view's default (order count).
  const topCancelled = useMemo(
    () =>
      data
        ? [...data.rows]
            .filter((r) => r.cancelledOrders > 0)
            .sort((a, b) => b.cancelledOrders - a.cancelledOrders)
            .slice(0, 4)
        : [],
    [data]
  );
  return (
    <AnalyticsCardShell title="Product performance" cardKey="productPerformance" loading={!data} headlineValue={data ? formatCount(data.rows.length) : undefined} trendGoodDirection="down">
      {data && (
        <div className="space-y-2">
          {topCancelled.map((r) => (
            <div key={r.productId} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.title}</span>
              <span className="shrink-0 font-semibold tabular-nums text-rose-600">{r.cancelledOrders} cancelled</span>
            </div>
          ))}
          {topCancelled.length === 0 && <p className="text-xs text-slate-300">No cancellations in this period</p>}
        </div>
      )}
    </AnalyticsCardShell>
  );
}

type SortKey = 'orders' | 'cancelRate' | 'spamRate' | 'duplicateRate' | 'rtoRate' | 'deliveredRate' | 'revenue';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'orders', label: 'Most ordered' },
  { key: 'cancelRate', label: 'Highest cancel rate' },
  { key: 'spamRate', label: 'Highest spam rate' },
  { key: 'duplicateRate', label: 'Highest duplicate rate' },
  { key: 'rtoRate', label: 'Highest RTO rate' },
  { key: 'deliveredRate', label: 'Highest delivered rate' },
  { key: 'revenue', label: 'Highest revenue' },
];

function sortRows(rows: ProductPerformanceRowDTO[], sortKey: SortKey): ProductPerformanceRowDTO[] {
  const sorted = [...rows];
  switch (sortKey) {
    case 'cancelRate':
      // Products with zero cancellations sink to the bottom regardless of rate — a 1-order product
      // that happened to cancel would otherwise tie/beat a 50-order product with a lower rate.
      return sorted.sort((a, b) => (b.cancelRate ?? -1) - (a.cancelRate ?? -1) || b.cancelledOrders - a.cancelledOrders);
    case 'spamRate':
      return sorted.sort((a, b) => (b.spamRate ?? -1) - (a.spamRate ?? -1) || b.spamOrders - a.spamOrders);
    case 'duplicateRate':
      return sorted.sort((a, b) => (b.duplicateRate ?? -1) - (a.duplicateRate ?? -1) || b.duplicateOrders - a.duplicateOrders);
    case 'rtoRate':
      return sorted.sort((a, b) => (b.rtoRate ?? -1) - (a.rtoRate ?? -1) || b.rtoOrders - a.rtoOrders);
    case 'deliveredRate':
      return sorted.sort((a, b) => (b.deliveredRate ?? -1) - (a.deliveredRate ?? -1) || b.deliveredOrders - a.deliveredOrders);
    case 'revenue':
      return sorted.sort((a, b) => b.revenue - a.revenue);
    case 'orders':
    default:
      return sorted.sort((a, b) => b.orderCount - a.orderCount);
  }
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query, 100);
  const [sortKey, setSortKey] = useState<SortKey>('cancelRate');
  const rows = useMemo(() => (data ? sortRows(data.rows, sortKey) : []), [data, sortKey]);

  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Every product ordered in the selected period, broken down by what happened to those orders: cancelled before ever shipping, RTO'd/returned after shipping, or delivered. Cancel rate is
        of every order placed for that product; RTO and delivered rate are of orders that actually shipped and reached a final outcome. Spam and Duplicate are the subsets of cancellations
        specifically reasoned "Spam" or "Duplicate order" — a high rate on one product points at a pattern specific to that listing rather than a store-wide problem.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setSortKey(opt.key)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
              sortKey === opt.key ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <RankedTable
        keyField={(r) => r.productId}
        rows={rows}
        emptyLabel="No orders in this period"
        columns={[
          {
            key: 'title',
            header: 'Product',
            render: (r) => (
              <span className="flex items-center gap-2.5">
                {r.image ? <img src={r.image} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" /> : <span className="h-8 w-8 shrink-0 rounded-md bg-slate-100" />}
                <span className="min-w-0 truncate font-medium text-slate-700">{r.title}</span>
              </span>
            ),
          },
          { key: 'orders', header: 'Orders', align: 'right', render: (r) => formatCount(r.orderCount) },
          { key: 'revenue', header: 'Revenue', align: 'right', render: (r) => formatMoney(r.revenue) },
          {
            key: 'cancelled',
            header: 'Cancelled',
            align: 'right',
            render: (r) => (
              <span className={r.cancelledOrders > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                {formatCount(r.cancelledOrders)}
                {r.cancelRate != null ? ` (${formatPercent(r.cancelRate)})` : ''}
              </span>
            ),
          },
          {
            key: 'spam',
            header: 'Spam',
            align: 'right',
            render: (r) => (
              <span className={r.spamOrders > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}>
                {formatCount(r.spamOrders)}
                {r.spamRate != null ? ` (${formatPercent(r.spamRate)})` : ''}
              </span>
            ),
          },
          {
            key: 'duplicate',
            header: 'Duplicate',
            align: 'right',
            render: (r) => (
              <span className={r.duplicateOrders > 0 ? 'font-semibold text-purple-600' : 'text-slate-400'}>
                {formatCount(r.duplicateOrders)}
                {r.duplicateRate != null ? ` (${formatPercent(r.duplicateRate)})` : ''}
              </span>
            ),
          },
          {
            key: 'rto',
            header: 'RTO / returned',
            align: 'right',
            render: (r) => (
              <span className={r.rtoOrders > 0 ? 'text-amber-600' : 'text-slate-400'}>
                {formatCount(r.rtoOrders)}
                {r.rtoRate != null ? ` (${formatPercent(r.rtoRate)})` : ''}
              </span>
            ),
          },
          {
            key: 'delivered',
            header: 'Delivered',
            align: 'right',
            render: (r) => (
              <span className="text-emerald-600">
                {formatCount(r.deliveredOrders)}
                {r.deliveredRate != null ? ` (${formatPercent(r.deliveredRate)})` : ''}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

export const productPerformanceCard: AnalyticsCardDefinition = {
  key: 'productPerformance',
  title: 'Product performance',
  category: 'Orders',
  description: 'Per-product order outcomes — which products cancel, RTO, or deliver most for the selected period.',
  icon: PackageSearch,
  CardComponent: Card,
  DetailComponent: Detail,
};
