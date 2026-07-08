import { createPortal } from 'react-dom';
import { Package, Printer, Scissors, X } from 'lucide-react';
import type { OrderDTO, OrderLineItemDTO } from '@zetsales/shared';
import { useAuth } from '../../context/AuthContext';
import { formatAbsoluteDateTime } from './time';
import { resolveBin, type BinLookup } from './binLookup';
import { Barcode } from './Barcode';

export type PrintDocType = 'invoice' | 'packingSlip' | 'combined';

interface PrintOrderModalProps {
  open: boolean;
  onClose: () => void;
  orders: OrderDTO[];
  docType: PrintDocType;
  binLookup?: BinLookup;
}

const DOC_LABEL: Record<PrintDocType, string> = { invoice: 'Invoice', packingSlip: 'Packing Slip', combined: 'Invoice + Slip' };

// Letterhead-style header shared by both documents — a business's own name is the one thing that
// should read as the most important word on the page, so it's set larger than everything else,
// with the document type as a small stamp-like badge next to it rather than competing for space.
function DocHeader({ businessName, label, order, compact }: { businessName: string; label: string; order: OrderDTO; compact?: boolean }) {
  return (
    <div className={compact ? 'mb-4 flex items-start justify-between' : 'mb-6 flex items-start justify-between'}>
      <div className="flex items-center gap-2.5">
        <h1 className={compact ? 'text-base font-bold tracking-tight text-slate-900' : 'text-2xl font-bold tracking-tight text-slate-900'}>{businessName}</h1>
        <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700">{label}</span>
      </div>
      <div className="text-right text-sm">
        <p className="font-semibold text-slate-900">{order.number}</p>
        <p className="text-slate-400">{compact ? (order.customerName || 'No name') : formatAbsoluteDateTime(order.createdAt)}</p>
      </div>
    </div>
  );
}

function DocMeta({ order }: { order: OrderDTO }) {
  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer</p>
          <p className="font-semibold text-slate-800">{order.customerName || 'No name'}</p>
          {order.customerPhone && <p className="text-slate-600">{order.customerPhone}</p>}
          {order.address && <p className="text-slate-600">{order.address}</p>}
        </div>
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment</p>
          <p className="font-semibold text-slate-800">{order.paymentMethod}</p>
          <p className="text-slate-600">{order.paymentStatus}</p>
        </div>
      </div>
      {order.courierPartner && (
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivery</p>
          <p className="font-semibold text-slate-800">{order.courierPartner}</p>
          {order.courierTrackingId && <p className="text-slate-600">Tracking: {order.courierTrackingId}</p>}
        </div>
      )}
    </div>
  );
}

function ItemThumb({ item }: { item: OrderLineItemDTO }) {
  if (item.image) {
    return <img src={item.image} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-slate-100 object-cover" />;
  }
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
      <Package size={16} className="text-slate-300" />
    </div>
  );
}

// `mode="price"` for the invoice (customer-facing, what they paid); `mode="bin"` for the packing
// slip (warehouse-facing, where to physically find it) — same items, same table shape, only the
// third column changes, since those are the only two things each audience actually needs to know.
function ItemsTable({ order, mode, binLookup }: { order: OrderDTO; mode: 'price' | 'bin'; binLookup?: BinLookup }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <th className="pb-2">Item</th>
          <th className="pb-2 text-center">Qty</th>
          <th className={mode === 'price' ? 'pb-2 text-right' : 'pb-2'}>{mode === 'price' ? 'Price' : 'Bin'}</th>
        </tr>
      </thead>
      <tbody>
        {order.lineItems.map((li, i) => (
          <tr key={i} className="border-b border-slate-100 even:bg-slate-50/60">
            <td className="py-2.5">
              <div className="flex items-center gap-3">
                <ItemThumb item={li} />
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">{li.title}</p>
                  <p className="truncate text-xs text-slate-400">
                    {li.variant ? `${li.variant} · ` : ''}
                    {li.sku ?? 'No SKU'}
                  </p>
                </div>
              </div>
            </td>
            <td className="py-2.5 text-center tabular-nums text-slate-600">{li.quantity}</td>
            {mode === 'price' ? (
              <td className="py-2.5 text-right tabular-nums font-medium text-slate-800">
                {order.currency} {(li.price * li.quantity).toLocaleString()}
              </td>
            ) : (
              <td className="py-2.5 text-slate-600">{resolveBin(binLookup, li.sku, order.fulfillmentWarehouseId)}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function InvoiceTotals({ order }: { order: OrderDTO }) {
  return (
    <div className="mt-4 ml-auto w-64 space-y-1.5 text-sm">
      <div className="flex justify-between text-slate-500">
        <span>Subtotal</span>
        <span className="tabular-nums">
          {order.currency} {order.subtotal.toLocaleString()}
        </span>
      </div>
      <div className="flex justify-between text-slate-500">
        <span>Shipping</span>
        <span className="tabular-nums">
          {order.currency} {order.shippingFee.toLocaleString()}
        </span>
      </div>
      {order.discount > 0 && (
        <div className="flex justify-between text-slate-500">
          <span>Discount</span>
          <span className="tabular-nums">
            -{order.currency} {order.discount.toLocaleString()}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 font-bold text-indigo-900">
        <span>Total</span>
        <span className="tabular-nums text-base">
          {order.currency} {order.total.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function CodCallout({ order }: { order: OrderDTO }) {
  return (
    <div className="mt-4 ml-auto w-64 rounded-lg bg-amber-50 px-3 py-2 text-right text-sm font-semibold text-amber-800">
      Collect (COD): {order.currency} {order.total.toLocaleString()}
    </div>
  );
}

// Every invoice carries a scannable barcode of its own order number — handy for a business that
// keeps its own paper trail (matching a returned invoice back to an order by scanner rather than
// squinting at a number), independent of whatever a courier's own tracking barcode says.
function InvoiceBarcode({ order }: { order: OrderDTO }) {
  return (
    <div className="mt-6 flex flex-col items-center border-t border-dashed border-slate-200 pt-4">
      <div className="w-48">
        <Barcode value={order.number} height={36} />
      </div>
      <p className="mt-1 text-center text-[11px] font-medium tracking-wider text-slate-500">{order.number}</p>
      <p className="mt-2 text-center text-xs text-slate-400">Thank you for your order.</p>
    </div>
  );
}

function InvoiceBody({ order, businessName }: { order: OrderDTO; businessName: string }) {
  return (
    <>
      <DocHeader businessName={businessName} label="Invoice" order={order} />
      <DocMeta order={order} />
      <ItemsTable order={order} mode="price" />
      <InvoiceTotals order={order} />
      <InvoiceBarcode order={order} />
    </>
  );
}

function PackingSlipBody({ order, businessName, binLookup, compact }: { order: OrderDTO; businessName: string; binLookup?: BinLookup; compact?: boolean }) {
  return (
    <>
      <DocHeader businessName={businessName} label="Packing Slip" order={order} compact={compact} />
      {!compact && <DocMeta order={order} />}
      <ItemsTable order={order} mode="bin" binLookup={binLookup} />
      {order.paymentStatus === 'COD Pending' && <CodCallout order={order} />}
    </>
  );
}

// One order per printed page. An invoice shows prices (it's the customer-facing, money document);
// a packing slip shows bin locations instead (it's the warehouse-facing, "what to grab" document).
// Deliberately two different documents rather than one with a toggle, since they go to different
// physical destinations — the invoice rides inside the box, the packing slip stays on the floor.
function DocumentPage({ order, docType, binLookup, businessName }: { order: OrderDTO; docType: PrintDocType; binLookup?: BinLookup; businessName: string }) {
  return (
    <div className="print-page-break border-b border-slate-200 bg-white p-8 text-slate-900 last:border-b-0">
      {docType === 'invoice' ? (
        <InvoiceBody order={order} businessName={businessName} />
      ) : (
        <PackingSlipBody order={order} businessName={businessName} binLookup={binLookup} />
      )}
    </div>
  );
}

function CutLine({ note }: { note: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-slate-300">
      <div className="flex-1 border-t border-dashed border-slate-300" />
      <Scissors size={13} className="shrink-0 text-slate-400" />
      <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-slate-400">{note}</span>
      <div className="flex-1 border-t border-dashed border-slate-300" />
    </div>
  );
}

// One printed sheet, two halves, meant to be cut apart after printing: the top (customer-facing,
// shows prices) rides with the box, the bottom (warehouse-facing, shows bins) stays on the floor.
// Deliberately repeats the order number/customer name on both halves — once cut, each half is a
// standalone piece of paper and needs to be traceable back to the order on its own.
function CombinedDocumentPage({ order, binLookup, businessName }: { order: OrderDTO; binLookup?: BinLookup; businessName: string }) {
  return (
    <div className="print-page-break border-b border-slate-200 bg-white p-8 text-slate-900 last:border-b-0">
      <InvoiceBody order={order} businessName={businessName} />
      <CutLine note="Cut here — packing slip below" />
      <PackingSlipBody order={order} businessName={businessName} binLookup={binLookup} compact />
    </div>
  );
}

export function PrintOrderModal({ open, onClose, orders, docType, binLookup }: PrintOrderModalProps) {
  const { user } = useAuth();
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 print:static print:block print:h-auto print:p-0">
      <div className="absolute inset-0 bg-slate-900/40 print:hidden" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:static print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 print:hidden">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {DOC_LABEL[docType]}
              {orders.length > 1 ? `s (${orders.length})` : ''}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Preview below, then print.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="print-area overflow-y-auto bg-slate-50 print:overflow-visible print:bg-white">
          {docType === 'combined' ? (
            // One sheet per order, cut in half — same layout whether it's one order from the
            // drawer or several from a bulk selection, just repeated once per order.
            orders.map((order) => (
              <CombinedDocumentPage key={order.id} order={order} binLookup={binLookup} businessName={user?.businessName || 'Your Business'} />
            ))
          ) : (
            orders.map((order) => (
              <DocumentPage key={order.id} order={order} docType={docType} binLookup={binLookup} businessName={user?.businessName || 'Your Business'} />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
