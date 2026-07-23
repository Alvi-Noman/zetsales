import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  // What this specific action actually destroys/changes server-side — should name the real
  // consequence (e.g. "permanently delete all 42 imported products"), not a generic "are you sure".
  description: string;
  confirmLabel?: string;
  danger?: boolean;
}

// Generic yes/no gate for destructive actions, built on the existing Modal rather than a raw
// window.confirm — this codebase had zero styled confirmation dialogs before (only scattered
// window.confirm calls elsewhere), so every irreversible delete/disconnect action across the app
// can share this one instead of a bespoke dialog or an unstyled browser confirm.
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Delete",
  danger = true,
}: ConfirmDialogProps) {
  const [confirming, setConfirming] = useState(false);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title} widthClass="max-w-sm">
      <div className="flex items-start gap-3">
        {danger && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle size={17} />
          </div>
        )}
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={confirming}
          className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleConfirm()}
          disabled={confirming}
          className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {confirming ? "..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
