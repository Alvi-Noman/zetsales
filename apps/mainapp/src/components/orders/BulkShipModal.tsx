import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';

interface BulkShipModalProps {
  open: boolean;
  count: number;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  courierSummary: string;
  missingCourierCount?: number;
  courierOptions?: { value: string; label: string }[];
  selectedCourierPartner?: string;
  busy?: boolean;
  onClose: () => void;
  onCourierChange?: (courierPartner: string) => void;
  onSubmit: () => void;
}

export function BulkShipModal({
  open,
  count,
  title,
  subtitle,
  submitLabel,
  courierSummary,
  missingCourierCount = 0,
  courierOptions = [],
  selectedCourierPartner = '',
  busy,
  onClose,
  onCourierChange,
  onSubmit,
}: BulkShipModalProps) {
  const submit = () => {
    if (missingCourierCount > 0 && !selectedCourierPartner) return;
    onSubmit();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? `Mark ${count} order${count === 1 ? '' : 's'} ready for pickup`}
      subtitle={subtitle ?? 'Moves packed parcels into the pickup queue.'}
      widthClass="max-w-lg"
      bodyClassName="overflow-visible px-6 py-5"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">Courier:</span> {courierSummary}
        </div>
        {missingCourierCount > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Courier required for {missingCourierCount} order{missingCourierCount === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Existing courier choices stay unchanged. This fills only the unassigned orders.
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                Required
              </span>
            </div>
            {courierOptions.length > 0 ? (
              <Select
                value={selectedCourierPartner}
                onChange={(value) => onCourierChange?.(value)}
                options={[{ value: '', label: 'Select courier' }, ...courierOptions]}
                className="bg-white"
                menuClassName="z-50"
              />
            ) : (
              <p className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-800">
                Connect a courier account before continuing.
              </p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || (missingCourierCount > 0 && !selectedCourierPartner)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Saving...' : (submitLabel ?? 'Mark ready')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
