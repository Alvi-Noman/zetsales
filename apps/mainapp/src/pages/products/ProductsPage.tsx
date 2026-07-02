import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Package, Pencil, Plug, Plus, RefreshCw, Search, ShoppingBag, Store as StoreIcon, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { ProductDTO, StoreDTO } from '@zetsales/shared';
import { listProducts, listStores } from '../../lib/commerceApi';
import { ProductDetailDrawer } from '../../components/products/ProductDetailDrawer';
import { ImportProductsModal } from '../../components/integrations/ImportProductsModal';
import { DeleteProductModal } from '../../components/products/DeleteProductModal';
import { useToast } from '../../components/ui/ToastProvider';

const PLATFORM_META = {
  shopify: { label: 'Shopify', color: 'bg-[#95BF47]', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce', color: 'bg-[#7f54b3]', icon: StoreIcon },
} as const;

const PAGE_SIZE = 50;

type SortKey = 'title' | 'price' | 'stock' | 'updated';

function priceRange(product: ProductDTO) {
  const prices = product.variants.map((v) => v.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `৳${min.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `৳${min.toLocaleString()} – ৳${max.toLocaleString()}`;
}

function totalStock(product: ProductDTO) {
  return product.variants.reduce((s, v) => s + (v.inventory ?? 0), 0);
}

function stockTone(total: number) {
  if (total <= 0) return { label: 'Out of stock', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' };
  if (total <= 10) return { label: 'Low stock', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' };
  return { label: 'In stock', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' };
}

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 hover:text-slate-900 transition-colors">
      {label}
      {active ? dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={12} className="text-slate-300" />}
    </button>
  );
}

export function ProductsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<ProductDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [productsLoading, setProductsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'updated', dir: 'desc' });
  const [activeProduct, setActiveProduct] = useState<ProductDTO | null>(null);
  const [importTarget, setImportTarget] = useState<StoreDTO | null>(null);
  const [autoImport, setAutoImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; image: string | null } | null>(null);

  const loadStores = async () => {
    setStoresLoading(true);
    try {
      setStores(await listStores());
    } catch {
      toast.push('Could not load stores.', 'info');
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
        pageSize: PAGE_SIZE,
      });
      setProducts(res.products);
      setTotal(res.total);
    } catch {
      toast.push('Could not load products.', 'info');
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
  }, [storeFilter, search, sort]);

  useEffect(() => {
    const importStoreId = searchParams.get('importStoreId');
    if (!importStoreId || stores.length === 0) return;
    const target = stores.find((s) => s.id === importStoreId);
    if (target) {
      setImportTarget(target);
      setAutoImport(true);
    }
    searchParams.delete('importStoreId');
    setSearchParams(searchParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);

  const handleSort = (key: SortKey) => setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const handleImported = () => {
    void loadStores();
    void loadProducts(page);
  };

  const goToPage = (next: number) => {
    setPage(next);
    void loadProducts(next);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * PAGE_SIZE);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Products</h1>
          <p className="mt-1 text-sm text-slate-500">Your catalog, synced in from every connected store.</p>
        </div>
        <button
          onClick={() => navigate('/products/new')}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus size={14} /> Add product
        </button>
      </div>

      {storesLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading...</div>
      ) : stores.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <Package size={28} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No products yet</p>
          <p className="max-w-sm text-sm text-slate-400">Connect a Shopify or WooCommerce store and import your catalog to see products here.</p>
          <button
            onClick={() => navigate('/integrations')}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plug size={14} /> Go to Integrations
          </button>
        </div>
      ) : (
        <>
          {/* Every connected store shows up here with its own Import button — pick whichever
              one you want to sync from, no need to leave this page. */}
          <div className="space-y-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            {stores.map((store) => {
              const meta = PLATFORM_META[store.platform];
              return (
                <div key={store.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg text-white', meta.color)}>
                      <meta.icon size={14} />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{store.displayName}</p>
                      <p className="text-xs text-slate-400">
                        {store.productCount} product{store.productCount === 1 ? '' : 's'} imported
                        {store.lastSyncedAt ? ` · Synced ${new Date(store.lastSyncedAt).toLocaleDateString()}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setAutoImport(false);
                      setImportTarget(store);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <RefreshCw size={12} /> Import products
                  </button>
                </div>
              );
            })}
          </div>

          {total === 0 && !search && storeFilter === 'all' && !productsLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
              <Package size={28} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Nothing imported yet</p>
              <p className="max-w-sm text-sm text-slate-400">Click "Import products" above on whichever store you want to pull in.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
                <div className="relative max-w-xs flex-1">
                  <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search title or SKU"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white py-1.5 px-3 text-sm text-slate-700 outline-none focus:border-indigo-400"
                >
                  <option value="all">All stores</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
                <span className="ml-auto text-xs text-slate-400">{total.toLocaleString()} products</span>
              </div>

              <div className={clsx('flex-1 overflow-y-auto transition-opacity', productsLoading && 'opacity-50')}>
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                      <th className="px-4 py-2.5">
                        <SortHeader label="Product" active={sort.key === 'title'} dir={sort.dir} onClick={() => handleSort('title')} />
                      </th>
                      <th className="px-3 py-2.5">Store</th>
                      <th className="px-3 py-2.5">
                        <SortHeader label="Price" active={sort.key === 'price'} dir={sort.dir} onClick={() => handleSort('price')} />
                      </th>
                      <th className="px-3 py-2.5">
                        <SortHeader label="Stock" active={sort.key === 'stock'} dir={sort.dir} onClick={() => handleSort('stock')} />
                      </th>
                      <th className="px-3 py-2.5">
                        <SortHeader label="Updated" active={sort.key === 'updated'} dir={sort.dir} onClick={() => handleSort('updated')} />
                      </th>
                      <th className="px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const store = storeById.get(product.storeId);
                      const meta = store ? PLATFORM_META[store.platform] : null;
                      const stock = stockTone(totalStock(product));
                      return (
                        <tr
                          key={product.id}
                          onClick={() => setActiveProduct(product)}
                          className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {product.image ? (
                                <img src={product.image} alt={product.title} className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover" />
                              ) : (
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                                  <Package size={18} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-800">{product.title}</p>
                                <p className="text-xs text-slate-400">
                                  {product.variants.length} variant{product.variants.length === 1 ? '' : 's'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            {meta && store && (
                              <span className="inline-flex items-center gap-1.5 text-slate-600">
                                <span className={clsx('flex h-5 w-5 items-center justify-center rounded text-white', meta.color)}>
                                  <meta.icon size={11} />
                                </span>
                                {store.displayName}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 font-medium tabular-nums text-slate-800 whitespace-nowrap">{priceRange(product)}</td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', stock.className)}>
                              {stock.label} · {totalStock(product)}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-slate-500 whitespace-nowrap">{new Date(product.updatedAt).toLocaleDateString()}</td>
                          <td className="px-3 py-3 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/products/${product.id}/edit`);
                                }}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit product"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget({ id: product.id, title: product.title, image: product.image });
                                }}
                                className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Delete product"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {products.length === 0 && !productsLoading && (
                  <div className="py-16 text-center text-sm text-slate-400">No products match your search.</div>
                )}
              </div>

              {total > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5">
                  <span className="text-xs text-slate-400">
                    Showing <span className="font-medium text-slate-600">{rangeStart}–{rangeEnd}</span> of{' '}
                    <span className="font-medium text-slate-600">{total.toLocaleString()}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(page - 1)}
                      disabled={page <= 1 || productsLoading}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeft size={12} /> Prev
                    </button>
                    <span className="text-xs text-slate-400">
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

      <ProductDetailDrawer product={activeProduct} store={activeProduct ? storeById.get(activeProduct.storeId) ?? null : null} onClose={() => setActiveProduct(null)} />
      <ImportProductsModal
        store={importTarget}
        autoStart={autoImport}
        onClose={() => {
          setImportTarget(null);
          setAutoImport(false);
        }}
        onImported={handleImported}
      />
      <DeleteProductModal product={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={handleImported} />
    </div>
  );
}
