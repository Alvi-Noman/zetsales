import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import type { MarketingRoasDTO } from '@zetsales/shared';
import { getMarketingRoas } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<MarketingRoasDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getMarketingRoas(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function formatRatio(v: number | null) {
  return v != null ? `${v}×` : '—';
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Marketing ROAS" cardKey="marketingRoas" loading={!data} headlineValue={data ? formatRatio(data.roas) : undefined}>
      {data && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <p className="text-slate-400">Ad spend</p>
            <p className="font-semibold tabular-nums text-slate-700">{formatMoney(data.adSpend)}</p>
          </div>
          <div>
            <p className="text-slate-400">Profit ROAS</p>
            <p className="font-semibold tabular-nums text-slate-700">{formatRatio(data.profitRoas)}</p>
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
        Wired to expenses logged under the "Advertising" category in Accounting & Finance — if you're not logging ad spend there yet, this will show zero rather than a guess.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Ad spend', value: formatMoney(data.adSpend) },
          { label: 'Net sales', value: formatMoney(data.netSales) },
          { label: 'ROAS', value: formatRatio(data.roas) },
          { label: 'Profit ROAS', value: formatRatio(data.profitRoas) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{m.label}</p>
            <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">{m.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-4 text-sm font-semibold text-slate-700">Ad spend, per day</p>
        <SeriesChart series={data.series} color="#8b5cf6" formatValue={formatMoney} height={220} />
      </div>
    </div>
  );
}

export const marketingRoasCard: AnalyticsCardDefinition = {
  key: 'marketingRoas',
  title: 'Marketing ROAS',
  category: 'Sales',
  description: 'Return on ad spend, using net sales and gross profit instead of raw revenue — the COD-honest version of ROAS.',
  icon: Megaphone,
  CardComponent: Card,
  DetailComponent: Detail,
};
