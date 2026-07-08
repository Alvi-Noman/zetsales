import { useState } from 'react';
import { ExternalLink, Loader2, Zap } from 'lucide-react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { connectShopifyCustomApp, shopifyOAuthStartUrl } from '../../lib/commerceApi';
import { useToast } from '../ui/ToastProvider';
import type { StoreDTO } from '@zetsales/shared';

interface ConnectShopifyModalProps {
  open: boolean;
  onClose: () => void;
  oauthEnabled: boolean;
  onConnected: (store: StoreDTO) => void;
}

type CredMode = 'client-credentials' | 'legacy-token';

export function ConnectShopifyModal({ open, onClose, oauthEnabled, onConnected }: ConnectShopifyModalProps) {
  const toast = useToast();
  const [shopDomain, setShopDomain] = useState('');
  const [mode, setMode] = useState<CredMode>('client-credentials');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleOAuth = () => {
    if (!shopDomain.trim()) {
      setError('Enter your shop domain first (e.g. my-shop or my-shop.myshopify.com).');
      return;
    }
    window.location.href = shopifyOAuthStartUrl(shopDomain.trim());
  };

  const handleConnect = async () => {
    setError('');
    if (!shopDomain.trim()) {
      setError('Shop domain is required.');
      return;
    }
    if (mode === 'client-credentials' && (!clientId.trim() || !clientSecret.trim())) {
      setError('Client ID and Client Secret are both required.');
      return;
    }
    if (mode === 'legacy-token' && !accessToken.trim()) {
      setError('Access token is required.');
      return;
    }

    setSubmitting(true);
    try {
      const store = await connectShopifyCustomApp(
        shopDomain.trim(),
        mode === 'client-credentials'
          ? { clientId: clientId.trim(), clientSecret: clientSecret.trim() }
          : { accessToken: accessToken.trim() }
      );
      toast.push(`Connected ${store.displayName}.`);
      onConnected(store);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect this store.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect a Shopify store" subtitle="Add one of your Shopify stores to ZetSales.">
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Shop domain</label>
          <input
            value={shopDomain}
            onChange={(e) => setShopDomain(e.target.value)}
            placeholder="my-shop.myshopify.com"
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
          />
          <p className="mt-1.5 text-xs text-slate-400">
            Use the <code>.myshopify.com</code> address (Settings → Domains in that store), not a custom storefront domain.
          </p>
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

        {oauthEnabled && (
          <>
            <button
              onClick={handleOAuth}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#95BF47] py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Zap size={15} /> Connect with one click
            </button>
            <p className="text-center text-xs text-slate-400">Only works for stores under ZetSales' own Shopify Partner organization.</p>
          </>
        )}

        <div className="border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setMode('client-credentials')}
              className={clsx(
                'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                mode === 'client-credentials' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
            >
              Client ID + Secret
            </button>
            <button
              onClick={() => setMode('legacy-token')}
              className={clsx(
                'flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors',
                mode === 'legacy-token' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              )}
            >
              Access token
            </button>
          </div>

          {mode === 'client-credentials' ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Client ID</label>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Client Secret</label>
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>
              <p className="text-xs text-slate-400">
                In that store's admin: Settings → Apps and sales channels → Develop apps → Build apps → create a custom app, set scopes
                (read_products, write_products, read_orders, read_customers) → Install. Use the Client ID/Secret shown there — we handle
                getting the actual access token, and refresh it automatically (it expires every 24h on Shopify's side).
              </p>
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Admin API access token</label>
              <input
                type="password"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                placeholder="shpat_..."
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
              />
              <p className="mt-1.5 text-xs text-slate-400">Only applies to a custom app created before January 2026 (Shopify retired this for new apps).</p>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={submitting}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Connect store
          </button>
        </div>

        <a
          href="https://shopify.dev/docs/apps/build/authentication-authorization/client-secrets"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ExternalLink size={12} /> Shopify's Dev Dashboard custom app authentication docs
        </a>
      </div>
    </Modal>
  );
}
