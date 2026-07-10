import { useEffect, useState } from 'react';
import { Check, PackageCheck, Truck } from 'lucide-react';
import clsx from 'clsx';
import type { OrderDTO } from '@zetsales/shared';
import { Modal } from '../ui/Modal';
import { resolveBin, type BinLookup } from './binLookup';

interface PackOrderModalProps {
  open: boolean;
  order: OrderDTO | null;
  onClose: () => void;
  onConfirm: () => void;
  binLookup?: BinLookup;
  busy?: boolean;
}

// The pick + outbound QC step, combined into one checklist — for the common case where the same
// person who grabs the item off the shelf is also the one checking it's right before it's sealed
// into a box. Mirrors the Returns "combined" one-step flow (ReceiveAndQcPackageCard) on the
// inventory side: two logically separate jobs, one physical motion, so one screen. A seller with a
// dedicated packing team can still tell staff to only check the box once it's physically verified —
// nothing here enforces a specific person does the checking.
export function PackOrderModal({ open, order, onClose, onConfirm, binLookup, busy }: PackOrderModalProps) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) setChecked(new Set());
  }, [open, order?.id]);

  if (!order) return null;

  const allChecked = order.lineItems.length > 0 && checked.size === order.lineItems.length;

  const toggle = (i: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Pick & pack this order" subtitle="Check off each item as you grab and verify it." widthClass="max-w-md">
      <div className="space-y-2">
        {order.lineItems.map((li, i) => {
          const isChecked = checked.has(i);
          const bin = resolveBin(binLookup, li.sku, order.fulfillmentWarehouseId);
          return (
            <button
              key={i}
              onClick={() => toggle(i)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                isChecked ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
              )}
            >
              <div
                className={clsx(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                  isChecked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                )}
              >
                {isChecked && <Check size={14} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-800">{li.title}</p>
                <p className="text-xs text-slate-400">
                  {li.variant ? `${li.variant} · ` : ''}Qty {li.quantity}
                  {li.sku ? ` · ${li.sku}` : ''}
                </p>
              </div>
              <div className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                Bin: {bin}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={onConfirm}
        disabled={!allChecked || busy}
        className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {allChecked ? <Truck size={14} /> : <PackageCheck size={14} />}
        {allChecked ? 'Confirm & hand over to courier' : `Check off all ${order.lineItems.length} item${order.lineItems.length === 1 ? '' : 's'} to continue`}
      </button>
    </Modal>
  );
}
