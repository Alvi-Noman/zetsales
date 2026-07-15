import { Ban, PhoneCall, PauseCircle, X, Printer, FileText, ClipboardList, Tag, Scissors, Banknote, Truck, Package, ShieldAlert } from 'lucide-react';
import type { HoldReason } from '@zetsales/shared';
import { ALL_CANCEL_REASONS } from './reasons';
import { ReasonNoteMenu } from './ReasonNoteMenu';
import { Popover } from '../ui/Popover';
import { AppBlock } from '../apps/AppBlock';

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  // Each of these three is undefined when nothing in the current selection is actually eligible
  // (e.g. Confirm when everything selected is already past Pending/Flagged) — same "only renders
  // when the caller gives us a handler" contract as onMarkCollected below, so a nonsensical action
  // never shows up in the first place rather than silently no-op'ing (or worse) against orders it
  // doesn't apply to.
  onConfirm?: () => void;
  // Undefined unless at least one selected order is actually in Processing.
  onMarkShipped?: () => void;
  onHandOverToCourier?: () => void;
  // Undefined unless at least one selected order is actually Confirmed. Independent of printing —
  // this advances Confirmed -> Processing on its own, running the same stock-check popup as the
  // print flow does, for sellers who don't want packing gated behind printing a slip.
  onSendToPacking?: () => void;
  onHold?: (reason: string, note: string, rescheduledFor: string | null) => void;
  onCancel?: (reason: string, note: string) => void;
  onPrintInvoices: () => void;
  // Undefined unless at least one selected order has actually reached packing (see
  // canPrintPackingSlip) — packing slips/the combined sheet aren't offered for a selection that's
  // still Pending/Flagged/Confirmed.
  onPrintPackingSlips?: () => void;
  onPrintCombined?: () => void;
  onPrintLabels: () => void;
  // Undefined when nothing in the current selection is an eligible (COD, not-yet-collected) order —
  // the button only renders when the caller gives us a handler, so there's nothing to click that
  // would just no-op against the whole selection.
  onMarkCollected?: () => void;
  // Undefined unless the Fraud Checker app is installed — re-runs the auto-flag heuristic against
  // the current selection (fills the admin.orders.index.bulk-action extension target).
  onRecheckFraud?: () => void;
  // Which hold reasons make sense depends on the stage(s) of whatever's currently selected — the
  // caller resolves that (it's the one that knows the selection), this just renders whatever list
  // it's given.
  holdReasons: HoldReason[];
  busy?: boolean;
}

export function BulkActionBar({
  count, onClear, onConfirm, onMarkShipped, onHandOverToCourier, onSendToPacking, onHold, onCancel, onPrintInvoices, onPrintPackingSlips, onPrintCombined, onPrintLabels, onMarkCollected, onRecheckFraud, holdReasons, busy,
}: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
      <div className="pointer-events-auto flex animate-pop-in items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/95 px-3 py-2 text-white shadow-2xl shadow-slate-900/30 backdrop-blur">
        <button onClick={onClear} className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white">
          <X size={14} />
        </button>
        <span className="pr-1 text-sm font-semibold tabular-nums">
          {count} selected
        </span>
        <div className="h-5 w-px bg-white/10" />
        {onConfirm && (
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
          >
            <PhoneCall size={13} /> Confirm
          </button>
        )}
        {onSendToPacking && (
          <button
            onClick={onSendToPacking}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-60"
          >
            <Package size={13} /> Send to packing
          </button>
        )}
        {onMarkShipped && (
          <button
            onClick={onMarkShipped}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-60"
          >
            <Truck size={13} /> Ready for pickup
          </button>
        )}
        {onHandOverToCourier && (
          <button
            onClick={onHandOverToCourier}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-60"
          >
            <Truck size={13} /> Hand over to courier
          </button>
        )}
        <Popover
          align="right"
          widthClass="w-44"
          trigger={() => (
            <div className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer">
              <Printer size={13} /> Print
            </div>
          )}
        >
          {(close) => (
            <div className="py-1.5">
              {onPrintPackingSlips && (
                <button
                  onClick={() => {
                    close();
                    onPrintPackingSlips();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardList size={13} className="text-slate-400" /> Print packing slips
                </button>
              )}
              <button
                onClick={() => {
                  close();
                  onPrintInvoices();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <FileText size={13} className="text-slate-400" /> Invoices
              </button>
              {onPrintCombined && (
                <button
                  onClick={() => {
                    close();
                    onPrintCombined();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <Scissors size={13} className="text-slate-400" /> Invoice + Slips
                </button>
              )}
              <button
                onClick={() => {
                  close();
                  onPrintLabels();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <Tag size={13} className="text-slate-400" /> Courier labels
              </button>
            </div>
          )}
        </Popover>
        {onRecheckFraud && (
          <button
            onClick={onRecheckFraud}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-60"
          >
            <ShieldAlert size={13} /> Re-check fraud
          </button>
        )}
        <AppBlock target="admin.orders.index.bulk-action" />
        {onMarkCollected && (
          <button
            onClick={onMarkCollected}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-60"
          >
            <Banknote size={13} /> Mark COD collected
          </button>
        )}
        {onHold && (
          <ReasonNoteMenu
            title="Put selected orders on hold"
            reasons={holdReasons}
            confirmLabel="Put on hold"
            onApply={onHold}
            align="right"
            trigger={() => (
              <div className="flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 cursor-pointer">
                <PauseCircle size={13} /> Hold
              </div>
            )}
          />
        )}
        {onCancel && (
          <ReasonNoteMenu
            title="Cancel selected orders"
            reasons={ALL_CANCEL_REASONS}
            confirmLabel="Cancel orders"
            confirmTone="danger"
            onApply={onCancel}
            align="right"
            trigger={() => (
              <div className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 cursor-pointer">
                <Ban size={13} /> Cancel
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
