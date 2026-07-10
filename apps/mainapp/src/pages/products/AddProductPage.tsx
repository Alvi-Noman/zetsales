import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Package, ShoppingBag, Store as StoreIcon } from 'lucide-react';
import clsx from 'clsx';
import type { StoreDTO } from '@zetsales/shared';
import { createProduct, listStores } from '../../lib/commerceApi';
import { ProductFormFields, EMPTY_PRODUCT_FORM, type ProductFormState } from '../../components/products/ProductFormFields';
import { ProductPushProgress, type PushProgressItem } from '../../components/products/ProductPushProgress';
import { useToast } from '../../components/ui/ToastProvider';

const PLATFORM_META = {
  shopify: { label: 'Shopify', color: 'bg-[#95BF47]', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce', color: 'bg-[#7f54b3]', icon: StoreIcon },
} as const;

export function AddProductPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [pushItems, setPushItems] = useState<PushProgressItem[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await listStores();
        setStores(list);
        setSelected(new Set(list.map((s) => s.id)));
      } catch {
        toast.push('Could not load your connected stores.', 'info');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleStore = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSubmit = form.title.trim().length > 0 && form.variants.length > 0 && form.variants.every((v) => v.price.trim().length > 0) && selected.size > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const targetStores = stores.filter((s) => selected.has(s.id));
    setPushItems(targetStores.map((s) => ({ storeId: s.id, displayName: s.displayName, platform: s.platform, status: 'pending' })));
    try {
      const res = await createProduct(
        {
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          category: form.category.trim() || undefined,
          images: form.images,
          weight: form.weight.trim() ? Number(form.weight) : undefined,
          weightUnit: form.weightUnit,
          sourceUrl: form.sourceUrl,
          sourcePlatform: form.sourcePlatform ?? 'manual',
          options: form.options,
          variants: form.variants.map((v) => ({
            sku: v.sku.trim() || undefined,
            price: Number(v.price) || 0,
            compareAtPrice: v.compareAtPrice.trim() ? Number(v.compareAtPrice) : undefined,
            optionValues: v.optionValues,
            continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
          })),
          storeIds: [...selected],
        },
        (event) => {
          if (event.type === 'store:start') {
            setPushItems((prev) => prev?.map((item) => (item.storeId === event.storeId ? { ...item, status: 'pushing' } : item)) ?? prev);
          } else if (event.type === 'store:done') {
            setPushItems(
              (prev) =>
                prev?.map((item) =>
                  item.storeId === event.storeId ? { ...item, status: event.success ? 'done' : 'error', error: event.error } : item
                ) ?? prev
            );
          }
        }
      );
      const firstSuccess = res.results.find((r) => r.success && r.productId);
      const successCount = res.results.filter((r) => r.success).length;

      if (firstSuccess?.productId) {
        toast.push(`Pushed "${form.title.trim()}" to ${successCount} store${successCount === 1 ? '' : 's'}.`);
        navigate(`/products/${firstSuccess.productId}/edit`);
      } else {
        toast.push('Could not push this product to any store — see details below.', 'info');
      }
    } catch (err) {
      setPushItems(null);
      toast.push(err instanceof Error ? err.message : 'Could not create this product.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-8 py-5">
        <button onClick={() => navigate('/products')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Add product</h1>
          <p className="mt-0.5 text-sm text-slate-500">Create once, push to any mix of your connected stores.</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-8 py-6">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading...</div>
        ) : stores.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 py-14 text-center">
            <Package size={24} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">Connect a store first</p>
            <p className="text-xs text-slate-400">You need at least one connected Shopify or WooCommerce store to push a product to.</p>
            <button
              onClick={() => navigate('/integrations')}
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Go to Integrations
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <ProductFormFields value={form} onChange={setForm} />

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Push to</label>
              {pushItems ? (
                <ProductPushProgress items={pushItems} />
              ) : (
                <div className="space-y-2">
                  {stores.map((store) => {
                    const meta = PLATFORM_META[store.platform];
                    const checked = selected.has(store.id);
                    return (
                      <label
                        key={store.id}
                        className={clsx(
                          'flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition',
                          checked ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'
                        )}
                      >
                        <input type="checkbox" checked={checked} onChange={() => toggleStore(store.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg text-white', meta.color)}>
                          <meta.icon size={14} />
                        </span>
                        <span className="text-sm font-medium text-slate-800">{store.displayName}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? 'Pushing...' : `Create & push to ${selected.size} store${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
