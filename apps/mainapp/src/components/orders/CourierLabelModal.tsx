import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { OrderDTO } from '@zetsales/shared';
import { useAuth } from '../../context/AuthContext';
import { markOrdersPrinted } from '../../lib/commerceApi';
import { Barcode } from './Barcode';

interface CourierLabelModalProps {
  open: boolean;
  onClose: () => void;
  orders: OrderDTO[];
}

// One shipping label per physical parcel — sticker-sized, so it deliberately shows less than the
// invoice/packing slip (just what a courier rider needs: who to hand it to, where, how much COD to
// collect, and a scannable code). Falls back to printing the order number as the scannable value
// when there's no real courier tracking code yet (courier partner set manually, or the auto-dispatch
// hasn't run) — a label with nothing to scan wouldn't be usable at all.
function LabelPage({ order, businessName }: { order: OrderDTO; businessName: string }) {
  const trackingValue = order.courierTrackingId || order.courierConsignmentId || order.number;
  return (
    <div className="print-page-break flex justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-lg border-2 border-dashed border-slate-300 bg-white p-4 text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <p className="text-sm font-bold">{businessName}</p>
          <p className="text-xs font-semibold text-slate-500">{order.courierPartner ?? 'Courier'}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Deliver to</p>
          <p className="text-base font-bold">{order.customerName || 'No name'}</p>
          {order.customerPhone && <p className="text-sm">{order.customerPhone}</p>}
          {order.address && <p className="text-sm text-slate-600">{order.address}</p>}
          {order.deliveryZone && <p className="text-sm text-slate-600">{order.deliveryZone}</p>}
        </div>

        {order.paymentStatus === 'COD Pending' && (
          <div className="rounded-md bg-amber-50 px-2.5 py-2 text-center">
            <p className="text-xs font-semibold text-amber-700">Collect on delivery</p>
            <p className="text-lg font-bold text-amber-800">
              {order.currency} {order.total.toLocaleString()}
            </p>
          </div>
        )}

        <div className="border-t border-slate-200 pt-2">
          <Barcode value={trackingValue} height={45} />
          <p className="mt-1 text-center text-xs font-medium tracking-wider text-slate-600">{trackingValue}</p>
        </div>

        <p className="text-center text-xs text-slate-400">Order {order.number}</p>
      </div>
    </div>
  );
}

export function CourierLabelModal({ open, onClose, orders }: CourierLabelModalProps) {
  const { user } = useAuth();
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 print:static print:block print:h-auto print:p-0">
      <div className="absolute inset-0 bg-slate-900/40 print:hidden" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:static print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 print:hidden">
          <div>
            <h2 className="text-base font-bold text-slate-900">Courier label{orders.length > 1 ? `s (${orders.length})` : ''}</h2>
            <p className="mt-0.5 text-sm text-slate-500">Preview below, then print.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                window.print();
                void markOrdersPrinted(orders.map((o) => o.id)).catch(() => {});
              }}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="print-area overflow-y-auto print:overflow-visible">
          {orders.map((order) => (
            <LabelPage key={order.id} order={order} businessName={user?.businessName || 'Your Business'} />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
