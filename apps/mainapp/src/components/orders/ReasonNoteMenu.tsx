import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Popover } from '../ui/Popover';

interface ReasonNoteMenuProps<TReason extends string> {
  trigger: (open: boolean) => ReactNode;
  title: string;
  reasons: TReason[];
  defaultReason?: TReason;
  confirmLabel: string;
  confirmTone?: 'default' | 'danger';
  onApply: (reason: TReason, note: string) => void;
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

  useEffect(() => {
    setReason(defaultReason ?? reasons[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultReason]);

  return (
    <Popover trigger={trigger} align={align} widthClass="w-72" wrapperClassName={wrapperClassName}>
      {(close) => (
        <div className="space-y-3 p-3.5">
          <p className="text-xs font-semibold text-slate-700">{title}</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as TReason)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
            >
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
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
              onApply(reason, note.trim());
              close();
            }}
            className={clsx(
              'w-full rounded-lg py-1.5 text-sm font-semibold text-white',
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
