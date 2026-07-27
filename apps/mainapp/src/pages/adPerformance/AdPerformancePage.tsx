import { useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Package,
  Plus,
  Radio,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import clsx from "clsx";
import type {
  AdChannel,
  AdCostEntryDTO,
  AdPerformanceReportDTO,
  StoreDTO,
} from "@zetsales/shared";
import {
  deleteAdCost,
  getAdPerformance,
  listAdCosts,
  listStores,
} from "../../lib/commerceApi";
import { AnalyticsFilterBar } from "../../components/analytics/AnalyticsFilterBar";
import { FilterMenu } from "../../components/orders/FilterMenu";
import {
  getRangeBounds,
  type CustomDateRange,
  type DateRangeKey,
} from "../../components/orders/dateRange";
import { toAnalyticsQuery } from "../../analytics/query";
import { formatMoney, formatCount } from "../../analytics/format";
import { LogAdCostModal } from "../../components/adPerformance/LogAdCostModal";
import { CampaignWizard } from "../../components/adPerformance/CampaignWizard";
import { CampaignList } from "../../components/adPerformance/CampaignList";
import { useToast } from "../../components/ui/ToastProvider";
import { PageTitle } from "../../components/layout/PageTitle";

type AdPerformanceTab = "performance" | "createCampaign";

const CHANNEL_OPTIONS: { value: AdChannel; label: string }[] = [
  { value: "Meta", label: "Meta" },
  { value: "TikTok", label: "TikTok" },
  { value: "Google", label: "Google" },
  { value: "Other", label: "Other" },
];

function moneyOrDash(value: number | null) {
  return value == null ? "—" : formatMoney(value);
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="zs-surface p-4">
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        <Icon size={12} /> {label}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums text-slate-900">
          {value}
        </span>
        {detail && <span className="text-[11px] text-slate-400">{detail}</span>}
      </div>
    </div>
  );
}

export function AdPerformancePage() {
  const toast = useToast();
  const [dateRange, setDateRange] = useState<DateRangeKey>("last30");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [storeId, setStoreId] = useState("all");
  const [channel, setChannel] = useState("all");
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [report, setReport] = useState<AdPerformanceReportDTO | null>(null);
  const [entries, setEntries] = useState<AdCostEntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [tab, setTab] = useState<AdPerformanceTab>("performance");
  const [campaignRefreshKey, setCampaignRefreshKey] = useState(0);

  useEffect(() => {
    void listStores().then(setStores);
  }, []);

  const query = useMemo(
    () => toAnalyticsQuery(dateRange, customRange, storeId),
    [dateRange, customRange, storeId],
  );
  const rangeBounds = useMemo(
    () => getRangeBounds(dateRange, customRange),
    [dateRange, customRange],
  );

  const load = async () => {
    setLoading(true);
    try {
      const channelParam =
        channel !== "all" ? (channel as AdChannel) : undefined;
      const [reportRes, entriesRes] = await Promise.all([
        getAdPerformance({ ...query, channel: channelParam }),
        listAdCosts({
          channel: channelParam,
          dateFrom: rangeBounds.from ?? undefined,
          dateTo: rangeBounds.to ?? undefined,
        }),
      ]);
      setReport(reportRes.adPerformance);
      setEntries(entriesRes.entries);
    } catch {
      toast.push("Could not load Ad Performance data.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.range, query.from, query.to, query.storeId, channel]);

  const removeEntry = async (id: string) => {
    try {
      const res = await deleteAdCost(id);
      if (!res.success) {
        toast.push(res.message || "Could not remove this entry.", "info");
        return;
      }
      toast.push("Ad cost entry removed.", "success");
      void load();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not remove this entry.",
        "info",
      );
    }
  };

  const totalRevenue =
    report?.byProduct.reduce((sum, r) => sum + r.revenue, 0) ?? 0;
  const blendedRoas =
    report && report.summary.totalSpend > 0
      ? totalRevenue / report.summary.totalSpend
      : null;

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <PageTitle>Ad Performance</PageTitle>
            <p className="zs-page-description">
              {tab === "performance"
                ? "Real CPA and cost per delivered product — spend you log against confirmed and delivered orders, not raw clicks."
                : "Upload assets once, publish a paused campaign to every connected platform."}
            </p>
          </div>
          {tab === "performance" && (
            <button
              onClick={() => setLogOpen(true)}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus size={14} /> Log ad cost
            </button>
          )}
        </div>
        <div className="mt-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
          {(
            [
              { key: "performance", label: "Performance" },
              { key: "createCampaign", label: "Create Campaign" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                "rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors",
                tab === t.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {tab === "performance" && (
          <div className="mt-4">
            <AnalyticsFilterBar
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
              storeId={storeId}
              onStoreIdChange={setStoreId}
              stores={stores}
              extra={
                <FilterMenu
                  icon={Radio}
                  allLabel="All channels"
                  value={channel}
                  options={CHANNEL_OPTIONS.map((c) => ({
                    value: c.value,
                    label: c.label,
                  }))}
                  onChange={setChannel}
                />
              }
            />
          </div>
        )}
      </div>

      {tab === "performance" ? (
        <div className="zs-page-body space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile
              icon={TrendingUp}
              label="Total ad spend"
              value={report ? formatMoney(report.summary.totalSpend) : "—"}
            />
            <SummaryTile
              icon={Target}
              label="Blended CPA"
              value={report ? moneyOrDash(report.summary.blendedCpa) : "—"}
              detail={
                report
                  ? `${formatCount(report.summary.totalConfirmedOrders)} confirmed`
                  : undefined
              }
            />
            <SummaryTile
              icon={Package}
              label="Cost per delivered"
              value={
                report
                  ? moneyOrDash(report.summary.blendedCostPerDelivered)
                  : "—"
              }
              detail={
                report
                  ? `${formatCount(report.summary.totalDeliveredOrders)} delivered`
                  : undefined
              }
            />
            <SummaryTile
              icon={Megaphone}
              label="ROAS"
              value={blendedRoas != null ? `${blendedRoas.toFixed(2)}x` : "—"}
            />
          </div>

          {report && report.byChannel.length > 0 && (
            <section className="zs-surface p-4">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Spend by channel
              </h2>
              <div className="flex flex-wrap gap-2">
                {report.byChannel.map((c) => (
                  <div
                    key={c.channel}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <span className="font-semibold text-slate-700">
                      {c.channel}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {formatMoney(c.spend)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="zs-table-wrap">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-bold text-slate-900">
                Performance by product
              </h2>
            </div>
            {loading && !report ? (
              <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                Loading...
              </div>
            ) : !report || report.byProduct.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                No ad cost logged for this range yet — log your first entry to
                see real CPA.
              </p>
            ) : (
              <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="zs-table-head uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-2.5">Product</th>
                      <th className="px-4 py-2.5 text-right">Spend</th>
                      <th className="px-4 py-2.5 text-right">Confirmed</th>
                      <th className="px-4 py-2.5 text-right">CPA</th>
                      <th className="px-4 py-2.5 text-right">Delivered</th>
                      <th className="px-4 py-2.5 text-right">Cost/delivered</th>
                      <th className="px-4 py-2.5 text-right">ROAS</th>
                    </tr>
                  </thead>
                  <tbody className="zs-table-body">
                    {report.byProduct.map((row) => (
                      <tr
                        key={row.productId + row.productTitle}
                        className="zs-data-row"
                      >
                        <td className="max-w-[220px] truncate px-4 py-2.5 font-medium text-slate-700">
                          {row.productTitle}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                          {formatMoney(row.spend)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {formatCount(row.confirmedOrders)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                          {moneyOrDash(row.cpa)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {formatCount(row.deliveredOrders)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                          {moneyOrDash(row.costPerDelivered)}
                        </td>
                        <td
                          className={clsx(
                            "px-4 py-2.5 text-right tabular-nums",
                            row.roas != null && row.roas >= 1
                              ? "text-emerald-600"
                              : "text-slate-500",
                          )}
                        >
                          {row.roas != null ? `${row.roas.toFixed(2)}x` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2.5 p-3 lg:hidden">
                {report.byProduct.map((row) => (
                  <div
                    key={row.productId + row.productTitle}
                    className="zs-surface p-3.5"
                  >
                    <p className="truncate font-semibold text-slate-800">
                      {row.productTitle}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-400">Spend</span>
                      <span className="font-medium tabular-nums text-slate-700">
                        {formatMoney(row.spend)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-400">CPA</span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {moneyOrDash(row.cpa)}{" "}
                        <span className="font-normal text-xs text-slate-400">
                          ({formatCount(row.confirmedOrders)} confirmed)
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-400">Cost/delivered</span>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {moneyOrDash(row.costPerDelivered)}{" "}
                        <span className="font-normal text-xs text-slate-400">
                          ({formatCount(row.deliveredOrders)} delivered)
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-sm">
                      <span className="text-slate-400">ROAS</span>
                      <span
                        className={clsx(
                          "font-semibold tabular-nums",
                          row.roas != null && row.roas >= 1
                            ? "text-emerald-600"
                            : "text-slate-500",
                        )}
                      >
                        {row.roas != null ? `${row.roas.toFixed(2)}x` : "—"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              </>
            )}
          </section>

          <section className="zs-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Logged entries
              </h2>
              <span className="text-xs text-slate-400">
                {entries.length} entr{entries.length === 1 ? "y" : "ies"}
              </span>
            </div>
            {entries.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">
                Nothing logged for this range yet.
              </p>
            ) : (
              <div className="zs-table-body">
                {entries.map((e) => (
                  <div
                    key={e.id}
                    className="zs-data-row flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">
                        {e.productTitle}{" "}
                        <span className="font-normal text-slate-400">
                          · {e.channel}
                        </span>
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {new Date(e.date).toLocaleDateString()}
                        {e.note ? ` · ${e.note}` : ""}
                        {e.createdBy ? ` · by ${e.createdBy}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-bold tabular-nums text-slate-800">
                        {formatMoney(e.amount)}
                      </span>
                      <button
                        onClick={() => void removeEntry(e.id)}
                        className="rounded-md p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="flex-1 space-y-6 overflow-y-auto px-8 py-6">
          <CampaignWizard
            onPublished={() => setCampaignRefreshKey((k) => k + 1)}
          />
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-3 text-sm font-bold text-slate-900">
              Your campaigns
            </h2>
            <CampaignList refreshKey={campaignRefreshKey} />
          </div>
        </div>
      )}

      <LogAdCostModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
