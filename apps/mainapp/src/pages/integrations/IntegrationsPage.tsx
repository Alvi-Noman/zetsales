import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, Megaphone, MessageCircle, Package, Plus, RefreshCw, ShoppingBag, Store as StoreIcon, Truck } from 'lucide-react';
import clsx from 'clsx';
import type { StoreDTO } from '@zetsales/shared';
import { getCapabilities, listStores, removeStore } from '../../lib/commerceApi';
import { ConnectShopifyModal } from '../../components/integrations/ConnectShopifyModal';
import { ConnectWooCommerceModal } from '../../components/integrations/ConnectWooCommerceModal';
import { CourierIntegrationsTab } from '../../components/integrations/CourierIntegrationsTab';
import { MessagingIntegrationsTab } from '../../components/integrations/MessagingIntegrationsTab';
import { AdAccountsTab } from '../../components/integrations/AdAccountsTab';
import { useToast } from '../../components/ui/ToastProvider';

type IntegrationsTab = 'stores' | 'couriers' | 'messaging' | 'adAccounts';

const INTEGRATIONS_TABS: { key: IntegrationsTab; label: string; icon: typeof StoreIcon }[] = [
  { key: 'stores', label: 'Stores', icon: StoreIcon },
  { key: 'couriers', label: 'Courier Integration', icon: Truck },
  { key: 'messaging', label: 'Messaging', icon: MessageCircle },
  { key: 'adAccounts', label: 'Ad Accounts', icon: Megaphone },
];

const PLATFORM_META = {
  shopify: { label: 'Shopify', color: 'bg-[#95BF47]', icon: ShoppingBag },
  woocommerce: { label: 'WooCommerce', color: 'bg-[#7f54b3]', icon: StoreIcon },
} as const;

function StoreCard({
  store,
  onImport,
  onRemove,
}: {
  store: StoreDTO;
  onImport: (store: StoreDTO) => void;
  onRemove: (store: StoreDTO) => void;
}) {
  const meta = PLATFORM_META[store.platform];
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <div className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white', meta.color)}>
          <meta.icon size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{store.displayName}</p>
          <p className="text-xs text-slate-400">{store.shopDomain}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden text-right sm:block">
          <p className="text-xs text-slate-400">
            {store.productCount} product{store.productCount === 1 ? '' : 's'}
          </p>
          <p className="text-[11px] text-slate-300">{store.lastSyncedAt ? `Synced ${new Date(store.lastSyncedAt).toLocaleDateString()}` : 'Never synced'}</p>
        </div>
        <span
          className={clsx(
            'rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset',
            store.status === 'connected' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-rose-50 text-rose-700 ring-rose-600/20'
          )}
        >
          {store.status === 'connected' ? 'Connected' : 'Error'}
        </span>
        {store.productCount === 0 && (
          <button
            onClick={() => onImport(store)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={12} /> Import products
          </button>
        )}
        <button onClick={() => onRemove(store)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
          <Ban size={14} />
        </button>
      </div>
    </div>
  );
}

export function IntegrationsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopifyOAuthEnabled, setShopifyOAuthEnabled] = useState(false);
  const [shopifyModalOpen, setShopifyModalOpen] = useState(false);
  const [wooModalOpen, setWooModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<IntegrationsTab>('stores');

  const load = async () => {
    setLoading(true);
    try {
      const [caps, storeList] = await Promise.all([getCapabilities(), listStores()]);
      setShopifyOAuthEnabled(caps.shopifyOAuthEnabled);
      setStores(storeList);
    } catch {
      toast.push('Could not load integrations.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    const AD_PLATFORMS = ['meta', 'tiktok', 'google'];
    if (connected === 'facebook') {
      toast.push('Connected your Facebook Business Suite.');
      setActiveTab('messaging');
    } else if (connected && AD_PLATFORMS.includes(connected)) {
      toast.push(`Connected your ${connected} ads account.`);
      setActiveTab('adAccounts');
    } else if (connected) {
      toast.push(`Connected your ${connected} store.`);
      void load();
    } else if (error === 'facebook') {
      toast.push('Could not finish connecting Facebook. Please try again.', 'info');
      setActiveTab('messaging');
    } else if (error && AD_PLATFORMS.includes(error)) {
      toast.push(`Could not finish connecting your ${error} ads account. Please try again.`, 'info');
      setActiveTab('adAccounts');
    } else if (error) {
      toast.push(`Could not finish connecting ${error}. Please try again.`, 'info');
    }
    if (connected || error) {
      searchParams.delete('connected');
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnected = (store: StoreDTO) => {
    setStores((prev) => {
      const withoutDup = prev.filter((s) => s.id !== store.id);
      return [store, ...withoutDup];
    });
  };

  const handleRemove = async (store: StoreDTO) => {
    setStores((prev) => prev.filter((s) => s.id !== store.id));
    try {
      await removeStore(store.id);
      toast.push(`Disconnected ${store.displayName}.`);
    } catch {
      toast.push('Could not disconnect this store.', 'info');
      void load();
    }
  };

  const handleImport = (store: StoreDTO) => {
    navigate(`/products?importStoreId=${store.id}`);
  };

  const shopifyCount = stores.filter((s) => s.platform === 'shopify').length;
  const wooCount = stores.filter((s) => s.platform === 'woocommerce').length;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-slate-900">Integrations</h1>
        <p className="mt-1 text-sm text-slate-500">Connect your storefronts and courier accounts — orders, products and delivery status sync in automatically.</p>
        <div className="mt-4 flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
          {INTEGRATIONS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors',
                activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <tab.icon size={14} /> {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-8 py-6">
        {activeTab === 'stores' ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#95BF47] text-white">
                    <ShoppingBag size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">Shopify</p>
                    <p className="text-xs text-slate-400">{shopifyCount} store{shopifyCount === 1 ? '' : 's'} connected</p>
                  </div>
                </div>
                <button
                  onClick={() => setShopifyModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <Plus size={14} /> Connect
                </button>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#7f54b3] text-white">
                    <StoreIcon size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">WooCommerce</p>
                    <p className="text-xs text-slate-400">{wooCount} store{wooCount === 1 ? '' : 's'} connected</p>
                  </div>
                </div>
                <button
                  onClick={() => setWooModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <Plus size={14} /> Connect
                </button>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-700">Connected stores</h2>
              {loading ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">Loading...</div>
              ) : stores.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 py-14 text-center">
                  <Package size={24} className="text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">No stores connected yet</p>
                  <p className="text-xs text-slate-400">Connect a Shopify or WooCommerce store above to start importing products and orders.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {stores.map((store) => (
                    <StoreCard key={store.id} store={store} onImport={handleImport} onRemove={handleRemove} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'couriers' ? (
          <CourierIntegrationsTab />
        ) : activeTab === 'adAccounts' ? (
          <AdAccountsTab />
        ) : (
          <MessagingIntegrationsTab />
        )}
      </div>

      <ConnectShopifyModal
        open={shopifyModalOpen}
        onClose={() => setShopifyModalOpen(false)}
        oauthEnabled={shopifyOAuthEnabled}
        onConnected={handleConnected}
      />
      <ConnectWooCommerceModal open={wooModalOpen} onClose={() => setWooModalOpen(false)} onConnected={handleConnected} />
    </div>
  );
}
