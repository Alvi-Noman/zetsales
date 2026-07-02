import { ExternalLink, Package, ShoppingBag, Store as StoreIcon, X } from 'lucide-react';
import clsx from 'clsx';
import type { ProductDTO, StoreDTO } from '@zetsales/shared';

const PLATFORM_META = {
  shopify: { label: 'Shopify', color: 'bg-[#95BF47]', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce', color: 'bg-[#7f54b3]', icon: StoreIcon },
} as const;

function stockTone(total: number) {
  if (total <= 0) return { label: 'Out of stock', className: 'bg-rose-50 text-rose-700 ring-rose-600/20' };
  if (total <= 10) return { label: 'Low stock', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' };
  return { label: 'In stock', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' };
}

function shopifyProductUrl(shopDomain: string, externalId: string) {
  return `https://${shopDomain}/admin/products/${externalId}`;
}

interface ProductDetailDrawerProps {
  product: ProductDTO | null;
  store: StoreDTO | null;
  onClose: () => void;
}

export function ProductDetailDrawer({ product, store, onClose }: ProductDetailDrawerProps) {
  const totalStock = product?.variants.reduce((s, v) => s + (v.inventory ?? 0), 0) ?? 0;
  const stock = stockTone(totalStock);
  const meta = store ? PLATFORM_META[store.platform] : null;

  return (
    <div className={clsx('fixed inset-0 z-40 transition-[visibility]', product ? 'visible' : 'invisible delay-300')} aria-hidden={!product}>
      <div onClick={onClose} className={clsx('absolute inset-0 bg-slate-900/30 transition-opacity duration-300', product ? 'opacity-100' : 'opacity-0')} />
      <div
        className={clsx(
          'absolute right-0 top-0 h-full w-full max-w-[460px] transform bg-white shadow-2xl transition-transform duration-300 flex flex-col',
          product ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {product && (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Product details</h2>
              <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div className="flex items-center gap-4">
                {product.image ? (
                  <img src={product.image} alt={product.title} className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-300">
                    <Package size={26} />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-900">{product.title}</h3>
                  <p className="text-xs text-slate-400">
                    {product.variants.length} variant{product.variants.length === 1 ? '' : 's'} &middot; Updated{' '}
                    {new Date(product.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', stock.className)}>
                  {stock.label} &middot; {totalStock} total
                </span>
                {meta && store && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    <span className={clsx('h-2 w-2 rounded-full', meta.color)} />
                    {store.displayName}
                  </span>
                )}
              </div>

              <section className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Variants</h4>
                <div className="divide-y divide-slate-100">
                  {product.variants.map((v) => (
                    <div key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-700">{v.title}</p>
                        <p className="text-xs text-slate-400">{v.sku ? `SKU: ${v.sku}` : 'No SKU'}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums text-slate-800">৳{v.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                        <p
                          className={clsx(
                            'text-xs tabular-nums',
                            v.inventory === null ? 'text-slate-400' : v.inventory <= 0 ? 'text-rose-500' : v.inventory <= 10 ? 'text-amber-600' : 'text-slate-400'
                          )}
                        >
                          {v.inventory === null ? 'Stock n/a' : `${v.inventory} in stock`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {store?.platform === 'shopify' && (
                <a
                  href={shopifyProductUrl(store.shopDomain, product.externalId)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink size={14} /> View in Shopify
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
