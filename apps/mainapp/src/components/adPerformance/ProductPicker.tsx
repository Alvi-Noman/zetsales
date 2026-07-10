import { useEffect, useState } from 'react';
import { ChevronDown, Package, Search } from 'lucide-react';
import clsx from 'clsx';
import type { ProductListItemDTO } from '@zetsales/shared';
import { listProducts } from '../../lib/commerceApi';
import { Popover } from '../ui/Popover';

export interface PickedProduct {
  id: string;
  title: string;
  url?: string | null;
}

interface ProductPickerProps {
  value: PickedProduct | null;
  onChange: (product: PickedProduct) => void;
  // Scopes results to one store's catalog (e.g. when creating an order for a specific store) —
  // omitted entirely keeps the original tenant-wide search this component started with.
  storeId?: string;
}

// A searchable product combobox on top of the generic Popover primitive (see FilterMenu for why a
// plain options list isn't reused here — the product catalog can be far larger than a store/
// payment-status filter, so results are fetched per keystroke via listProducts({ search }) instead
// of being loaded upfront).
export function ProductPicker({ value, onChange, storeId }: ProductPickerProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ProductListItemDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void listProducts({ search: search.trim() || undefined, storeId, pageSize: 20 })
        .then((res) => {
          if (!cancelled) setResults(res.products);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, storeId]);

  return (
    <Popover
      align="left"
      widthClass="w-80"
      trigger={() => (
        <div className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
          <Package size={14} className="shrink-0 text-slate-400" />
          <span className={clsx('flex-1 truncate', !value && 'text-slate-400')}>{value?.title ?? 'Select a product'}</span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="h-8 w-full bg-transparent text-xs outline-none"
            />
          </div>
          <div className="mt-1.5 max-h-64 overflow-y-auto">
            {loading ? (
              <p className="px-2.5 py-4 text-center text-xs text-slate-400">Searching...</p>
            ) : results.length === 0 ? (
              <p className="px-2.5 py-4 text-center text-xs text-slate-400">No products found.</p>
            ) : (
              results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onChange({ id: p.id, title: p.title, url: p.url });
                    close();
                  }}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left',
                    value?.id === p.id ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  )}
                >
                  {p.image ? (
                    <img src={p.image} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-400">
                      <Package size={13} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{p.title}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Popover>
  );
}
