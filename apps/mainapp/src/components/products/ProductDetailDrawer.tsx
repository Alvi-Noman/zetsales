import { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Package, X } from 'lucide-react';
import clsx from 'clsx';
import type { ProductDTO, StoreDTO } from '@zetsales/shared';
import { getProduct, type ProductStoreRef } from '../../lib/commerceApi';
import { ShopifyLogo, WooCommerceLogo } from '../orders/platformLogos';
import { AppBlock } from '../apps/AppBlock';

const PLATFORM_META = {
  shopify: { label: 'Shopify', logo: ShopifyLogo },
  woocommerce: { label: 'WooCommerce', logo: WooCommerceLogo },
} as const;

function shopifyProductUrl(shopDomain: string, externalId: string) {
  return `https://${shopDomain}/admin/products/${externalId}`;
}

interface ProductDetailDrawerProps {
  productId: string | null;
  stores: StoreDTO[];
  onClose: () => void;
}

export function ProductDetailDrawer({ productId, stores, onClose }: ProductDetailDrawerProps) {
  const [detail, setDetail] = useState<{ product: ProductDTO; ownStore: ProductStoreRef | null; siblings: ProductStoreRef[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setDetail(null);
    getProduct(productId)
      .then((res) => setDetail({ product: res.product, ownStore: res.ownStore, siblings: res.siblings }))
      .finally(() => setLoading(false));
  }, [productId]);

  const product = detail?.product ?? null;
  const channels = detail ? [...(detail.ownStore ? [detail.ownStore] : []), ...detail.siblings] : [];
  const open = Boolean(productId);

  return (
    <div className={clsx('fixed inset-0 z-40 transition-[visibility]', open ? 'visible' : 'invisible delay-300')} aria-hidden={!open}>
      <div onClick={onClose} className={clsx('absolute inset-0 bg-slate-900/30 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} />
      <div
        className={clsx(
          'absolute right-0 top-0 h-full w-full max-w-[460px] transform bg-white shadow-2xl transition-transform duration-300 flex flex-col',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {open && (
          <>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-900">Product details</h2>
              <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            {loading || !product ? (
              <div className="flex flex-1 items-center justify-center text-slate-400">
                <Loader2 size={22} className="animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                <div className="flex items-center gap-4">
                  {product.images[0] ? (
                    <img src={product.images[0]} alt={product.title} className="h-20 w-20 shrink-0 rounded-xl border border-slate-200 object-cover" />
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

                {product.images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto">
                    {product.images.map((src) => (
                      <img key={src} src={src} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" />
                    ))}
                  </div>
                )}

                {(product.category || product.description) && (
                  <div className="space-y-2">
                    {product.category && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{product.category}</span>
                    )}
                    {product.description && <p className="whitespace-pre-line text-sm text-slate-600">{product.description}</p>}
                  </div>
                )}

                {channels.length > 0 && (
                  <section>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Listed on {channels.length} channel{channels.length === 1 ? '' : 's'}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {channels.map((c) => {
                        const meta = PLATFORM_META[c.platform];
                        return (
                          <span
                            key={c.storeId}
                            className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                          >
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white">
                              <meta.logo size={13} className="shrink-0 rounded" />
                            </span>
                            {c.displayName}
                          </span>
                        );
                      })}
                    </div>
                  </section>
                )}

                <section className="rounded-xl border border-slate-200 p-4">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Variants</h4>
                  <div className="divide-y divide-slate-100">
                    {product.variants.map((v) => (
                      <div key={v.id} className="flex items-center justify-between py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">{v.optionValues.length > 0 ? v.optionValues.join(' / ') : v.title}</p>
                          <p className="text-xs text-slate-400">{v.sku ? `SKU: ${v.sku}` : 'No SKU'}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold tabular-nums text-slate-800">
                            ৳{v.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            {v.compareAtPrice != null && v.compareAtPrice > v.price && (
                              <span className="ml-1.5 text-xs font-normal text-slate-400 line-through">
                                ৳{v.compareAtPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <AppBlock target="admin.product-details.block" context={{ productId: product.id }} />

                {detail?.ownStore?.platform === 'shopify' &&
                  (() => {
                    const ownStoreFull = stores.find((s) => s.id === detail.ownStore!.storeId);
                    return ownStoreFull ? (
                      <a
                        href={shopifyProductUrl(ownStoreFull.shopDomain, product.externalId)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink size={14} /> View in Shopify
                      </a>
                    ) : null;
                  })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
