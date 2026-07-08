import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Loader2, PackagePlus, RefreshCw, ShoppingBag, Store as StoreIcon } from 'lucide-react';
import clsx from 'clsx';
import type { ProductCollectionDTO, ProductPushResultDTO, StoreDTO, SupplierProductDraftDTO } from '@zetsales/shared';
import { createProduct, listProductCollections, previewAlibabaProduct } from '../../lib/commerceApi';
import { Modal } from '../ui/Modal';
import { ProductFormFields, EMPTY_PRODUCT_FORM, type ProductFormState } from './ProductFormFields';
import { ProductPushSummary } from './ProductPushSummary';
import { useToast } from '../ui/ToastProvider';

const PLATFORM_META = {
  shopify: { label: 'Shopify collections', color: 'bg-[#95BF47]', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce categories', color: 'bg-[#7f54b3]', icon: StoreIcon },
} as const;

interface AlibabaImportModalProps {
  open: boolean;
  stores: StoreDTO[];
  onClose: () => void;
  onImported: () => void;
}

function formFromDraft(draft: SupplierProductDraftDTO): ProductFormState {
  return {
    title: draft.title,
    description: draft.description ?? '',
    category: draft.category ?? '',
    images: draft.images,
    weight: draft.weight != null ? String(draft.weight) : '',
    weightUnit: draft.weightUnit ?? 'kg',
    sourceUrl: draft.sourceUrl,
    sourcePlatform: 'alibaba',
    options: draft.options,
    variants: draft.variants.map((v) => ({
      sku: v.sku ?? '',
      price: v.price ? String(v.price) : '',
      compareAtPrice: v.compareAtPrice != null ? String(v.compareAtPrice) : '',
      optionValues: v.optionValues,
      continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock ?? true,
      title: v.optionValues.join(' / '),
    })),
  };
}

function storeTargetCount(results: ProductPushResultDTO[] | null) {
  if (!results) return 0;
  return results.filter((r) => r.success).length;
}

export function AlibabaImportModal({ open, stores, onClose, onImported }: AlibabaImportModalProps) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [draft, setDraft] = useState<SupplierProductDraftDTO | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_PRODUCT_FORM);
  const [collections, setCollections] = useState<ProductCollectionDTO[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collectionSelections, setCollectionSelections] = useState<Record<string, Set<string>>>({});
  const [results, setResults] = useState<ProductPushResultDTO[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(stores.map((store) => store.id)));
  }, [open, stores]);

  useEffect(() => {
    if (!open || stores.length === 0) return;
    setCollectionsLoading(true);
    listProductCollections(stores.map((store) => store.id))
      .then((res) => setCollections(res.collections))
      .catch(() => toast.push('Could not load store collections.', 'info'))
      .finally(() => setCollectionsLoading(false));
  }, [open, stores, toast]);

  const collectionsByStore = useMemo(() => {
    const map = new Map<string, ProductCollectionDTO[]>();
    for (const collection of collections) {
      const list = map.get(collection.storeId) ?? [];
      list.push(collection);
      map.set(collection.storeId, list);
    }
    return map;
  }, [collections]);

  const toggleStore = (storeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  };

  const toggleCollection = (storeId: string, collectionId: string) => {
    setCollectionSelections((prev) => {
      const current = new Set(prev[storeId] ?? []);
      if (current.has(collectionId)) current.delete(collectionId);
      else current.add(collectionId);
      return { ...prev, [storeId]: current };
    });
  };

  const handlePreview = async () => {
    if (!url.trim()) return;
    setPreviewing(true);
    setResults(null);
    try {
      const res = await previewAlibabaProduct(url.trim());
      setDraft(res.draft);
      setForm(formFromDraft(res.draft));
    } catch (err: any) {
      toast.push(err?.response?.data?.message || 'Could not preview this Alibaba URL.', 'info');
    } finally {
      setPreviewing(false);
    }
  };

  const canPublish =
    Boolean(draft) &&
    form.title.trim().length > 0 &&
    form.variants.length > 0 &&
    form.variants.every((v) => v.price.trim().length > 0) &&
    selected.size > 0 &&
    !publishing;

  const handlePublish = async () => {
    if (!draft || !canPublish) return;
    setPublishing(true);
    try {
      const res = await createProduct({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category.trim() || undefined,
        images: form.images,
        weight: form.weight.trim() ? Number(form.weight) : undefined,
        weightUnit: form.weightUnit,
        sourceUrl: draft.sourceUrl,
        sourcePlatform: 'alibaba',
        options: form.options,
        variants: form.variants.map((v) => ({
          sku: v.sku.trim() || undefined,
          price: Number(v.price) || 0,
          compareAtPrice: v.compareAtPrice.trim() ? Number(v.compareAtPrice) : undefined,
          optionValues: v.optionValues,
          continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock,
        })),
        storeTargets: [...selected].map((storeId) => ({
          storeId,
          collectionIds: [...(collectionSelections[storeId] ?? [])].filter((id) => !id.startsWith('__error__:')),
        })),
      });
      setResults(res.results);
      onImported();
      const successCount = storeTargetCount(res.results);
      toast.push(successCount > 0 ? `Imported to ${successCount} store${successCount === 1 ? '' : 's'}.` : 'No stores accepted this product.', successCount > 0 ? 'success' : 'info');
    } catch (err: any) {
      toast.push(err?.response?.data?.message || 'Could not publish this product.', 'info');
    } finally {
      setPublishing(false);
    }
  };

  const resetAndClose = () => {
    setUrl('');
    setDraft(null);
    setForm(EMPTY_PRODUCT_FORM);
    setResults(null);
    setCollectionSelections({});
    onClose();
  };

  return (
    <Modal open={open} onClose={resetAndClose} title="Import from Alibaba" subtitle="Preview, edit, then publish to selected connected stores." widthClass="max-w-6xl">
      {results ? (
        <div className="space-y-5">
          <ProductPushSummary title={form.title.trim()} image={form.images[0] ?? null} results={results} />
          <div className="flex justify-end">
            <button onClick={resetAndClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              Done
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handlePreview();
              }}
              placeholder="Paste an Alibaba.com product URL"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
            <button
              onClick={handlePreview}
              disabled={previewing || !url.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {previewing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Preview
            </button>
          </div>

          {draft && (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <div className="flex items-start gap-2 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Review before publishing</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {draft.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0">
                  <ProductFormFields value={form} onChange={setForm} />
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-600">Publish targets</label>
                      <span className="text-xs text-slate-400">{selected.size} selected</span>
                    </div>
                    <div className="space-y-2">
                      {stores.map((store) => {
                        const meta = PLATFORM_META[store.platform];
                        const checked = selected.has(store.id);
                        const Icon = meta.icon;
                        const storeCollections = collectionsByStore.get(store.id) ?? [];
                        return (
                          <div key={store.id} className={clsx('rounded-lg border p-3', checked ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white')}>
                            <label className="flex cursor-pointer items-center gap-2">
                              <input type="checkbox" checked={checked} onChange={() => toggleStore(store.id)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                              <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg text-white', meta.color)}>
                                <Icon size={14} />
                              </span>
                              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{store.displayName}</span>
                            </label>

                            {checked && (
                              <div className="mt-3">
                                <div className="mb-1.5 flex items-center justify-between">
                                  <p className="text-xs font-semibold text-slate-500">{meta.label}</p>
                                  {collectionsLoading && <Loader2 size={12} className="animate-spin text-slate-400" />}
                                </div>
                                <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
                                  {storeCollections.length === 0 ? (
                                    <p className="px-1 py-1 text-xs text-slate-400">No collections loaded.</p>
                                  ) : (
                                    storeCollections.map((collection) => (
                                      <label key={collection.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-600 hover:bg-slate-50">
                                        <input
                                          type="checkbox"
                                          disabled={collection.id.startsWith('__error__:')}
                                          checked={Boolean(collectionSelections[store.id]?.has(collection.id))}
                                          onChange={() => toggleCollection(store.id, collection.id)}
                                          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="min-w-0 flex-1 truncate">{collection.name}</span>
                                      </label>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">Source</p>
                    <a href={draft.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-indigo-600 hover:text-indigo-700">
                      <ExternalLink size={12} /> {draft.sourceUrl}
                    </a>
                    {draft.rawPriceText && <p className="mt-1">Detected supplier price: {draft.rawPriceText}</p>}
                    {draft.supplierName && <p className="mt-1">Supplier: {draft.supplierName}</p>}
                  </div>

                  <button
                    onClick={handlePublish}
                    disabled={!canPublish}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {publishing ? <Loader2 size={14} className="animate-spin" /> : <PackagePlus size={14} />}
                    Publish to {selected.size} store{selected.size === 1 ? '' : 's'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
