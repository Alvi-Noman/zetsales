import { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';
import type { AnalyticsSeriesDTO } from '@zetsales/shared';
import { getDiscountsOverTime } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { SeriesChart } from '../../components/analytics/charts/SeriesChart';
import { formatMoney } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<AnalyticsSeriesDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getDiscountsOverTime(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Discounts" cardKey="discountsOverTime" loading={!data} headlineValue={data ? formatMoney(data.totalCurrent) : undefined} trend={data?.trend ?? null} trendGoodDirection="down">
      {data && <SeriesChart series={data} color="#f97316" formatValue={formatMoney} />}
    </AnalyticsCardShell>
  );
}

function Detail({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  if (!data) return <div className="h-64 animate-pulse rounded-xl bg-slate-50" />;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <SeriesChart series={data} color="#f97316" formatValue={formatMoney} height={220} />
    </div>
  );
}

export const discountsOverTimeCard: AnalyticsCardDefinition = {
  key: 'discountsOverTime',
  title: 'Discounts',
  category: 'Finance',
  description: 'Total discount amount given away, per day.',
  icon: Tag,
  CardComponent: Card,
  DetailComponent: Detail,
};
