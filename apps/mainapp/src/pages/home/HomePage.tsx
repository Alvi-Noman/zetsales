import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  PackageCheck,
  PauseCircle,
  Plug,
  Plus,
  ShoppingBag,
  Store as StoreIcon,
  Truck,
  Wallet,
  XCircle,
} from "lucide-react";
import clsx from "clsx";
import type {
  OrderDTO,
  OrderStatsDTO,
  OrderTabKey,
  OrderTrendsDTO,
  ProductRankingRowDTO,
  StoreDTO,
} from "@zetsales/shared";
import {
  getOrderStats,
  getOrderTrends,
  listOrders,
  listProducts,
  listStores,
} from "../../lib/commerceApi";
import { getTopProducts } from "../../lib/analyticsApi";
import { useAuth } from "../../context/AuthContext";
import { HomeKpiCard } from "../../components/home/HomeKpiCard";
import { ChannelOverviewCard } from "../../components/home/ChannelOverviewCard";
import { InitialStoreEmptyState } from "../../components/home/InitialStoreEmptyState";
import { TopProductsCard } from "../../components/home/TopProductsCard";
import { AppBlock } from "../../components/apps/AppBlock";
import { STAGE_TONE, STAGE_LABEL } from "../../components/orders/orderTone";
import { DateRangeMenu } from "../../components/orders/DateRangeMenu";
import { FilterMenu } from "../../components/orders/FilterMenu";
import {
  getRangeBounds,
  type CustomDateRange,
  type DateRangeKey,
} from "../../components/orders/dateRange";

const PIPELINE_STAGES: {
  tab: Exclude<OrderTabKey, "all">;
  label: string;
  icon: typeof Clock;
  tone: string;
}[] = [
  { tab: "pending", label: "Pending", icon: Clock, tone: STAGE_TONE.Pending },
  {
    tab: "confirmed",
    label: "Confirmed",
    icon: CheckCircle2,
    tone: STAGE_TONE.Confirmed,
  },
  {
    tab: "processing",
    label: "Packing",
    icon: Package,
    tone: STAGE_TONE.Processing,
  },
  {
    tab: "courierBooked",
    label: "Ready for pickup",
    icon: Truck,
    tone: STAGE_TONE["Ready for Pickup"],
  },
  {
    tab: "delivered",
    label: "Delivered",
    icon: PackageCheck,
    tone: STAGE_TONE.Delivered,
  },
  {
    tab: "codDue",
    label: "COD Due",
    icon: Wallet,
    tone: "bg-amber-50 text-amber-700 ring-amber-600/20",
  },
  {
    tab: "hold",
    label: "On Hold",
    icon: PauseCircle,
    tone: STAGE_TONE["On Hold"],
  },
  {
    tab: "cancelled",
    label: "Cancelled",
    icon: Ban,
    tone: STAGE_TONE.Cancelled,
  },
];

const formatCount = (v: number) => v.toLocaleString();
const formatMoney = (v: number) =>
  `৳${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "None";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<OrderStatsDTO | null>(null);
  const [trends, setTrends] = useState<OrderTrendsDTO | null>(null);
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [productTotal, setProductTotal] = useState<number | null>(null);
  const [attentionOrders, setAttentionOrders] = useState<OrderDTO[] | null>(
    null,
  );
  const [topProducts, setTopProducts] = useState<ProductRankingRowDTO[] | null>(
    null,
  );
  const [dateRange, setDateRange] = useState<DateRangeKey>("today");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  // "Pending Orders" is deliberately not scoped by the date filter above — a pending order was
  // created on some date but stays pending indefinitely until it's resolved, so filtering it by
  // "today"/"yesterday"/a range would just hide the ones that still need a call, which defeats the
  // point of the card. It only tracks the channel filter, fetched on its own so switching the date
  // range never touches it.
  const [allTimePendingCount, setAllTimePendingCount] = useState<number | null>(
    null,
  );

  // Stores/catalog aren't scoped by the date/channel filters below — a store either exists or it
  // doesn't, and the catalog count isn't an order-derived metric — so they only ever need to load
  // once.
  useEffect(() => {
    void (async () => {
      try {
        setStores(await listStores());
      } finally {
        setStoresLoading(false);
      }
    })();
    void (async () => {
      try {
        const res = await listProducts({ pageSize: 1 });
        setProductTotal(res.total);
      } catch {
        // Catalog tile just stays blank on failure.
      }
    })();
  }, []);

  useEffect(() => {
    const { from, to } = getRangeBounds(dateRange, customRange);
    const storeId = storeFilter !== "all" ? storeFilter : undefined;
    void (async () => {
      try {
        setStats(
          await getOrderStats({
            storeId,
            dateFrom: from ?? undefined,
            dateTo: to ?? undefined,
          }),
        );
      } catch {
        // KPI cards degrade to skeletons; the rest of the dashboard still loads.
      }
    })();
    void (async () => {
      try {
        setTrends(await getOrderTrends({ range: "last30", storeId }));
      } catch {
        // Sparklines are a secondary visual; KPI totals still work without them.
      }
    })();
    void (async () => {
      try {
        const res = await listOrders({
          storeId,
          tab: "pending",
          sortKey: "updated",
          sortDir: "desc",
          pageSize: 5,
          dateFrom: from ?? undefined,
          dateTo: to ?? undefined,
        });
        setAttentionOrders(res.orders);
      } catch {
        setAttentionOrders([]);
      }
    })();
    void (async () => {
      setTopProducts(null);
      try {
        // Passed as an explicit "custom" window (not e.g. range: "today") because the analytics
        // backend otherwise resolves "today" against the server's own clock — which disagrees
        // with the tenant's local day whenever they're offset from server time (Dhaka is UTC+6),
        // silently zeroing out results that a moment ago showed up fine in the KPI cards above.
        const ranking = await getTopProducts({
          range: "custom",
          from: from ?? undefined,
          to: to ?? undefined,
          storeId,
          limit: 6,
        });
        setTopProducts(ranking.rows);
      } catch {
        setTopProducts([]);
      }
    })();
  }, [dateRange, customRange, storeFilter]);

  useEffect(() => {
    const storeId = storeFilter !== "all" ? storeFilter : undefined;
    void (async () => {
      try {
        const res = await getOrderStats({ storeId });
        setAllTimePendingCount(res.tabCounts.pending);
      } catch {
        // Card just shows a skeleton dash on failure.
      }
    })();
  }, [storeFilter]);

  const rtoRate = useMemo(
    () =>
      stats && stats.totalOrders > 0
        ? Math.round((stats.rtoOrders / stats.totalOrders) * 100)
        : 0,
    [stats],
  );
  const businessLabel = user?.businessName?.trim() || "there";
  const connectedCount = stores.filter((s) => s.status === "connected").length;
  const showNoStoreEmptyState = !storesLoading && connectedCount === 0;

  const header = (
    <div className="zs-page-header">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="zs-page-title">
            {greeting()}, {businessLabel}
          </h1>
          <p className="zs-page-description">
            {new Date().toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            &middot; here's how your stores are doing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              navigate(
                showNoStoreEmptyState
                  ? "/integrations?connect=shopify"
                  : "/integrations",
              )
            }
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plug size={14} /> Connect a store
          </button>
          {!showNoStoreEmptyState && (
            <button
              onClick={() => navigate("/products/new")}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Plus size={14} /> Add product
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (showNoStoreEmptyState) {
    return (
      <div className="zs-page-scroll">
        <div className="zs-page-body">
          <InitialStoreEmptyState
            businessName={businessLabel}
            hasStoreRecords={stores.length > 0}
            onConnectShopify={() => navigate("/integrations?connect=shopify")}
            onConnectWooCommerce={() =>
              navigate("/integrations?connect=woocommerce")
            }
            onOpenIntegrations={() => navigate("/integrations")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="zs-page-scroll">
      {header}

      <div className="zs-page-body space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeMenu
            value={dateRange}
            onChange={setDateRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
          />
          {stores.length > 1 && (
            <FilterMenu
              icon={StoreIcon}
              allLabel="All Channels"
              value={storeFilter}
              options={stores.map((s) => ({
                value: s.id,
                label: s.displayName,
              }))}
              onChange={setStoreFilter}
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <HomeKpiCard
            icon={Wallet}
            tone="indigo"
            label="Total Revenue"
            value={stats ? formatMoney(stats.totalRevenue) : "-"}
            metricKey="totalRevenue"
            trends={trends}
            formatValue={formatMoney}
            onClick={() => navigate("/orders")}
          />
          <HomeKpiCard
            icon={ShoppingBag}
            tone="violet"
            label="Total Orders"
            value={stats ? formatCount(stats.totalOrders) : "-"}
            metricKey="totalOrders"
            trends={trends}
            formatValue={formatCount}
            onClick={() => navigate("/orders")}
          />
          <HomeKpiCard
            icon={PackageCheck}
            tone="emerald"
            label="Delivered"
            value={stats ? formatCount(stats.tabCounts.delivered) : "-"}
            metricKey="delivered"
            trends={trends}
            formatValue={formatCount}
            onClick={() => navigate("/orders")}
          />
          <HomeKpiCard
            icon={Ban}
            tone="rose"
            label="Cancelled"
            value={stats ? formatCount(stats.cancelledOrders) : "-"}
            metricKey="cancelled"
            trends={trends}
            formatValue={formatCount}
            onClick={() => navigate("/orders")}
          />
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Order status
          </h2>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <HomeKpiCard
              icon={Clock}
              tone="amber"
              label="Pending Orders"
              value={
                allTimePendingCount != null
                  ? formatCount(allTimePendingCount)
                  : "-"
              }
              metricKey="pending"
              trends={trends}
              formatValue={formatCount}
              onClick={() => navigate("/orders")}
            />
            <HomeKpiCard
              icon={CheckCircle2}
              tone="sky"
              label="Confirmed Orders"
              value={stats ? formatCount(stats.tabCounts.confirmed) : "-"}
              metricKey="confirmed"
              trends={trends}
              formatValue={formatCount}
              onClick={() => navigate("/orders")}
            />
            <HomeKpiCard
              icon={Wallet}
              tone="emerald"
              label="Confirmed Amount"
              value={stats ? formatMoney(stats.confirmedAmount) : "-"}
              metricKey="confirmedAmount"
              trends={trends}
              formatValue={formatMoney}
              onClick={() => navigate("/orders")}
            />
            <HomeKpiCard
              icon={XCircle}
              tone="rose"
              label="Cancelled Amount"
              value={stats ? formatMoney(stats.cancelledAmount) : "-"}
              metricKey="cancelledAmount"
              trends={trends}
              formatValue={formatMoney}
              onClick={() => navigate("/orders")}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="zs-surface p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              COD Outstanding
            </p>
            <p className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">
              {stats ? formatMoney(stats.codOutstanding) : "-"}
            </p>
          </div>
          <div className="zs-surface p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              RTO Rate
            </p>
            <p className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">
              {stats ? `${rtoRate}%` : "-"}
            </p>
          </div>
          <div className="zs-surface p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              Oldest Pending
            </p>
            <p className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">
              {stats ? formatMinutes(stats.oldestPendingMinutes) : "-"}
            </p>
          </div>
          <div className="zs-surface p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
              Catalog
            </p>
            <p className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">
              {productTotal != null ? productTotal.toLocaleString() : "-"}
            </p>
          </div>
        </div>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              Order pipeline
            </h2>
            <button
              onClick={() => navigate("/orders")}
              className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600"
            >
              View all orders <ArrowRight size={12} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-8">
            {PIPELINE_STAGES.map(({ tab, label, icon: Icon, tone }) => (
              <div key={tab} className="zs-surface p-3.5">
                <span
                  className={clsx(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset",
                    tone,
                  )}
                >
                  <Icon size={15} />
                </span>
                <p className="mt-2 text-lg font-bold tabular-nums text-slate-900">
                  {stats ? stats.tabCounts[tab].toLocaleString() : "-"}
                </p>
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <TopProductsCard
          rows={topProducts}
          formatMoney={formatMoney}
          formatCount={formatCount}
          onViewAll={() => navigate("/analytics/topProducts")}
        />

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
          <section className="xl:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Needs attention
              </h2>
              <button
                onClick={() => navigate("/orders")}
                className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600"
              >
                View all <ArrowRight size={12} />
              </button>
            </div>
            {attentionOrders === null ? (
              <div className="zs-loading-state zs-surface h-40">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : attentionOrders.length === 0 ? (
              <div className="zs-dashed-surface flex flex-col items-center justify-center gap-1.5 py-10 text-center">
                <CheckCircle2 size={22} className="text-emerald-400" />
                <p className="text-sm font-medium text-slate-600">
                  No pending orders right now
                </p>
              </div>
            ) : (
              <div className="zs-table-wrap zs-table-body">
                {attentionOrders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => navigate("/orders")}
                    className="zs-data-row flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {order.customerName || "Unnamed customer"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {order.number} &middot;{" "}
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-slate-800">
                        {order.currency === "BDT" ? "৳" : order.currency + " "}
                        {order.total.toLocaleString()}
                      </span>
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                          STAGE_TONE[order.stage],
                        )}
                      >
                        {STAGE_LABEL[order.stage]}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="xl:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Connected channels{" "}
                {stores.length > 0 && (
                  <span className="text-slate-400">
                    ({connectedCount}/{stores.length})
                  </span>
                )}
              </h2>
              <button
                onClick={() => navigate("/integrations")}
                className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600"
              >
                Manage <ArrowRight size={12} />
              </button>
            </div>
            {storesLoading ? (
              <div className="zs-loading-state zs-surface h-40">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : stores.length === 0 ? (
              <div className="zs-dashed-surface flex flex-col items-center justify-center gap-2 py-10 text-center">
                <StoreIcon size={22} className="text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  No stores connected yet
                </p>
                <button
                  onClick={() => navigate("/integrations")}
                  className="mt-1 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Connect your first store
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {stores.map((store) => (
                  <ChannelOverviewCard key={store.id} store={store} />
                ))}
              </div>
            )}
          </section>
        </div>

        <AppBlock target="admin.home.block" />
      </div>
    </div>
  );
}
