import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Printer } from "lucide-react";
import type { StoreDTO } from "@zetsales/shared";
import { listStores, listWarehouses, type WarehouseDTO } from "../../lib/commerceApi";
import { AnalyticsFilterBar } from "../../components/analytics/AnalyticsFilterBar";
import { RankedTable } from "../../components/analytics/charts/RankedTable";
import { ReportPrintView } from "../../components/analytics/ReportPrintView";
import { REPORTS_LIST, fetchReportTable, type ReportKey, type ReportTable } from "../../analytics/reportsRegistry";
import { toAnalyticsQuery } from "../../analytics/query";
import { downloadCsv } from "../../lib/csvExport";
import { formatRangeLabel, type CustomDateRange, type DateRangeKey } from "../../components/orders/dateRange";

export function ReportDetailPage() {
  const { reportKey } = useParams<{ reportKey: string }>();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRangeKey>("last30");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [storeId, setStoreId] = useState("all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [table, setTable] = useState<ReportTable | null>(null);
  const [printOpen, setPrintOpen] = useState(false);

  const entry = REPORTS_LIST.find((r) => r.key === reportKey);

  useEffect(() => {
    void listStores().then(setStores);
    void listWarehouses().then((res) => setWarehouses(res.warehouses));
  }, []);

  const query = useMemo(
    () => toAnalyticsQuery(dateRange, customRange, storeId),
    [dateRange, customRange, storeId],
  );

  useEffect(() => {
    if (!entry) return;
    setTable(null);
    void fetchReportTable(entry.key as ReportKey, entry.needsWarehouseFilter ? { ...query, warehouseId } : query).then(setTable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.key, query.range, query.from, query.to, query.storeId, warehouseId]);

  if (!entry) {
    return (
      <div className="zs-page flex items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-slate-600">This report doesn't exist.</p>
        <button onClick={() => navigate("/analytics/reports")} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          Back to reports
        </button>
      </div>
    );
  }

  const periodLabel = formatRangeLabel(dateRange, customRange);

  // Rows carry a stable synthetic key since ReportTable rows are plain flat objects with no
  // guaranteed-unique field of their own to key React's list reconciliation on.
  const keyedRows = (table?.rows ?? []).map((row, i) => ({ ...row, __key: String(i) }));

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header">
        <button onClick={() => navigate("/analytics/reports")} className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700">
          <ArrowLeft size={13} /> All reports
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="zs-page-title">{entry.label}</h1>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-500">{entry.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => table && downloadCsv(`${entry.label.replace(/\s+/g, "_")}.csv`, table.columns, table.rows)}
              disabled={!table || table.rows.length === 0}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download size={14} /> Excel Download
            </button>
            <button
              onClick={() => setPrintOpen(true)}
              disabled={!table}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Printer size={14} /> PDF Download
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <AnalyticsFilterBar
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            storeId={storeId}
            onStoreIdChange={setStoreId}
            stores={stores}
          />
          {entry.needsWarehouseFilter && (
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
            >
              <option value="all">All Warehouse</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="zs-page-body">
        {!table ? (
          <div className="h-64 animate-pulse rounded-xl bg-slate-50" />
        ) : (
          <RankedTable
            keyField={(r) => String(r.__key)}
            rows={keyedRows}
            emptyLabel="No data for this period"
            columns={table.columns.map((col) => ({
              key: col.key,
              header: col.header,
              align: col.align,
              render: (row: Record<string, string | number>) => {
                const raw = row[col.key] ?? "";
                return col.format ? col.format(raw) : raw;
              },
            }))}
          />
        )}
      </div>

      {printOpen && table && (
        <ReportPrintView title={entry.label} periodLabel={periodLabel} table={table} onClose={() => setPrintOpen(false)} />
      )}
    </div>
  );
}
