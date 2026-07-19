import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Popover } from '../ui/Popover';
import { Select } from '../ui/Select';
import { DateTimePicker } from '../ui/DateTimePicker';

interface ReasonNoteMenuProps<TReason extends string> {
  trigger: (open: boolean) => ReactNode;
  title: string;
  reasons: TReason[];
  defaultReason?: TReason;
  confirmLabel: string;
  confirmTone?: 'default' | 'danger';
  onApply: (reason: TReason, note: string, rescheduledFor: string | null) => void;
  align?: 'left' | 'right';
  wrapperClassName?: string;
}

export function ReasonNoteMenu<TReason extends string>({
  trigger,
  title,
  reasons,
  defaultReason,
  confirmLabel,
  confirmTone = 'default',
  onApply,
  align,
  wrapperClassName,
}: ReasonNoteMenuProps<TReason>) {
  const [reason, setReason] = useState<TReason>(defaultReason ?? reasons[0]);
  const [note, setNote] = useState('');
  const [rescheduleAt, setRescheduleAt] = useState('');
  const needsRescheduleTime = reason === 'Customer rescheduled call';

  useEffect(() => {
    if (defaultReason) {
      setReason(defaultReason);
      return;
    }
    // `reasons` can change out from under an already-mounted menu (e.g. the order's stage changes
    // while the drawer stays open) — if the current pick is no longer one of the options, fall back
    // to the first one instead of silently submitting a reason that's no longer offered.
    setReason((prev) => (reasons.includes(prev) ? prev : reasons[0]));
  }, [defaultReason, reasons]);

  return (
    <Popover trigger={trigger} align={align} widthClass="w-80" wrapperClassName={wrapperClassName} allowOverflow>
      {(close) => (
        <div className="space-y-3 p-3.5">
          <p className="text-xs font-semibold text-slate-700">{title}</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Reason</label>
            <Select value={reason} onChange={setReason} options={reasons.map((r) => ({ value: r, label: r }))} />
          </div>
          {needsRescheduleTime && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Reschedule to</label>
              <DateTimePicker value={rescheduleAt} onChange={setRescheduleAt} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Add context..."
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400"
            />
          </div>
          <button
            onClick={() => {
              const rescheduledForIso = needsRescheduleTime && rescheduleAt ? new Date(rescheduleAt).toISOString() : null;
              const scheduled = rescheduledForIso
                ? `Reschedule to ${new Date(rescheduledForIso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`
                : '';
              const finalNote = [scheduled, note.trim()].filter(Boolean).join(' — ');
              onApply(reason, finalNote, rescheduledForIso);
              setNote('');
              setRescheduleAt('');
              close();
            }}
            disabled={needsRescheduleTime && !rescheduleAt}
            className={clsx(
              'w-full rounded-lg py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50',
              confirmTone === 'danger' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-slate-900 hover:bg-slate-800'
            )}
          >
            {confirmLabel}
          </button>
        </div>
      )}
    </Popover>
  );
}
