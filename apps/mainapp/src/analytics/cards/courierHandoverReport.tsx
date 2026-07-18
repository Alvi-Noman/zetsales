import { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import type { CourierHandoverReportDTO } from '@zetsales/shared';
import { getCourierHandoverReport } from '../../lib/analyticsApi';
import { AnalyticsCardShell } from '../../components/analytics/AnalyticsCard';
import { RankedTable } from '../../components/analytics/charts/RankedTable';
import { formatMoney, formatCount } from '../format';
import type { AnalyticsCardComponentProps, AnalyticsCardDefinition } from '../types';

function useData(query: AnalyticsCardComponentProps['query']) {
  const [data, setData] = useState<CourierHandoverReportDTO | null>(null);
  useEffect(() => {
    setData(null);
    void getCourierHandoverReport(query).then(setData);
  }, [query.range, query.from, query.to, query.storeId, query.comparisonMode, query.comparisonFrom, query.comparisonTo]);
  return data;
}

function Card({ query }: AnalyticsCardComponentProps) {
  const data = useData(query);
  return (
    <AnalyticsCardShell title="Courier handover report" cardKey="courierHandoverReport" loading={!data} headlineValue={data ? formatCount(data.totalManifests) : undefined}>
      {data && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-500">Parcels handed over</span>
            <span className="font-semibold tabular-nums text-slate-700">{formatCount(data.totalParcels)}</span>
          </div>
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-500">COD in transit</span>
            <span className="font-semibold tabular-nums text-slate-700">{formatMoney(data.totalCodAmount)}</span>
          </div>
          <div className="flex items-center justify-between text-[11.5px]">
            <span className="text-slate-500">Awaiting courier confirmation</span>
            <span className={data.pendingManifests > 0 ? 'font-semibold tabular-nums text-amber-600' : 'font-semibold tabular-nums text-slate-700'}>
              {formatCount(data.pendingManifests)}
            </span>
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
        Manifest activity within the selected date range, scoped by handover date (when parcels were physically bagged up for the courier) — not order date. "Awaiting confirmation" below
        counts every currently-Pending manifest regardless of when it was created, since a batch created weeks ago and still unconfirmed is exactly what needs surfacing.
      </p>
      <RankedTable
        keyField={(r) => r.provider}
        rows={data.rows}
        emptyLabel="No handovers recorded in this period"
        columns={[
          { key: 'name', header: 'Courier', render: (r) => <span className="font-medium text-slate-700">{r.displayName}</span> },
          { key: 'manifests', header: 'Manifests', align: 'right', render: (r) => formatCount(r.manifestCount) },
          { key: 'parcels', header: 'Parcels', align: 'right', render: (r) => formatCount(r.parcelCount) },
          { key: 'items', header: 'Items', align: 'right', render: (r) => formatCount(r.itemCount) },
          { key: 'cod', header: 'Total COD', align: 'right', render: (r) => formatMoney(r.totalCodAmount) },
          { key: 'confirmed', header: 'Confirmed', align: 'right', render: (r) => formatCount(r.confirmedCount) },
          { key: 'pending', header: 'Pending', align: 'right', render: (r) => formatCount(r.pendingCount) },
          { key: 'avgConfirm', header: 'Avg. hrs to confirm', align: 'right', render: (r) => (r.avgConfirmHours != null ? `${r.avgConfirmHours}h` : '—') },
        ]}
      />
      <div>
        <p className="mb-3 text-sm font-semibold text-slate-700">Manifests still awaiting confirmation</p>
        <p className="mb-3 text-xs text-slate-400">Right now, not scoped to the date filter above — how long each currently-Pending batch has been waiting on the courier.</p>
        <RankedTable
          keyField={(r) => r.label}
          rows={data.aging}
          emptyLabel="Nothing pending — every manifest has been confirmed"
          columns={[
            { key: 'label', header: 'Age', render: (r) => <span className="font-medium text-slate-700">{r.label}</span> },
            { key: 'count', header: 'Manifests', align: 'right', render: (r) => formatCount(r.count) },
            { key: 'value', header: 'COD value', align: 'right', render: (r) => formatMoney(r.value) },
          ]}
        />
      </div>
    </div>
  );
}

export const courierHandoverReportCard: AnalyticsCardDefinition = {
  key: 'courierHandoverReport',
  title: 'Courier handover report',
  category: 'Delivery',
  description: 'Pickup manifest volume per courier — parcels, COD value, and how long batches sit before the courier confirms them.',
  icon: ClipboardList,
  CardComponent: Card,
  DetailComponent: Detail,
};
