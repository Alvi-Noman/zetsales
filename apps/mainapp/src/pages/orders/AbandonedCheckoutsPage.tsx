import { Fragment, useEffect, useMemo, useState } from "react";
import {
  Copy,
  MousePointerClick,
  Package,
  Search,
  ShoppingCart,
  Store as StoreIcon,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { AbandonedCheckoutDTO, StoreDTO } from "@zetsales/shared";
import {
  getAbandonedCheckoutStats,
  listAbandonedCheckouts,
  listStores,
} from "../../lib/commerceApi";
import { ShopifyLogo, WooCommerceLogo } from "../../components/orders/platformLogos";
import { Pagination } from "../../components/orders/Pagination";
import { FilterMenu } from "../../components/orders/FilterMenu";
import { DateRangeMenu } from "../../components/orders/DateRangeMenu";
import { getRangeBounds, type CustomDateRange, type DateRangeKey } from "../../components/orders/dateRange";
import { relativeTime, formatAbsoluteDateTime } from "../../components/orders/time";
import { MetricCard } from "../inventory/InventoryPage";
import { useToast } from "../../components/ui/ToastProvider";

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" style={{ animationDelay: `${i * 40}ms` }} />
      ))}
    </div>
  );
}

type PlatformFilter = "all" | "shopify" | "woocommerce";

const PLATFORM_OPTIONS: { value: PlatformFilter; label: string }[] = [
  { value: "shopify", label: "Shopify" },
  { value: "woocommerce", label: "WooCommerce" },
];

// Woo has no dedicated abandoned-cart event — an order that never got past pending/on-hold/failed/
// cancelled at creation time (see WOO_INCOMPLETE_STATUSES server-side) is the closest signal, so its
// `reason` is the raw Woo status. Shopify checkouts are the real thing and get one shared label.
function reasonLabel(reason: string) {
  if (reason === "checkout_abandoned") return "Abandoned";
  return reason.replace(/[-_]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function AbandonedCheckoutsPage() {
  const toast = useToast();
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeKey>("all");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [checkouts, setCheckouts] = useState<AbandonedCheckoutDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [stats, setStats] = useState<{ totalCount: number; totalValue: number; byPlatform: Record<"shopify" | "woocommerce", number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    listStores()
      .then(setStores)
      .catch(() => toast.push("Could not load stores.", "info"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const { from: dateFrom, to: dateTo } = useMemo(() => getRangeBounds(dateRange, customRange), [dateRange, customRange]);

  const loadCheckouts = async () => {
    setLoading(true);
    try {
      const res = await listAbandonedCheckouts({
        storeId: storeFilter !== "all" ? storeFilter : undefined,
        platform: platformFilter !== "all" ? platformFilter : undefined,
        search: search || undefined,
        dateFrom: dateFrom ?? undefined,
        dateTo: dateTo ?? undefined,
        page,
        pageSize,
      });
      setCheckouts(res.checkouts);
      setTotal(res.total);
    } catch {
      toast.push("Could not load abandoned checkouts.", "info");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await getAbandonedCheckoutStats({ storeId: storeFilter !== "all" ? storeFilter : undefined });
      setStats(res);
    } catch {
      // Stat cards just stay at their last known values — not worth a toast for a secondary row.
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    loadCheckouts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformFilter, storeFilter, search, dateFrom, dateTo, page, pageSize]);

  useEffect(() => {
    loadStats();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformFilter, storeFilter, dateFrom, dateTo]);

  const noFiltersActive = platformFilter === "all" && storeFilter === "all" && dateRange === "all" && !search;
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
            <h1 className="zs-page-title">Abandoned checkouts</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums">
              {(stats?.totalCount ?? total).toLocaleString()}
            </span>
          </div>
          <p className="zs-page-description">
            Carts that never became an order — incomplete WooCommerce orders and abandoned Shopify checkouts.
          </p>
        </div>
      </div>

      <div className="px-4 py-4 lg:px-8">
        <div className="zs-summary-strip">
          <MetricCard icon={ShoppingCart} label="Total abandoned" value={(stats?.totalCount ?? 0).toLocaleString()} detail="never completed" />
          <MetricCard icon={Package} label="Potential value" value={money(stats?.totalValue ?? 0)} detail="in unfinished carts" tone="amber" />
          <MetricCard icon={ShopifyLogo as unknown as typeof Package} label="Shopify" value={(stats?.byPlatform.shopify ?? 0).toLocaleString()} detail="abandoned checkouts" tone="emerald" />
          <MetricCard icon={WooCommerceLogo as unknown as typeof Package} label="WooCommerce" value={(stats?.byPlatform.woocommerce ?? 0).toLocaleString()} detail="incomplete orders" tone="indigo" />
        </div>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <DateRangeMenu value={dateRange} onChange={setDateRange} customRange={customRange} onCustomRangeChange={setCustomRange} />
            <FilterMenu
              icon={StoreIcon}
              allLabel="All Channels"
              value={storeFilter}
              options={stores.map((s) => ({ value: s.id, label: s.displayName }))}
              onChange={setStoreFilter}
            />
            <FilterMenu
              icon={ShoppingCart}
              allLabel="All Platforms"
              value={platformFilter}
              options={PLATFORM_OPTIONS}
              onChange={(v) => setPlatformFilter(v as PlatformFilter)}
            />
            {!noFiltersActive && (
              <button
                onClick={() => {
                  setPlatformFilter("all");
                  setStoreFilter("all");
                  setDateRange("all");
                  setCustomRange(null);
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
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search customer, phone, email"
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
          ) : checkouts.length === 0 ? (
            <div className="zs-empty-state">
              <ShoppingCart size={28} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                {noFiltersActive ? "No abandoned checkouts yet" : "No abandoned checkouts match this filter"}
              </p>
              <p className="max-w-sm text-sm text-slate-400">
                {noFiltersActive
                  ? "Incomplete WooCommerce orders and abandoned Shopify checkouts will show up here as customers leave without finishing checkout."
                  : "Try a different platform or date range."}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="zs-table-head uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Platform</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5">Value</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Abandoned</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="zs-table-body">
                {checkouts.map((c) => {
                  const store = storeById.get(c.storeId);
                  const expanded = expandedId === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr onClick={() => setExpandedId(expanded ? null : c.id)} className="zs-data-row cursor-pointer">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{c.customerName ?? "—"}</div>
                          <div className="text-xs text-slate-400">{c.customerPhone ?? c.customerEmail ?? "—"}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                            {c.platform === "shopify" ? <ShopifyLogo size={14} /> : <WooCommerceLogo size={14} />}
                            {store?.displayName ?? (c.platform === "shopify" ? "Shopify" : "WooCommerce")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{c.lineItems.length}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{money(c.total)}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                            {reasonLabel(c.reason)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500" title={formatAbsoluteDateTime(c.createdAt)}>
                          {relativeTime(c.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {c.checkoutUrl && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                copyText(c.id, c.checkoutUrl!);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Copy recovery link"
                            >
                              <Copy size={14} className={copiedId === c.id ? "text-emerald-500" : undefined} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap items-start gap-6 text-xs text-slate-600">
                              <div>
                                <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Line items</div>
                                <ul className="space-y-0.5">
                                  {c.lineItems.map((li, i) => (
                                    <li key={i}>
                                      {li.quantity}× {li.title} {li.variant ? `(${li.variant})` : ""} — {money(Number(li.price) * li.quantity)}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              {c.address && (
                                <div>
                                  <div className="mb-1 font-semibold uppercase tracking-wide text-slate-400">Address</div>
                                  <div>{c.address}</div>
                                </div>
                              )}
                              {c.checkoutUrl && (
                                <div>
                                  <div className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-wide text-slate-400">
                                    <MousePointerClick size={12} /> Recovery link
                                  </div>
                                  <a href={c.checkoutUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                    {c.checkoutUrl}
                                  </a>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && checkouts.length > 0 && (
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
    </div>
  );
}
