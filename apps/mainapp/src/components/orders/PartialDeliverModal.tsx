import { useEffect, useState } from 'react';
import type { OrderDTO } from '@zetsales/shared';
import { markPartialDelivered } from '../../lib/commerceApi';
import { Modal } from '../ui/Modal';
import { useToast } from '../ui/ToastProvider';

interface PartialDeliverModalProps {
  open: boolean;
  order: OrderDTO | null;
  onClose: () => void;
  onApplied: () => void;
}

// A "partial delivery" isn't one fact — a customer might keep 1 of 4 shirts and hand the other 3
// straight back to the same courier. The old one-click "Partial Delivered" button couldn't capture
// that, so it silently treated the whole order's quantity as delivered. This asks for the real
// split per line item before saving anything, so only what was truly kept gets deducted from
// stock — the rest goes into the same return queue as any other RTO.
export function PartialDeliverModal({ open, order, onClose, onApplied }: PartialDeliverModalProps) {
  const toast = useToast();
  const [kept, setKept] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && order) {
      const initial: Record<number, string> = {};
      order.lineItems.forEach((li, i) => {
        initial[i] = String(li.quantity);
      });
      setKept(initial);
    }
  }, [open, order]);

  if (!order) return null;

  const submit = async () => {
    setSaving(true);
    try {
      const splits = order.lineItems.map((li, i) => ({
        sku: li.sku,
        variant: li.variant,
        keptQuantity: Math.min(li.quantity, Math.max(0, Number(kept[i]) || 0)),
      }));
      await markPartialDelivered(order.id, splits);
      toast.push('Order marked as partially delivered.', 'success');
      onApplied();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || 'Could not save this partial delivery.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Partial delivery" subtitle="How many of each item did the customer actually keep?" widthClass="max-w-lg">
      <div className="space-y-3">
        {order.lineItems.map((li, i) => {
          const keptQty = Math.min(li.quantity, Math.max(0, Number(kept[i]) || 0));
          const returnedQty = li.quantity - keptQty;
          return (
            <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
              {li.image ? (
                <img src={li.image} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-100" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{li.title}</p>
                <p className="truncate text-xs text-slate-400">
                  {li.variant ? `${li.variant} · ` : ''}Ordered {li.quantity}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div>
                  <label className="mb-0.5 block text-[10px] font-semibold text-slate-500">Kept</label>
                  <input
                    type="number"
                    min="0"
                    max={li.quantity}
                    value={kept[i] ?? ''}
                    onChange={(e) => setKept((prev) => ({ ...prev, [i]: e.target.value }))}
                    className="h-8 w-14 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
                <p className="text-xs text-slate-400">
                  Returned <span className="font-semibold text-amber-600">{returnedQty}</span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
        <button
          onClick={() => void submit()}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Confirm partial delivery'}
        </button>
      </div>
    </Modal>
  );
}
