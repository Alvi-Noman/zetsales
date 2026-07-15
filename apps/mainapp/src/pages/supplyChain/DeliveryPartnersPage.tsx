import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Clock,
  Copy,
  Navigation,
  Package,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  Store as StoreIcon,
  Truck,
  X,
} from "lucide-react";
import clsx from "clsx";
import type {
  CourierAccountDTO,
  CourierPartner,
  CourierShipmentStatsDTO,
  CourierStatusBucket,
  OrderDTO,
  StoreDTO,
} from "@zetsales/shared";
import {
  COURIER_STATUS_BUCKET_LABEL,
  bucketForCourierStatus,
} from "@zetsales/shared";
import {
  getCourierShipmentStats,
  listCouriers,
  listOrders,
  listStores,
} from "../../lib/commerceApi";
import { OrderDetailDrawer } from "../../components/orders/OrderDetailDrawer";
import { CourierLabelModal } from "../../components/orders/CourierLabelModal";
import { Pagination } from "../../components/orders/Pagination";
import { FilterMenu } from "../../components/orders/FilterMenu";
import { DateRangeMenu } from "../../components/orders/DateRangeMenu";
import {
  getRangeBounds,
  type CustomDateRange,
  type DateRangeKey,
} from "../../components/orders/dateRange";
import {
  relativeTime,
  formatAbsoluteDateTime,
} from "../../components/orders/time";
import { PAYMENT_TONE } from "../../components/orders/orderTone";
import { useToast } from "../../components/ui/ToastProvider";
import { MetricCard } from "../inventory/InventoryPage";
import {
  COURIER_BUCKET_TONE,
  COURIER_PARTNER_META,
} from "./deliveryPartnerTone";

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-10 animate-pulse rounded-lg bg-slate-100"
          style={{ animationDelay: `${i * 40}ms` }}
        />
      ))}
    </div>
  );
}

type ProviderFilter = "all" | CourierPartner;

const PROVIDER_OPTIONS: { value: CourierPartner; label: string }[] = [
  { value: "Steadfast", label: "Steadfast" },
  { value: "Pathao", label: "Pathao" },
];

interface TileGroup {
  key: string;
  label: string;
  icon: typeof Clock;
  tone: "slate" | "emerald" | "amber" | "indigo" | "rose";
  buckets: CourierStatusBucket[];
}

const TILE_GROUPS: TileGroup[] = [
  {
    key: "awaiting",
    label: "Awaiting sync",
    icon: Clock,
    tone: "slate",
    buckets: ["awaiting_sync"],
  },
  {
    key: "transit",
    label: "In transit",
    icon: Navigation,
    tone: "indigo",
    buckets: ["accepted", "picked", "in_transit"],
  },
  {
    key: "delivered",
    label: "Delivered",
    icon: PackageCheck,
    tone: "emerald",
    buckets: ["delivered", "partial"],
  },
  {
    key: "attention",
    label: "Needs attention",
    icon: AlertTriangle,
    tone: "rose",
    buckets: ["returned", "cancelled", "hold"],
  },
];

// V1 is webhook-only — status only changes when steadfastWebhook/pathaoWebhook fire, so this board
// shows "current status as of the last webhook," not a live tracking feed. No polling here yet.
export function DeliveryPartnersPage() {
  const toast = useToast();
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [couriers, setCouriers] = useState<CourierAccountDTO[]>([]);
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [tileFilter, setTileFilter] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [shipments, setShipments] = useState<OrderDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [stats, setStats] = useState<CourierShipmentStatsDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOrder, setActiveOrder] = useState<OrderDTO | null>(null);
  const [labelModalOrder, setLabelModalOrder] = useState<OrderDTO | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    listStores()
      .then(setStores)
      .catch(() => toast.push("Could not load stores.", "info"));
    listCouriers()
      .then(({ couriers: list }) => setCouriers(list))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeById = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores],
  );

  const activeTileBuckets = useMemo(
    () => TILE_GROUPS.find((t) => t.key === tileFilter)?.buckets,
    [tileFilter],
  );
  const { from: dateFrom, to: dateTo } = useMemo(
    () => getRangeBounds(dateRange, customRange),
    [dateRange, customRange],
  );

  const loadShipments = async () => {
    setLoading(true);
    try {
      const res = await listOrders({
        hasCourierPartner: true,
        storeId: storeFilter !== "all" ? storeFilter : undefined,
        courierPartner: providerFilter !== "all" ? providerFilter : undefined,
        courierStatusBucket: activeTileBuckets?.join(","),
        search: search || undefined,
        dateFrom: dateFrom ?? undefined,
        dateTo: dateTo ?? undefined,
        sortKey: "date",
        sortDir: "desc",
        page,
        pageSize,
      });
      setShipments(res.orders);
      setTotal(res.total);
    } catch {
      toast.push("Could not load shipments.", "info");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await getCourierShipmentStats({
        storeId: storeFilter !== "all" ? storeFilter : undefined,
        courierPartner: providerFilter !== "all" ? providerFilter : undefined,
        dateFrom: dateFrom ?? undefined,
        dateTo: dateTo ?? undefined,
      });
      setStats(res);
    } catch {
      // Tiles just stay at their last known values — not worth a toast for a secondary summary row.
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    providerFilter,
    storeFilter,
    tileFilter,
    search,
    dateFrom,
    dateTo,
    page,
    pageSize,
  ]);

  useEffect(() => {
    loadStats();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerFilter, storeFilter, dateFrom, dateTo]);

  const refreshAll = () => {
    loadShipments();
    loadStats();
  };

  const noFiltersActive =
    providerFilter === "all" &&
    storeFilter === "all" &&
    dateRange === "all" &&
    !tileFilter &&
    !search;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const copyText = (id: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header flex flex-wrap items-center justify-between gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="zs-page-title">Delivery Partners</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums">
              {(stats?.total ?? total).toLocaleString()}
            </span>
          </div>
          <p className="zs-page-description">
            Current shipment status across every courier, synced from Steadfast
            and Pathao webhooks.
          </p>
        </div>
        <button
          onClick={refreshAll}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="px-4 py-4 lg:px-8">
        <div className="zs-summary-strip">
          <MetricCard
            icon={Package}
            label="Total shipments"
            value={(stats?.total ?? 0).toLocaleString()}
            detail="dispatched to a courier"
          />
          {TILE_GROUPS.map((tile) => {
            const count = tile.buckets.reduce(
              (sum, b) => sum + (stats?.bucketCounts[b] ?? 0),
              0,
            );
            const active = tileFilter === tile.key;
            return (
              <button
                key={tile.key}
                onClick={() =>
                  setTileFilter((f) => (f === tile.key ? null : tile.key))
                }
                className={clsx(
                  "min-w-[180px] flex-1 text-left",
                  active && "ring-2 ring-inset ring-indigo-500",
                )}
              >
                <MetricCard
                  icon={tile.icon}
                  label={tile.label}
                  value={count.toLocaleString()}
                  detail="shipments"
                  tone={tile.tone}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <DateRangeMenu
              value={dateRange}
              onChange={setDateRange}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
            />
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
            <FilterMenu
              icon={Truck}
              allLabel="All couriers"
              value={providerFilter}
              options={PROVIDER_OPTIONS}
              onChange={(v) => setProviderFilter(v as ProviderFilter)}
            />
            {!noFiltersActive && (
              <button
                onClick={() => {
                  setProviderFilter("all");
                  setStoreFilter("all");
                  setDateRange("all");
                  setCustomRange(null);
                  setTileFilter(null);
                  setSearchInput("");
                }}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
          <div className="zs-toolbox-right">
            <div className="zs-search">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search order #, customer, phone"
                className="zs-search-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex-1 px-4 pb-6 lg:px-8">
        <div className="zs-table-wrap">
          {loading ? (
            <TableSkeleton />
          ) : shipments.length === 0 ? (
            <div className="zs-empty-state">
              <Truck size={28} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {noFiltersActive
                  ? "No shipments yet"
                  : "No shipments match this filter"}
              </p>
              <p className="max-w-sm text-sm text-slate-400">
                {noFiltersActive
                  ? "Orders dispatched via a connected Steadfast or Pathao account will show up here."
                  : "Try a different courier or status tile."}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="zs-table-head uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5">Order</th>
                  <th className="px-4 py-2.5">Courier</th>
                  <th className="px-4 py-2.5">Consignment ID</th>
                  <th className="px-4 py-2.5">Tracking code</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">COD / Total</th>
                  <th className="px-4 py-2.5">Last synced</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="zs-table-body">
                {shipments.map((order) => {
                  const bucket = bucketForCourierStatus(
                    order.courierPartner,
                    order.courierStatus,
                  );
                  const partnerMeta = order.courierPartner
                    ? COURIER_PARTNER_META[order.courierPartner]
                    : null;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => setActiveOrder(order)}
                      className="zs-data-row cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {order.number}
                        </div>
                        <div className="text-xs text-slate-400">
                          {order.customerName ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {partnerMeta ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                            <span
                              className={clsx(
                                "h-2 w-2 rounded-full",
                                partnerMeta.color,
                              )}
                            />
                            {partnerMeta.label}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {order.courierConsignmentId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyText(
                                `c-${order.id}`,
                                order.courierConsignmentId!,
                              );
                            }}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            {order.courierConsignmentId}
                            <Copy
                              size={11}
                              className={
                                copiedId === `c-${order.id}`
                                  ? "text-emerald-500"
                                  : "text-slate-300"
                              }
                            />
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {order.courierTrackingId ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyText(
                                `t-${order.id}`,
                                order.courierTrackingId!,
                              );
                            }}
                            className="inline-flex items-center gap-1 hover:text-slate-900"
                          >
                            {order.courierTrackingId}
                            <Copy
                              size={11}
                              className={
                                copiedId === `t-${order.id}`
                                  ? "text-emerald-500"
                                  : "text-slate-300"
                              }
                            />
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                            COURIER_BUCKET_TONE[bucket],
                          )}
                        >
                          {order.courierStatus ??
                            COURIER_STATUS_BUCKET_LABEL[bucket]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {money(order.total)}
                        </div>
                        <span
                          className={clsx(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            PAYMENT_TONE[order.paymentStatus],
                          )}
                        >
                          {order.paymentStatus}
                        </span>
                      </td>
                      <td
                        className="px-4 py-3 text-slate-500"
                        title={
                          order.courierSyncedAt
                            ? formatAbsoluteDateTime(order.courierSyncedAt)
                            : undefined
                        }
                      >
                        {order.courierSyncedAt
                          ? relativeTime(order.courierSyncedAt)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setLabelModalOrder(order);
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Print courier label"
                        >
                          <Printer size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && shipments.length > 0 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              rangeStart={(page - 1) * pageSize + 1}
              rangeEnd={Math.min(page * pageSize, total)}
              pageSize={pageSize}
              loading={loading}
              onGoToPage={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </div>
      </div>

      <OrderDetailDrawer
        order={activeOrder}
        store={
          activeOrder ? (storeById.get(activeOrder.storeId) ?? null) : null
        }
        couriers={couriers}
        onClose={() => setActiveOrder(null)}
        onUpdated={refreshAll}
      />

      <CourierLabelModal
        open={!!labelModalOrder}
        onClose={() => setLabelModalOrder(null)}
        orders={labelModalOrder ? [labelModalOrder] : []}
      />
    </div>
  );
}
