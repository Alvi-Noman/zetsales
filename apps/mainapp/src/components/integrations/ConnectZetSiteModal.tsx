import { Zap } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { zetsiteOAuthStartUrl } from '../../lib/commerceApi';

interface ConnectZetSiteModalProps {
  open: boolean;
  onClose: () => void;
}

// OAuth-only, unlike the Shopify/WooCommerce modals — zetsite has no manual key/token fallback,
// and no shop-domain field to fill in: the consent screen resolves which store is connecting from
// the merchant's own zetsite login session, so there's nothing to configure here besides starting
// the redirect. The actual connection completes on IntegrationsPage's return-from-OAuth handling,
// the same ?connected=<platform> query param flow Shopify/WooCommerce OAuth already use.
export function ConnectZetSiteModal({ open, onClose }: ConnectZetSiteModalProps) {
  const handleConnect = () => {
    window.location.href = zetsiteOAuthStartUrl();
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect a ZetSite store" subtitle="Add one of your ZetSite storefronts to ZetSales.">
      <div className="space-y-5">
        <p className="text-sm text-slate-600">
          You'll be sent to ZetSite to sign in (if needed) and approve the connection. Once approved, your products and orders start
          syncing both ways automatically.
        </p>
        <button
          type="button"
          onClick={handleConnect}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Zap size={15} /> Connect with ZetSite
        </button>
      </div>
    </Modal>
  );
}
