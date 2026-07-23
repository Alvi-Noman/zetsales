import { useEffect, useMemo, useState } from "react";
import {
  MessageCircle,
  Package,
  Phone,
  Search,
  ShoppingCart,
  Store as StoreIcon,
  X,
} from "lucide-react";
import type { AbandonedCheckoutDTO, StoreDTO } from "@zetsales/shared";
import {
  getAbandonedCheckoutStats,
  listAbandonedCheckouts,
  listStores,
} from "../../lib/commerceApi";
import { ShopifyLogo, WooCommerceLogo } from "../../components/orders/platformLogos";
import { OrderProductsCell } from "../../components/orders/OrderProductsCell";
import { AbandonedCheckoutDetailDrawer } from "../../components/orders/AbandonedCheckoutDetailDrawer";
import { Pagination } from "../../components/orders/Pagination";
import { FilterMenu } from "../../components/orders/FilterMenu";
import { DateRangeMenu } from "../../components/orders/DateRangeMenu";
import { getRangeBounds, type CustomDateRange, type DateRangeKey } from "../../components/orders/dateRange";
import { telLink, waLink } from "../../components/orders/contact";
import { formatAbsoluteDateTime, relativeDayLabel } from "../../components/orders/time";
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
  const [activeCheckout, setActiveCheckout] = useState<AbandonedCheckoutDTO | null>(null);

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

  return (
    <div className="zs-page">
      <div className="zs-page-header flex flex-wrap items-center justify-between gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="zs-page-title">Incomplete Orders</h1>
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
                {noFiltersActive ? "No incomplete orders yet" : "No incomplete orders match this filter"}
              </p>
              <p className="max-w-sm text-sm text-slate-400">
                {noFiltersActive
                  ? "Incomplete WooCommerce orders and abandoned Shopify checkouts will show up here as customers leave without finishing checkout."
                  : "Try a different platform or date range."}
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[1000px] table-auto border-collapse text-sm">
              <thead>
                <tr className="zs-table-head">
                  <th className="px-3 py-2.5">Checkout</th>
                  <th className="px-3 py-2.5">Customer</th>
                  <th className="px-3 py-2.5">Product</th>
                  <th className="px-3 py-2.5">Channel</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Contact</th>
                  <th className="px-3 py-2.5">Date</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {checkouts.map((c) => {
                  const store = storeById.get(c.storeId);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setActiveCheckout(c)}
                      className="zs-data-row cursor-pointer border-b border-l-4 border-transparent border-slate-100"
                    >
                      <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">#{c.externalId}</td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="font-medium text-slate-700">{c.customerName || "No name"}</p>
                        {c.customerPhone && <p className="text-xs text-slate-400">{c.customerPhone}</p>}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <OrderProductsCell lineItems={c.lineItems} currency={c.currency} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span title={store?.displayName} className="inline-flex items-center gap-1.5 text-slate-600">
                          {c.platform === "shopify" ? <ShopifyLogo size={18} className="shrink-0 rounded" /> : <WooCommerceLogo size={18} className="shrink-0 rounded" />}
                          <span>{store?.displayName ?? (c.platform === "shopify" ? "Shopify" : "WooCommerce")}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 font-medium tabular-nums text-slate-800 whitespace-nowrap">
                        {c.currency} {c.total.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                          {reasonLabel(c.reason)}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {c.customerPhone ? (
                          <div className="flex items-center gap-1">
                            <a href={telLink(c.customerPhone)} title="Call" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                              <Phone size={14} />
                            </a>
                            <a href={waLink(c.customerPhone)} target="_blank" rel="noreferrer" title="WhatsApp" className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600">
                              <MessageCircle size={14} />
                            </a>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="text-slate-700">{formatAbsoluteDateTime(c.createdAt)}</p>
                        <p className="text-xs text-slate-400">{relativeDayLabel(c.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap" />
                    </tr>
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

      <AbandonedCheckoutDetailDrawer
        checkout={activeCheckout}
        store={activeCheckout ? storeById.get(activeCheckout.storeId) ?? null : null}
        onClose={() => setActiveCheckout(null)}
      />
    </div>
  );
}
