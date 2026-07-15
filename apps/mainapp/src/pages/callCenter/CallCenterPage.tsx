import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { CallCenterOverviewDTO, StoreDTO } from "@zetsales/shared";
import { getCallCenterOverview } from "../../lib/callCenterApi";
import { listStores } from "../../lib/commerceApi";
import { useToast } from "../../components/ui/ToastProvider";
import { AnalyticsFilterBar } from "../../components/analytics/AnalyticsFilterBar";
import {
  getRangeBounds,
  type CustomDateRange,
  type DateRangeKey,
} from "../../components/orders/dateRange";
import { KpiStrip } from "./components/KpiStrip";
import { AgentRoster } from "./components/AgentRoster";
import { CallQueue } from "./components/CallQueue";
import { HourlyVolumeChart } from "./components/HourlyVolumeChart";
import { Leaderboard } from "./components/Leaderboard";

const POLL_INTERVAL_MS = 10_000;

export function CallCenterPage() {
  const toast = useToast();
  const [data, setData] = useState<CallCenterOverviewDTO | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeKey>("today");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [storeId, setStoreId] = useState("all");
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const firstLoad = useRef(true);

  const query = useMemo(() => {
    const bounds =
      dateRange === "all"
        ? { from: "2015-01-01T00:00:00.000Z", to: new Date().toISOString() }
        : getRangeBounds(dateRange, customRange);
    return {
      range: dateRange === "all" ? "custom" : dateRange,
      from: bounds.from,
      to: bounds.to,
      storeId: storeId !== "all" ? storeId : undefined,
    };
  }, [customRange, dateRange, storeId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await getCallCenterOverview(query);
      setData(overview);
      setLastUpdated(new Date());
    } catch {
      if (firstLoad.current)
        toast.push("Could not load Call Center data.", "info");
    } finally {
      firstLoad.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.range, query.from, query.to, query.storeId]);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    void listStores()
      .then(setStores)
      .catch(() => setStores([]));
  }, []);

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="zs-page-title">Call Center</h1>
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                Live
              </span>
            </div>
            <p className="zs-page-description">
              Real-time view of your confirmation team — who's on a call, who's
              resting, and how today's calls are going.
            </p>
          </div>
          {lastUpdated && (
            <p className="text-xs text-slate-400">
              Updated {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <AnalyticsFilterBar
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
              storeId={storeId}
              onStoreIdChange={setStoreId}
              stores={stores}
              extra={
                <button
                  onClick={() => void load()}
                  disabled={loading}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw
                    size={14}
                    className={loading ? "animate-spin" : undefined}
                  />{" "}
                  Refresh
                </button>
              }
            />
          </div>
          <div className="zs-toolbox-right">
            <p className="text-xs text-slate-400">
              Agent activity follows the selected date range; queue stays live
              for the selected store.
            </p>
          </div>
        </div>
      </div>

      <div className="zs-page-body space-y-5">
        <KpiStrip kpis={data?.kpis ?? null} />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <AgentRoster agents={data?.agents ?? []} nowMs={nowMs} />
          </div>
          <div className="xl:col-span-2">
            <CallQueue queue={data?.queue ?? []} />
          </div>
        </div>

        <HourlyVolumeChart data={data?.hourlyVolume ?? []} />

        <Leaderboard leaderboard={data?.leaderboard ?? []} />
      </div>
    </div>
  );
}
