import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, Zap } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { connectWooKeys, startWooAuth, wooAuthStatus } from '../../lib/commerceApi';
import { useToast } from '../ui/ToastProvider';
import type { StoreDTO } from '@zetsales/shared';

interface ConnectWooCommerceModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: (store: StoreDTO) => void;
}

export function ConnectWooCommerceModal({ open, onClose, onConnected }: ConnectWooCommerceModalProps) {
  const toast = useToast();
  const [siteUrl, setSiteUrl] = useState('');
  const [consumerKey, setConsumerKey] = useState('');
  const [consumerSecret, setConsumerSecret] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleOneClick = async () => {
    setError('');
    if (!siteUrl.trim()) {
      setError('Enter your WooCommerce site URL first.');
      return;
    }
    setSubmitting(true);
    try {
      const { sessionId, authorizeUrl } = await startWooAuth(siteUrl.trim());
      window.open(authorizeUrl, '_blank', 'noopener,noreferrer');
      setWaitingForApproval(true);

      pollRef.current = setInterval(async () => {
        try {
          const status = await wooAuthStatus(sessionId);
          if (status.status === 'connected' && status.store) {
            if (pollRef.current) clearInterval(pollRef.current);
            setWaitingForApproval(false);
            toast.push(`Connected ${status.store.displayName}.`);
            onConnected(status.store);
            onClose();
          }
        } catch {
          // keep polling until the session naturally expires
        }
      }, 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the one-click connection.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeysConnect = async () => {
    setError('');
    if (!siteUrl.trim() || !consumerKey.trim() || !consumerSecret.trim()) {
      setError('Site URL, consumer key, and consumer secret are all required.');
      return;
    }
    setSubmitting(true);
    try {
      const store = await connectWooKeys(siteUrl.trim(), consumerKey.trim(), consumerSecret.trim());
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
    <Modal open={open} onClose={onClose} title="Connect a WooCommerce store" subtitle="Add one of your WooCommerce stores to ZetSales.">
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Site URL</label>
          <input
            value={siteUrl}
            onChange={(e) => setSiteUrl(e.target.value)}
            placeholder="https://my-store.com"
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

        {waitingForApproval ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-3 text-sm text-indigo-700">
            <Loader2 size={16} className="animate-spin shrink-0" />
            Waiting for you to approve in the WordPress tab that just opened...
          </div>
        ) : (
          <button
            onClick={handleOneClick}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#7f54b3] py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
            Connect with one click
          </button>
        )}

        <div className="border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Or connect with API keys</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Consumer key</label>
              <input
                value={consumerKey}
                onChange={(e) => setConsumerKey(e.target.value)}
                placeholder="ck_..."
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Consumer secret</label>
              <input
                type="password"
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                placeholder="cs_..."
                className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">In WordPress: WooCommerce → Settings → Advanced → REST API → Add key.</p>
          <button
            onClick={handleKeysConnect}
            disabled={submitting}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Connect store
          </button>
        </div>

        <a
          href="https://developer.woocommerce.com/docs/apis/rest-api/authentication/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <ExternalLink size={12} /> WooCommerce REST API authentication docs
        </a>
      </div>
    </Modal>
  );
}
