import { useEffect, useState } from 'react';
import { LineChart } from 'lucide-react';
import type { CohortRetentionDTO } from '@zetsales/shared';
import { getCohortRetention } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatCount, formatPercent } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<CohortRetentionDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCohortRetention(query).then(setData);
  }, [query.storeId]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  const latestMature = data?.rows.find((r) => r.retained30d != null);
  return (
    <AnalyticsCardShell title="Cohort retention" cardKey="cohortRetention" loading={!data} headlineValue={latestMature?.retained30d != null ? formatPercent(latestMature.retained30d) : undefined}>
      {data && (
        <div className="space-y-2">
          {data.rows.slice(0, 4).map((r) => (
            <div key={r.cohortMonth} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="truncate text-slate-600">{r.cohortMonth}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-800">{r.retained30d != null ? formatPercent(r.retained30d) : 'too new'}</span>
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
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Ignores the date filter above — a cohort's retention is a lifetime fact about that group of first-time customers, not something a short window can answer. A blank cell means that
        cohort hasn't existed long enough yet for that window to have elapsed.
      </p>
      <RankedTable
        keyField={(r) => r.cohortMonth}
        rows={data.rows}
        columns={[
          { key: 'month', header: 'Cohort (first order)', render: (r) => <span className="font-medium text-slate-700">{r.cohortMonth}</span> },
          { key: 'new', header: 'New customers', align: 'right', render: (r) => formatCount(r.newCustomers) },
          { key: 'r30', header: '30-day repeat', align: 'right', render: (r) => (r.retained30d != null ? formatPercent(r.retained30d) : '—') },
          { key: 'r60', header: '60-day repeat', align: 'right', render: (r) => (r.retained60d != null ? formatPercent(r.retained60d) : '—') },
          { key: 'r90', header: '90-day repeat', align: 'right', render: (r) => (r.retained90d != null ? formatPercent(r.retained90d) : '—') },
        ]}
      />
    </div>
  );
}

export const cohortRetentionCard: AnalyticsCardDefinition = {
  key: 'cohortRetention',
  title: 'Cohort retention',
  category: 'Customers',
  description: 'Of customers who first ordered in a given month, what share came back within 30/60/90 days.',
  icon: LineChart,
  CardComponent: Card,
  DetailComponent: Detail,
};
