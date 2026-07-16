import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';

export interface HandoverDetails {
  handoverAt: string;
  pickupPersonName: string;
  pickupPersonPhone: string;
  hvCode: string;
  remark: string;
}

interface BulkShipModalProps {
  open: boolean;
  count: number;
  courierSummary: string;
  missingCourierCount?: number;
  courierOptions?: { value: string; label: string }[];
  selectedCourierPartner?: string;
  busy?: boolean;
  onClose: () => void;
  onCourierChange?: (courierPartner: string) => void;
  onSubmit: (details: HandoverDetails) => void;
}

function nowForDatetimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Marking a batch shipped in one go is the moment a real stack of parcels physically leaves the
// building — worth logging who actually took them and any receipt code the courier gave, the same
// way a courier's own hub would log a handover. None of these fields are required: a rider pickup
// often comes with no paperwork at all, so this only captures what's actually available, never
// blocks the action for missing info.
export function BulkShipModal({
  open,
  count,
  courierSummary,
  missingCourierCount = 0,
  courierOptions = [],
  selectedCourierPartner = '',
  busy,
  onClose,
  onCourierChange,
  onSubmit,
}: BulkShipModalProps) {
  const [handoverAt, setHandoverAt] = useState(nowForDatetimeLocal());
  const [pickupPersonName, setPickupPersonName] = useState('');
  const [pickupPersonPhone, setPickupPersonPhone] = useState('');
  const [hvCode, setHvCode] = useState('');
  const [remark, setRemark] = useState('');

  useEffect(() => {
    if (open) {
      setHandoverAt(nowForDatetimeLocal());
      setPickupPersonName('');
      setPickupPersonPhone('');
      setHvCode('');
      setRemark('');
    }
  }, [open]);

  const submit = () => {
    if (missingCourierCount > 0 && !selectedCourierPartner) return;
    onSubmit({
      handoverAt,
      pickupPersonName: pickupPersonName.trim(),
      pickupPersonPhone: pickupPersonPhone.trim(),
      hvCode: hvCode.trim(),
      remark: remark.trim(),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mark ${count} order${count === 1 ? '' : 's'} ready for pickup`}
      subtitle="Moves packed parcels into the pickup queue. Scan the bill barcode when the rider takes each parcel."
      widthClass="max-w-lg"
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
                  Orders that already have a courier keep their current partner. This selection only fills the unassigned ones.
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
              />
            ) : (
              <p className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-800">
                Connect a courier account before marking these orders ready for pickup.
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Ready date &amp; time</label>
            <input
              type="datetime-local"
              value={handoverAt}
              onChange={(e) => setHandoverAt(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">HV code (optional)</label>
            <input
              value={hvCode}
              onChange={(e) => setHvCode(e.target.value)}
              placeholder="Receipt code, if given"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Prepared by (optional)</label>
            <input
              value={pickupPersonName}
              onChange={(e) => setPickupPersonName(e.target.value)}
              placeholder="Who prepared the parcels"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Pickup person's phone (optional)</label>
            <input
              value={pickupPersonPhone}
              onChange={(e) => setPickupPersonPhone(e.target.value)}
              placeholder="01XXXXXXXXX"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Remark (optional)</label>
            <input
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="Anything else worth noting"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || (missingCourierCount > 0 && !selectedCourierPartner)}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Saving...' : 'Mark ready'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
