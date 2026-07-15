import { Modal } from '../ui/Modal';

interface ConfirmPrintPromptModalProps {
  open: boolean;
  poNumber: string;
  onPrint: () => void;
  onSkip: () => void;
}

// Shown right after a PO is confirmed (added to Incoming Stock) — from the create/edit modal's own
// "Confirm & add to Incoming Stock" action, or from the per-row Confirm button on the supplier
// page's Purchase Orders table — so printing a copy for the supplier is one click away instead of
// hunting for the print icon afterward. Same prompt either way, wired independently at each call
// site since they're two different confirm actions.
export function ConfirmPrintPromptModal({ open, poNumber, onPrint, onSkip }: ConfirmPrintPromptModalProps) {
  return (
    <Modal open={open} onClose={onSkip} title="Purchase order confirmed" subtitle={poNumber ? `${poNumber} has been added to Incoming Stock.` : undefined} widthClass="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Do you want to print this purchase order?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onSkip} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Skip
          </button>
          <button onClick={onPrint} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            Print
          </button>
        </div>
      </div>
    </Modal>
  );
}
