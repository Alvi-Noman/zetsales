import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { StoreDTO } from '@zetsales/shared';
import { ShopifyLogo, WooCommerceLogo } from '../orders/platformLogos';

const PLATFORM_META = {
  shopify: { label: 'Shopify', logo: ShopifyLogo },
  woocommerce: { label: 'WooCommerce', logo: WooCommerceLogo },
} as const;

function relativeTime(value: string | null): string {
  if (!value) return 'Never synced';
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.floor(hours / 24)}d ago`;
}

export function ChannelOverviewCard({ store }: { store: StoreDTO }) {
  const navigate = useNavigate();
  const meta = PLATFORM_META[store.platform];

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
          <meta.logo size={20} className="shrink-0 rounded" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">{store.displayName}</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {store.productCount.toLocaleString()} products &middot; {store.orderCount.toLocaleString()} orders
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span
          className={clsx(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
            store.status === 'connected' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-rose-600/20'
          )}
        >
          {store.status === 'connected' ? 'Connected' : 'Error'}
        </span>
        <button onClick={() => navigate('/integrations')} className="text-[11px] font-medium text-slate-400 hover:text-indigo-600">
          {relativeTime(store.lastSyncedAt)}
        </button>
      </div>
    </div>
  );
}
