import { useEffect, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, Globe, ShoppingBag, Store as StoreIcon, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { ProductPushResultDTO } from '@zetsales/shared';
import { getProduct, deleteProduct, type ProductStoreRef } from '../../lib/commerceApi';
import { Modal } from '../ui/Modal';
import { ProductPushSummary } from './ProductPushSummary';
import { useToast } from '../ui/ToastProvider';

const PLATFORM_META = {
  shopify: { label: 'Shopify', color: 'bg-[#95BF47]', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce', color: 'bg-[#7f54b3]', icon: StoreIcon },
  zetsite: { label: 'ZetSite', color: 'bg-slate-900', icon: Globe },
  csv: { label: 'CSV Import', color: 'bg-slate-500', icon: FileSpreadsheet },
} as const;

interface DeleteProductModalProps {
  product: { id: string; title: string; image: string | null } | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteProductModal({ product, onClose, onDeleted }: DeleteProductModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stores, setStores] = useState<ProductStoreRef[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<ProductPushResultDTO[] | null>(null);

  useEffect(() => {
    if (!product) {
      setLoading(true);
      setStores([]);
      setResults(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await getProduct(product.id);
        const affected = res.ownStore ? [res.ownStore, ...res.siblings] : res.siblings;
        setStores(affected);
        setSelected(new Set(affected.map((s) => s.storeId)));
      } catch {
        toast.push('Could not load this product.', 'info');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  if (!product) return null;

  const toggleStore = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await deleteProduct(product.id, [...selected]);
      setResults(res.results);
      const successCount = res.results.filter((r) => r.success).length;
      if (successCount > 0) {
        toast.push(`Deleted "${product.title}" from ${successCount} store${successCount === 1 ? '' : 's'}.`);
        onDeleted();
      }
    } catch {
      toast.push('Could not delete this product.', 'info');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={Boolean(product)} onClose={onClose} title="Delete product" subtitle={results ? undefined : 'This cannot be undone.'}>
      {results ? (
        <div className="space-y-5">
          <ProductPushSummary title={product.title} image={product.image} results={results} action="delete" />
          <button onClick={onClose} className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Done
          </button>
        </div>
      ) : loading ? (
        <div className="py-10 text-center text-sm text-slate-400">Loading...</div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>
              This will permanently delete <span className="font-semibold">"{product.title}"</span> from the store(s) you select below —
              including on Shopify/WooCommerce itself. This cannot be undone.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Delete from</label>
            <div className="space-y-2">
              {stores.map((store) => {
                const meta = PLATFORM_META[store.platform];
                const checked = selected.has(store.storeId);
                return (
                  <label
                    key={store.storeId}
                    className={clsx(
                      'flex cursor-pointer items-center gap-3 rounded-lg border px-3.5 py-2.5 transition',
                      checked ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-white hover:bg-slate-50'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStore(store.storeId)}
                      className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg text-white', meta.color)}>
                      <meta.icon size={14} />
                    </span>
                    <span className="text-sm font-medium text-slate-800">{store.displayName}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={selected.size === 0 || submitting}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={14} />
              {submitting ? 'Deleting...' : `Delete from ${selected.size} store${selected.size === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
