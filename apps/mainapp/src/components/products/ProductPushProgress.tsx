import { CheckCircle2, Loader2, ShoppingBag, Store as StoreIcon, XCircle } from 'lucide-react';

const PLATFORM_ICON = {
  shopify: ShoppingBag,
  woocommerce: StoreIcon,
} as const;

export interface PushProgressItem {
  storeId: string;
  displayName: string;
  platform: 'shopify' | 'woocommerce';
  status: 'pending' | 'pushing' | 'done' | 'error';
  error?: string;
}

// Live per-store status while a product create/update is streaming (see streamProductPush in
// commerceApi.ts) — pushing to a store is several sequential API round-trips, so this shows which
// store is being worked on right now instead of a single opaque "Pushing..." wait.
export function ProductPushProgress({ items }: { items: PushProgressItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100">
      {items.map((item) => {
        const Icon = PLATFORM_ICON[item.platform];
        return (
          <div key={item.storeId} className="flex items-center gap-3 bg-white px-4 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{item.displayName}</p>
              {item.status === 'error' && <p className="truncate text-xs text-rose-600">{item.error}</p>}
              {item.status === 'pushing' && <p className="text-xs text-indigo-500">Pushing...</p>}
              {item.status === 'pending' && <p className="text-xs text-slate-400">Waiting...</p>}
            </div>
            {item.status === 'done' && <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />}
            {item.status === 'error' && <XCircle size={16} className="shrink-0 text-rose-500" />}
            {item.status === 'pushing' && <Loader2 size={16} className="shrink-0 animate-spin text-indigo-500" />}
            {item.status === 'pending' && <span className="h-2 w-2 shrink-0 rounded-full bg-slate-200" />}
          </div>
        );
      })}
    </div>
  );
}
