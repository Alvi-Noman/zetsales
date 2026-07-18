import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  ChevronDown,
  Clock3,
  Layers,
  Package,
  Pencil,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Store as StoreIcon,
  Trash2,
  UploadCloud,
} from "lucide-react";
import clsx from "clsx";
import {
  canWriteModule,
  type ProductListItemDTO,
  type StoreDTO,
  type SupplierProductDraftDTO,
} from "@zetsales/shared";
import {
  listProducts,
  listStores,
  fetchPendingImportDraft,
} from "../../lib/commerceApi";
import { ProductDetailDrawer } from "../../components/products/ProductDetailDrawer";
import { ImportProductsModal } from "../../components/integrations/ImportProductsModal";
import { DeleteProductModal } from "../../components/products/DeleteProductModal";
import { AlibabaImportModal } from "../../components/products/AlibabaImportModal";
import { Select } from "../../components/ui/Select";
import {
  CsvLogo,
  ShopifyLogo,
  WooCommerceLogo,
} from "../../components/orders/platformLogos";
import { FilterMenu } from "../../components/orders/FilterMenu";
import { Popover } from "../../components/ui/Popover";
import { useToast } from "../../components/ui/ToastProvider";
import { AppBlock } from "../../components/apps/AppBlock";
import { useAuth } from "../../context/AuthContext";

const PLATFORM_META = {
  shopify: { label: "Shopify", logo: ShopifyLogo },
  woocommerce: { label: "WooCommerce", logo: WooCommerceLogo },
  csv: { label: "CSV Import", logo: CsvLogo },
} as const;

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type ProductSortKey = "title" | "price" | "updated";

const SORT_OPTIONS: {
  label: string;
  key: ProductSortKey;
  dir: "asc" | "desc";
}[] = [
  { label: "Recently updated", key: "updated", dir: "desc" },
  { label: "Oldest updated", key: "updated", dir: "asc" },
  { label: "A to Z", key: "title", dir: "asc" },
  { label: "Z to A", key: "title", dir: "desc" },
  { label: "Highest price", key: "price", dir: "desc" },
  { label: "Lowest price", key: "price", dir: "asc" },
];

function priceRange(product: ProductListItemDTO) {
  const min = product.priceMin ?? 0;
  const max = product.priceMax ?? 0;
  return min === max
    ? `\u09F3${min.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    : `\u09F3${min.toLocaleString()} - \u09F3${max.toLocaleString()}`;
}

function relativeSyncLabel(value: string | null) {
  if (!value) return "Never synced";
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 transition-colors hover:text-slate-900"
    >
      {label}
      {active ? (
        dir === "asc" ? (
          <ArrowUp size={12} />
        ) : (
          <ArrowDown size={12} />
        )
      ) : (
        <ArrowUpDown size={12} className="text-slate-300" />
      )}
    </button>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-lg bg-slate-100"
          style={{ animationDelay: `${i * 45}ms` }}
        />
      ))}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "slate",
}: {
  icon: typeof Package;
  label: string;
  value: string;
  detail: string;
  tone?: "slate" | "emerald" | "amber" | "rose" | "indigo";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    indigo: "bg-indigo-50 text-indigo-600",
  }[tone];

  return (
    <div className="zs-summary-cell">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            toneClass,
          )}
        >
          <Icon size={15} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-xl font-bold tabular-nums text-slate-900">
          {value}
        </span>
        <span className="pb-1 text-xs text-slate-400">{detail}</span>
      </div>
    </div>
  );
}

export function ProductsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<ProductListItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [sort, setSort] = useState<{
    key: ProductSortKey;
    dir: "asc" | "desc";
  }>({ key: "updated", dir: "desc" });
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [importTarget, setImportTarget] = useState<StoreDTO | null>(null);
  const [autoImport, setAutoImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    image: string | null;
  } | null>(null);
  const [alibabaImportOpen, setAlibabaImportOpen] = useState(false);
  const [extensionDraft, setExtensionDraft] =
    useState<SupplierProductDraftDTO | null>(null);

  const loadStores = async () => {
    setStoresLoading(true);
    try {
      setStores(await listStores());
    } catch {
      toast.push("Could not load stores.", "info");
    } finally {
      setStoresLoading(false);
    }
  };

  const loadProducts = async (pageArg: number) => {
    setProductsLoading(true);
    try {
      const res = await listProducts({
        storeId: storeFilter,
        search,
        sortKey: sort.key,
        sortDir: sort.dir,
        page: pageArg,
        pageSize,
      });
      setProducts(res.products);
      setTotal(res.total);
    } catch {
      toast.push("Could not load products.", "info");
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    void loadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    void loadProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilter, search, sort, pageSize]);

  useEffect(() => {
    const importStoreId = searchParams.get("importStoreId");
    if (!importStoreId || stores.length === 0) return;
    const target = stores.find((s) => s.id === importStoreId);
    if (target) {
      setImportTarget(target);
      setAutoImport(true);
    }
    searchParams.delete("importStoreId");
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  // Handoff from the browser extension: it POSTs an extracted draft to the backend, gets a
  // pending-draft id back, then opens this page with ?importDraftId=<id>. Fetch it once and drop
  // straight into the review/publish screen instead of the URL-paste flow.
  useEffect(() => {
    const importDraftId = searchParams.get("importDraftId");
    if (!importDraftId) return;
    searchParams.delete("importDraftId");
    setSearchParams(searchParams, { replace: true });
    fetchPendingImportDraft(importDraftId)
      .then((res) => {
        setExtensionDraft(res.draft);
        setAlibabaImportOpen(true);
      })
      .catch(() =>
        toast.push(
          "Could not load the product extracted by the extension — it may have expired.",
          "info",
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const storeById = useMemo(
    () => new Map(stores.map((s) => [s.id, s])),
    [stores],
  );
  const unimportedStores = useMemo(
    () => stores.filter((store) => store.productCount === 0),
    [stores],
  );
  const visibleProducts = products;
  const canWriteProducts = canWriteModule(user?.role, "products");

  const summary = useMemo(() => {
    const multiChannel = products.filter((p) => p.storeIds.length > 1).length;
    const variants = products.reduce((sum, p) => sum + p.variantCount, 0);
    const syncedStores = stores.filter((s) => s.productCount > 0).length;
    const newestSync = stores
      .map((s) => s.lastSyncedAt)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];

    return { multiChannel, variants, syncedStores, newestSync };
  }, [products, stores]);

  const handleSort = (key: ProductSortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  const refreshAll = () => {
    void loadStores();
    void loadProducts(page);
  };

  const handleImported = () => {
    void loadStores();
    void loadProducts(page);
  };

  const goToPage = (next: number) => {
    setPage(next);
    void loadProducts(next);
  };

  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setStoreFilter("all");
    setSort({ key: "updated", dir: "desc" });
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);
  const activeSortLabel =
    SORT_OPTIONS.find((o) => o.key === sort.key && o.dir === sort.dir)?.label ??
    "Custom";
  const noFiltersActive = !search && storeFilter === "all";

  return (
    <div className="zs-page">
      <div className="zs-page-header flex flex-wrap items-center justify-between gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="zs-page-title">Products</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums">
              {total.toLocaleString()}
            </span>
          </div>
          <p className="zs-page-description">
            Manage synced catalog items, variants and multi-channel listings.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={refreshAll}
            disabled={productsLoading || storesLoading}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={productsLoading ? "animate-spin" : undefined}
            />{" "}
            Refresh
          </button>
          {canWriteProducts && (
            <>
              <button
                onClick={() => setAlibabaImportOpen(true)}
                disabled={storesLoading || stores.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <UploadCloud size={14} /> Import from Alibaba
              </button>
              <button
                onClick={() => navigate("/products/new")}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={14} /> Add product
              </button>
            </>
          )}
        </div>
      </div>

      {storesLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Loading...
        </div>
      ) : stores.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <Package size={28} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No products yet</p>
          <p className="max-w-sm text-sm text-slate-400">
            Connect a Shopify or WooCommerce store and import your catalog to
            see products here.
          </p>
          <button
            onClick={() => navigate("/integrations")}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plug size={14} /> Go to Integrations
          </button>
        </div>
      ) : (
        <>
          {unimportedStores.length > 0 && (
            <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex gap-2 overflow-x-auto">
                {unimportedStores.map((store) => {
                  const meta = PLATFORM_META[store.platform];
                  return (
                    <div
                      key={store.id}
                      className="flex min-w-[280px] items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white">
                          <meta.logo size={18} className="shrink-0 rounded" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            {store.displayName}
                          </p>
                          <p className="text-xs text-slate-400">
                            Nothing imported yet
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setAutoImport(false);
                          setImportTarget(store);
                        }}
                        className="ml-3 flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        <RefreshCw size={12} /> Import
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {total === 0 &&
          !search &&
          storeFilter === "all" &&
          !productsLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
              <Package size={28} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-600">
                Nothing imported yet
              </p>
              <p className="max-w-sm text-sm text-slate-400">
                Click Import on whichever store you want to pull in.
              </p>
            </div>
          ) : (
            <>
              <div className="zs-toolbox">
                <div className="zs-toolbox-row">
                  <div className="zs-toolbox-left">
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
                    {(!noFiltersActive ||
                      sort.key !== "updated" ||
                      sort.dir !== "desc") && (
                      <button
                        onClick={clearFilters}
                        className="text-xs font-medium text-slate-400 hover:text-slate-600"
                      >
                        Clear filters
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
                        placeholder="Search title or SKU"
                        className="zs-search-input"
                      />
                    </div>
                    <Popover
                      align="right"
                      widthClass="w-48"
                      trigger={() => (
                        <div className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200/80 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                          <span className="text-slate-400">Sort by:</span>
                          {activeSortLabel}
                          <ChevronDown size={11} className="text-slate-400" />
                        </div>
                      )}
                    >
                      {(close) => (
                        <div className="py-1.5">
                          {SORT_OPTIONS.map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => {
                                setSort({ key: opt.key, dir: opt.dir });
                                close();
                              }}
                              className={clsx(
                                "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                                sort.key === opt.key && sort.dir === opt.dir
                                  ? "font-semibold text-indigo-600"
                                  : "text-slate-700",
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </Popover>
                    <Select
                      value={String(pageSize)}
                      onChange={(v) => setPageSize(Number(v))}
                      options={PAGE_SIZE_OPTIONS.map((n) => ({
                        value: String(n),
                        label: `${n}/page`,
                      }))}
                      className="h-8 py-0 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="zs-summary-strip">
                  <MetricCard
                    icon={Boxes}
                    label="Catalog"
                    value={total.toLocaleString()}
                    detail={`${summary.variants.toLocaleString()} variants loaded`}
                    tone="indigo"
                  />
                  <MetricCard
                    icon={StoreIcon}
                    label="Channels"
                    value={`${summary.syncedStores}/${stores.length}`}
                    detail={`${summary.multiChannel} multi-channel rows`}
                  />
                  <MetricCard
                    icon={Layers}
                    label="Variants"
                    value={summary.variants.toLocaleString()}
                    detail="across visible catalog"
                    tone="emerald"
                  />
                  <MetricCard
                    icon={Clock3}
                    label="Last Sync"
                    value={relativeSyncLabel(summary.newestSync ?? null)}
                    detail="across connected stores"
                  />
                </div>
              </div>

              <div
                className={clsx(
                  "flex-1 overflow-auto transition-opacity",
                  productsLoading && "opacity-50",
                )}
              >
                {productsLoading && products.length === 0 ? (
                  <TableSkeleton />
                ) : (
                  <table className="w-full min-w-[1120px] table-fixed border-collapse text-sm">
                    <colgroup>
                      <col className="w-[32%]" />
                      <col className="w-[18%]" />
                      <col className="w-[14%]" />
                      <col className="w-[16%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                    </colgroup>
                    <thead>
                      <tr className="zs-table-head">
                        <th className="py-3.5 pl-6 pr-5">
                          <SortHeader
                            label="Product"
                            active={sort.key === "title"}
                            dir={sort.dir}
                            onClick={() => handleSort("title")}
                          />
                        </th>
                        <th className="px-5 py-3.5">Channels</th>
                        <th className="px-5 py-3.5">
                          <SortHeader
                            label="Price"
                            active={sort.key === "price"}
                            dir={sort.dir}
                            onClick={() => handleSort("price")}
                          />
                        </th>
                        <th className="px-5 py-3.5">Catalog Signal</th>
                        <th className="px-5 py-3.5">
                          <SortHeader
                            label="Updated"
                            active={sort.key === "updated"}
                            dir={sort.dir}
                            onClick={() => handleSort("updated")}
                          />
                        </th>
                        <th className="py-3.5 pl-3 pr-6" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => {
                        const channelStores = product.storeIds
                          .map((id) => storeById.get(id))
                          .filter((s): s is StoreDTO => Boolean(s));
                        return (
                          <tr
                            key={product.id}
                            onClick={() => setActiveProductId(product.id)}
                            className="zs-data-row cursor-pointer border-b border-slate-100"
                          >
                            <td className="py-4 pl-6 pr-5">
                              <div className="flex min-w-0 items-center gap-4">
                                {product.image ? (
                                  <img
                                    src={product.image}
                                    alt={product.title}
                                    className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                                  />
                                ) : (
                                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                                    <Package size={18} />
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-slate-800">
                                    {product.title}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                                    <Layers size={11} />
                                    {product.variantCount} variant
                                    {product.variantCount === 1 ? "" : "s"}
                                    {product.groupId && (
                                      <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-600">
                                        Grouped
                                      </span>
                                    )}
                                    <AppBlock
                                      target="admin.products.index.row-badge"
                                      context={{ productId: product.id }}
                                    />
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex shrink-0 items-center gap-1">
                                  {channelStores.map((s) => {
                                    const meta = PLATFORM_META[s.platform];
                                    return (
                                      <span
                                        key={s.id}
                                        title={s.displayName}
                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white ring-1 ring-slate-200"
                                      >
                                        <meta.logo
                                          size={18}
                                          className="shrink-0 rounded"
                                        />
                                      </span>
                                    );
                                  })}
                                </div>
                                <span className="min-w-0 truncate text-sm font-medium text-slate-500">
                                  {channelStores.length === 1
                                    ? channelStores[0].displayName
                                    : `${channelStores.length} channels`}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4 font-semibold tabular-nums text-slate-800 whitespace-nowrap">
                              {priceRange(product)}
                            </td>
                            <td className="px-5 py-4 whitespace-nowrap">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-slate-700">
                                  {product.storeIds.length > 1
                                    ? "Synced listing"
                                    : "Single channel"}
                                </span>
                                <span className="mt-0.5 text-xs text-slate-400">
                                  {product.storeIds.length > 1
                                    ? "Shared product group"
                                    : "No linked copies yet"}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-slate-500 whitespace-nowrap">
                              <p className="font-medium text-slate-700">
                                {new Date(
                                  product.updatedAt,
                                ).toLocaleDateString()}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {new Date(product.updatedAt).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </p>
                            </td>
                            <td
                              className="py-4 pl-3 pr-6 text-right whitespace-nowrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {canWriteProducts && (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() =>
                                      navigate(`/products/${product.id}/edit`)
                                    }
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                    title="Edit product"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setDeleteTarget({
                                        id: product.id,
                                        title: product.title,
                                        image: product.image,
                                      })
                                    }
                                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                    title="Delete product"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {visibleProducts.length === 0 && !productsLoading && (
                  <div className="py-16 text-center text-sm text-slate-400">
                    No products match your search.
                  </div>
                )}
              </div>

              {total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5">
                  <span className="text-xs text-slate-400">
                    Showing{" "}
                    <span className="font-medium text-slate-600">
                      {rangeStart}
                    </span>
                    -
                    <span className="font-medium text-slate-600">
                      {rangeEnd}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-slate-600">
                      {total.toLocaleString()}
                    </span>{" "}
                    products
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1 || productsLoading}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeft size={12} /> Prev
                    </button>
                    <span className="min-w-[76px] text-center text-xs text-slate-400">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => goToPage(page + 1)}
                      disabled={page >= totalPages || productsLoading}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      <ProductDetailDrawer
        productId={activeProductId}
        stores={stores}
        onClose={() => setActiveProductId(null)}
      />
      <ImportProductsModal
        store={importTarget}
        autoStart={autoImport}
        onClose={() => {
          setImportTarget(null);
          setAutoImport(false);
        }}
        onImported={handleImported}
      />
      {canWriteProducts && (
        <>
          <DeleteProductModal
            product={deleteTarget}
            onClose={() => setDeleteTarget(null)}
            onDeleted={handleImported}
          />
          <AlibabaImportModal
            open={alibabaImportOpen}
            stores={stores}
            initialDraft={extensionDraft}
            onClose={() => {
              setAlibabaImportOpen(false);
              setExtensionDraft(null);
            }}
            onImported={handleImported}
          />
        </>
      )}
    </div>
  );
}
