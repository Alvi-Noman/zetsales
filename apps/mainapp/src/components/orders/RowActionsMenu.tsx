import { useState } from 'react';
import { Ban, Check, Copy, Eye, MoreVertical, PhoneCall } from 'lucide-react';
import clsx from 'clsx';
import type { OrderDTO } from '@zetsales/shared';
import { Popover } from '../ui/Popover';
import { canCancel, inferCancelReason } from './reasons';

interface RowActionsMenuProps {
  order: OrderDTO;
  onView: () => void;
  onConfirm: () => void;
  onCancel: (reason: ReturnType<typeof inferCancelReason>) => void;
}

// A deliberate click target for quick single-row actions — the row itself only opens the drawer,
// so nothing here fires by accident the way the old hover-confirm button did.
export function RowActionsMenu({ order, onView, onConfirm, onCancel }: RowActionsMenuProps) {
  const [copied, setCopied] = useState(false);
  const canConfirm = order.stage === 'Pending' || order.stage === 'Flagged';

  return (
    <Popover
      align="right"
      widthClass="w-44"
      trigger={() => (
        <div className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer">
          <MoreVertical size={15} />
        </div>
      )}
    >
      {(close: () => void) => (
        <div className="py-1.5">
          <button
            onClick={() => {
              close();
              onView();
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Eye size={13} className="text-slate-400" /> View details
          </button>
          {canConfirm && (
            <button
              onClick={() => {
                close();
                onConfirm();
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <PhoneCall size={13} className="text-slate-400" /> Confirm order
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(order.number);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} className="text-slate-400" />}
            {copied ? 'Copied' : 'Copy order ID'}
          </button>
          {canCancel(order.stage) && (
            <button
              onClick={() => {
                close();
                onCancel(inferCancelReason(order));
              }}
              className={clsx('flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50')}
            >
              <Ban size={13} /> Cancel order
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
