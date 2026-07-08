import { useEffect, useState } from 'react';
import clsx from 'clsx';
import type { AdChannel } from '@zetsales/shared';
import { createAdCost, type AdCostPayload } from '../../lib/commerceApi';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';
import { ProductPicker, type PickedProduct } from './ProductPicker';

const CHANNELS: AdChannel[] = ['Meta', 'TikTok', 'Google', 'Other'];

export function LogAdCostModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [channel, setChannel] = useState<AdChannel | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setProduct(null);
      setChannel(null);
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
      setNote('');
    }
  }, [open]);

  const canSave = !!product && !!channel && amount.trim() !== '' && Number(amount) > 0 && date.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave || !product || !channel) return;
    setSaving(true);
    try {
      const payload: AdCostPayload = { productId: product.id, productTitle: product.title, channel, amount: Number(amount), date, note: note.trim() || undefined };
      await createAdCost(payload);
      toast.push('Ad cost logged.', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || 'Could not save this ad cost.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log ad cost" subtitle="What you actually spent on a product across a channel — used to calculate real CPA." widthClass="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Product</label>
          <ProductPicker value={product} onChange={setProduct} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Channel</label>
          <div className="grid grid-cols-4 gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c}
                onClick={() => setChannel(c)}
                className={clsx(
                  'h-9 rounded-lg border text-xs font-semibold transition-colors',
                  channel === c ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Amount (৳)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. July retargeting campaign"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Log ad cost'}
        </button>
      </div>
    </Modal>
  );
}
