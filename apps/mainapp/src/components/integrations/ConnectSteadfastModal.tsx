import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { connectSteadfast } from '../../lib/commerceApi';
import { useToast } from '../ui/ToastProvider';
import type { CourierAccountDTO } from '@zetsales/shared';

interface ConnectSteadfastModalProps {
  open: boolean;
  onClose: () => void;
  onConnected: (courier: CourierAccountDTO) => void;
}

export function ConnectSteadfastModal({ open, onClose, onConnected }: ConnectSteadfastModalProps) {
  const toast = useToast();
  const [apiKey, setApiKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setError('');
    if (!apiKey.trim() || !secretKey.trim()) {
      setError('API key and secret key are both required.');
      return;
    }
    setSubmitting(true);
    try {
      const { courier } = await connectSteadfast({ apiKey: apiKey.trim(), secretKey: secretKey.trim() });
      toast.push('Connected Steadfast.');
      onConnected(courier);
      setApiKey('');
      setSecretKey('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect Steadfast.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Connect Steadfast" subtitle="Add your Steadfast Courier account to ZetSales.">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">API key</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Secret key</label>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
          />
          <p className="mt-1.5 text-xs text-slate-400">Steadfast merchant panel → Settings → API Credentials.</p>
        </div>

        {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

        <button
          onClick={handleConnect}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          Connect Steadfast
        </button>
      </div>
    </Modal>
  );
}
