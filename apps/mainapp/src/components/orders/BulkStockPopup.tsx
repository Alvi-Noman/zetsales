import { useEffect, useState } from 'react';
import { AlertTriangle, Split } from 'lucide-react';
import clsx from 'clsx';
import type { OrderDTO } from '@zetsales/shared';
import { Modal } from '../ui/Modal';
import { summarizeOrderStock, type StockLookup } from './stockLookup';

export type BulkStockPopupMode = 'confirm' | 'pack';

export interface BulkStockResolution {
  // Mixed orders the agent chose to split — call splitOrder for each, then fold the returned
  // ready-remainder id into whatever bulk action actually proceeds.
  splitIds: string[];
  // Fully-short orders the agent chose to proceed with anyway (confirm mode only — pack mode never
  // offers this, since the fulfillment gate would reject a zero-stock order regardless).
  fullyShortProceedIds: string[];
}

interface BulkStockPopupProps {
  open: boolean;
  mode: BulkStockPopupMode;
  mixedOrders: OrderDTO[];
  fullyShortOrders: OrderDTO[];
  readyCount: number;
  stockLookup?: StockLookup;
  busy: boolean;
  onClose: () => void;
  onProceed: (resolution: BulkStockResolution) => void;
}

// Sits between "click the bulk action" and "it actually happens" whenever the selection contains
// an order this app can't just wave through silently — the badge on the Orders list is a hint you
// might miss; this is the same check turned into an actual checkpoint at the moment it matters
// (bulk confirm, or bulk send-to-packing). A clean selection with no mixed/fully-short orders never
// triggers this at all — it's only shown when there's something to decide.
export function BulkStockPopup({ open, mode, mixedOrders, fullyShortOrders, readyCount, stockLookup, busy, onClose, onProceed }: BulkStockPopupProps) {
  const [splitChoices, setSplitChoices] = useState<Record<string, boolean>>({});
  const [fullyShortChoices, setFullyShortChoices] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    // Splitting defaults on (it's the point of this popup); proceeding with a fully-short order
    // anyway defaults off — that's the unusual choice, not the safe one.
    setSplitChoices(Object.fromEntries(mixedOrders.map((o) => [o.id, true])));
    setFullyShortChoices(Object.fromEntries(fullyShortOrders.map((o) => [o.id, false])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const splitCount = mixedOrders.filter((o) => splitChoices[o.id]).length;
  const skippedMixedCount = mixedOrders.length - splitCount;
  const proceedFullyShortCount = mode === 'confirm' ? fullyShortOrders.filter((o) => fullyShortChoices[o.id]).length : 0;
  const skippedFullyShortCount = fullyShortOrders.length - proceedFullyShortCount;
  const totalProceeding = readyCount + splitCount + proceedFullyShortCount;
  const totalSkipped = skippedMixedCount + skippedFullyShortCount;

  const actionVerb = mode === 'confirm' ? 'confirmed' : 'sent to packing';
  const actionLabel =
    mode === 'confirm'
      ? 'Confirm selected'
      : totalProceeding === 0
        ? 'Nothing to send'
        : splitCount > 0
          ? 'Split & send to packing'
          : 'Send to packing';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === 'confirm' ? 'Some selected orders have stock issues' : "Some selected orders aren't fully ready to pack"}
      subtitle={
        mode === 'confirm'
          ? 'Review each one below, then decide whether to split it or leave it for later.'
          : 'A packing slip only helps if what it lists is actually on the shelf — review these before printing.'
      }
      widthClass="max-w-xl"
    >
      <div className="space-y-4">
        {mixedOrders.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Mixed stock — some items ready, some not ({mixedOrders.length})
            </p>
            <div className="space-y-2">
              {mixedOrders.map((order) => {
                const { shortItems } = summarizeOrderStock(order.lineItems, stockLookup);
                const checked = splitChoices[order.id] ?? true;
                return (
                  <label
                    key={order.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setSplitChoices((prev) => ({ ...prev, [order.id]: e.target.checked }))}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        {order.number}
                        <span className="font-normal text-slate-500">— {order.customerName || 'No name'}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Short: {shortItems.map((s) => `${s.title} (${s.free} of ${s.quantity} free)`).join(', ')}
                      </p>
                      <p className={clsx('mt-1 flex items-center gap-1 text-[11px] font-semibold', checked ? 'text-indigo-700' : 'text-slate-400')}>
                        <Split size={11} />
                        {checked
                          ? `Split — in-stock item(s) will be ${actionVerb}, the rest moves to a separate order`
                          : 'Skip — leave this order untouched for now'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {fullyShortOrders.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">No stock at all ({fullyShortOrders.length})</p>
            <div className="space-y-2">
              {fullyShortOrders.map((order) => {
                const checked = fullyShortChoices[order.id] ?? false;
                return (
                  <div key={order.id} className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2.5">
                    {mode === 'confirm' && (
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setFullyShortChoices((prev) => ({ ...prev, [order.id]: e.target.checked }))}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                        {order.number}
                        <span className="font-normal text-slate-500">— {order.customerName || 'No name'}</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">Every item on this order is out of stock right now.</p>
                      <p className={clsx('mt-1 flex items-center gap-1 text-[11px] font-semibold', checked ? 'text-indigo-700' : 'text-slate-400')}>
                        <AlertTriangle size={11} />
                        {mode === 'pack'
                          ? "Skip — can't send an empty parcel to packing"
                          : checked
                          ? `Confirm anyway — same as a normal Confirm click`
                          : 'Skip — leave this order untouched for now'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm">
          <span className="text-slate-600">
            <span className="font-semibold text-slate-900">{totalProceeding}</span> will be {actionVerb} now
            {totalSkipped > 0 && (
              <>
                {' '}
                · <span className="font-semibold text-slate-900">{totalSkipped}</span> skipped
              </>
            )}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() =>
              onProceed({
                splitIds: mixedOrders.filter((o) => splitChoices[o.id]).map((o) => o.id),
                fullyShortProceedIds: fullyShortOrders.filter((o) => fullyShortChoices[o.id]).map((o) => o.id),
              })
            }
            disabled={busy || totalProceeding === 0}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? 'Working…' : actionLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
