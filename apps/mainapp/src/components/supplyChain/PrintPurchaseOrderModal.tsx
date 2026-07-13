import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { PurchaseOrderDTO } from '../../lib/commerceApi';

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface PrintPurchaseOrderModalProps {
  open: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrderDTO | null;
}

// Modeled on PrintOrderModal.tsx's header/meta/line-table structure, but supplier-facing — the
// business is the sender here, not the recipient. Deliberately not built on the InvoiceTemplateDTO/
// Print Out settings system, which is scoped to customer-facing sales invoices; a PO is a distinct,
// simpler document available from both draft and confirmed states.
export function PrintPurchaseOrderModal({ open, onClose, purchaseOrder }: PrintPurchaseOrderModalProps) {
  const { user } = useAuth();
  if (!open || !purchaseOrder) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 print:static print:block print:h-auto print:p-0">
      <div className="absolute inset-0 bg-slate-900/40 print:hidden" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl print:static print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 print:hidden">
          <div>
            <h2 className="text-base font-bold text-slate-900">Purchase order {purchaseOrder.poNumber}</h2>
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

        <div className="print-area overflow-y-auto bg-slate-50 p-8 text-slate-900 print:overflow-visible print:bg-white">
          <div className="mb-6 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{user?.businessName || 'Your Business'}</h1>
              <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                Purchase Order
              </span>
            </div>
            <div className="text-right text-sm">
              <p className="font-semibold text-slate-900">{purchaseOrder.poNumber}</p>
              <p className="text-slate-400">{formatDate(purchaseOrder.createdAt)}</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4 text-sm">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Supplier</p>
              <p className="font-semibold text-slate-800">{purchaseOrder.supplierName}</p>
            </div>
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Deliver to</p>
              <p className="font-semibold text-slate-800">{purchaseOrder.warehouseName}</p>
              {purchaseOrder.expectedAt && <p className="text-slate-600">Expected {formatDate(purchaseOrder.expectedAt)}</p>}
            </div>
          </div>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-center">Qty</th>
                <th className="pb-2 text-right">Unit price</th>
                <th className="pb-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrder.lines.map((line, i) => (
                <tr key={i} className="border-b border-slate-100 even:bg-slate-50/60">
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800">{line.productTitle}</p>
                    <p className="truncate text-xs text-slate-400">
                      {line.variantLabel ? `${line.variantLabel} · ` : ''}
                      {line.sku ?? 'No SKU'}
                    </p>
                  </td>
                  <td className="py-2.5 text-center tabular-nums text-slate-600">{line.quantity}</td>
                  <td className="py-2.5 text-right tabular-nums text-slate-600">{money(line.unitPrice)}</td>
                  <td className="py-2.5 text-right tabular-nums font-medium text-slate-800">{money(line.quantity * line.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 ml-auto w-64 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{money(purchaseOrder.subtotal)}</span>
            </div>
            {purchaseOrder.shippingTotal > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Shipping</span>
                <span className="tabular-nums">{money(purchaseOrder.shippingTotal)}</span>
              </div>
            )}
            {purchaseOrder.dutiesTotal > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Duties</span>
                <span className="tabular-nums">{money(purchaseOrder.dutiesTotal)}</span>
              </div>
            )}
            <div className="flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 font-bold text-indigo-900">
              <span>Total</span>
              <span className="tabular-nums text-base">{money(purchaseOrder.total)}</span>
            </div>
          </div>

          {purchaseOrder.notes && (
            <div className="mt-6 rounded-xl bg-white p-4 text-sm shadow-sm">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Notes</p>
              <p className="text-slate-700">{purchaseOrder.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
