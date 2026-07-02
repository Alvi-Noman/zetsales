import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ShoppingBag, Store as StoreIcon } from 'lucide-react';
import type { ProductPushResultDTO } from '@zetsales/shared';
import { getProduct, updateProduct, type ProductStoreRef } from '../../lib/commerceApi';
import { ProductFormFields, EMPTY_PRODUCT_FORM, type ProductFormState } from '../../components/products/ProductFormFields';
import { ProductPushSummary } from '../../components/products/ProductPushSummary';
import { useToast } from '../../components/ui/ToastProvider';

const PLATFORM_META = {
  shopify: { label: 'Shopify', color: 'bg-[#95BF47]', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce', color: 'bg-[#7f54b3]', icon: StoreIcon },
} as const;

export function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [initialForm, setInitialForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [ownStore, setOwnStore] = useState<ProductStoreRef | null>(null);
  const [siblings, setSiblings] = useState<ProductStoreRef[]>([]);
  const [variantCount, setVariantCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ProductPushResultDTO[] | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await getProduct(id);
        const p = res.product;
        const firstVariant = p.variants[0];
        const loaded: ProductFormState = {
          title: p.title,
          image: p.image ?? '',
          price: firstVariant ? String(firstVariant.price) : '',
          sku: firstVariant?.sku ?? '',
          inventory: firstVariant?.inventory != null ? String(firstVariant.inventory) : '',
        };
        setForm(loaded);
        setInitialForm(loaded);
        setVariantCount(p.variants.length);
        setOwnStore(res.ownStore);
        setSiblings(res.siblings);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm);
  const canSubmit = isDirty && form.title.trim().length > 0 && form.price.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!id || !canSubmit) return;
    setSubmitting(true);
    try {
      const res = await updateProduct(id, {
        title: form.title.trim(),
        image: form.image.trim() || undefined,
        price: Number(form.price),
        sku: form.sku.trim() || undefined,
        inventory: form.inventory.trim() ? Number(form.inventory) : undefined,
      });
      setResults(res.results);
      const successCount = res.results.filter((r) => r.success).length;
      if (successCount > 0) toast.push(`Updated "${form.title.trim()}" on ${successCount} store${successCount === 1 ? '' : 's'}.`);
    } catch {
      toast.push('Could not update this product.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  const affectedStores = ownStore ? [ownStore, ...siblings] : siblings;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-8 py-5">
        <button onClick={() => navigate('/products')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Edit product</h1>
          <p className="mt-0.5 text-sm text-slate-500">Changes push straight to the connected store(s).</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-xl px-8 py-6">
        {loading ? (
          <div className="py-16 text-center text-sm text-slate-400">Loading...</div>
        ) : notFound ? (
          <div className="py-16 text-center text-sm text-slate-400">Product not found.</div>
        ) : results ? (
          <div className="space-y-5">
            <ProductPushSummary title={form.title.trim()} image={form.image.trim() || null} results={results} />
            <button
              onClick={() => navigate('/products')}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              View products
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {variantCount > 1 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
                This product has {variantCount} variants — editing here only updates the primary variant's price, SKU and stock.
              </div>
            )}

            <ProductFormFields value={form} onChange={setForm} />

            {siblings.length > 0 && (
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">This will update</label>
                <div className="space-y-2">
                  {affectedStores.map((s) => {
                    const meta = PLATFORM_META[s.platform];
                    return (
                      <div key={s.storeId} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
                        <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-white ${meta.color}`}>
                          <meta.icon size={14} />
                        </span>
                        <span className="text-sm font-medium text-slate-800">{s.displayName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
