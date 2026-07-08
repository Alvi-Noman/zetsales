import { useLayoutEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { useClickOutside } from '../../hooks/useClickOutside';

interface DateTimePickerProps {
  value: string; // 'YYYY-MM-DDTHH:mm', or '' when unset
  onChange: (value: string) => void;
  placeholder?: string;
}

const PANEL_HEIGHT_ESTIMATE = 360;

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function parseValue(value: string): Date | null {
  if (!value) return null;
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if ([y, m, d, hh, mm].some(Number.isNaN)) return null;
  return new Date(y, m - 1, d, hh, mm);
}

function toValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Custom calendar + stepper time controls, styled to match the rest of the app instead of the
// browser/OS's native <input type="datetime-local"> widget. No portal — this sits inside popovers
// that are themselves already portaled (e.g. ReasonNoteMenu), and a nested portal would land
// outside the parent's click-outside ref and close it the moment an option is picked.
export function DateTimePicker({ value, onChange, placeholder = 'Pick date & time' }: DateTimePickerProps) {
  const selected = parseValue(value);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => selected ?? new Date());
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const recompute = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropUp(spaceBelow < PANEL_HEIGHT_ESTIMATE && spaceAbove > spaceBelow);
    };
    recompute();
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
  }, [open]);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const hour24 = selected ? selected.getHours() : 15;
  const minute = selected ? selected.getMinutes() : 0;

  const commitTime = (nextHour24: number, nextMinute: number) => {
    const base = selected ?? new Date(year, month, new Date().getDate());
    onChange(toValue(new Date(base.getFullYear(), base.getMonth(), base.getDate(), ((nextHour24 % 24) + 24) % 24, ((nextMinute % 60) + 60) % 60)));
  };

  const pickDay = (day: number) => {
    const base = selected ?? new Date(year, month, day, 15, 0);
    onChange(toValue(new Date(year, month, day, base.getHours(), base.getMinutes())));
  };

  const isSelectedDay = (day: number) =>
    !!selected && selected.getFullYear() === year && selected.getMonth() === month && selected.getDate() === day;

  const isToday = (day: number) => {
    const t = new Date();
    return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day;
  };

  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex w-full items-center gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-sm outline-none transition-colors',
          open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300',
          selected ? 'text-slate-700' : 'text-slate-400'
        )}
      >
        <CalendarIcon size={14} className="shrink-0 text-slate-400" />
        <span className="truncate">
          {selected ? selected.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : placeholder}
        </span>
      </button>

      {open && (
        <div
          className={clsx(
            'absolute z-20 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1'
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month - 1, 1))}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-slate-700">
              {viewMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(new Date(year, month + 1, 1))}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-slate-400">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) =>
              day === null ? (
                <span key={i} />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={clsx(
                    'rounded-md py-1 text-center text-sm transition-colors',
                    isSelectedDay(day)
                      ? 'bg-indigo-600 font-semibold text-white'
                      : isToday(day)
                        ? 'bg-indigo-50 font-medium text-indigo-600 hover:bg-indigo-100'
                        : 'text-slate-700 hover:bg-slate-100'
                  )}
                >
                  {day}
                </button>
              )
            )}
          </div>

          <div className="mt-3 flex items-center justify-center gap-3 border-t border-slate-100 pt-3">
            <TimeStepper label="Hour" value={pad(hour12)} onUp={() => commitTime(hour24 + 1, minute)} onDown={() => commitTime(hour24 - 1, minute)} />
            <span className="pt-3.5 text-sm font-semibold text-slate-400">:</span>
            <TimeStepper label="Min" value={pad(minute)} onUp={() => commitTime(hour24, minute + 5)} onDown={() => commitTime(hour24, minute - 5)} />
            <div className="flex flex-col items-center gap-1 pt-3.5">
              <button
                type="button"
                onClick={() => commitTime(ampm === 'AM' ? hour24 + 12 : hour24 - 12, minute)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {ampm}
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={!selected}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeStepper({ label, value, onUp, onDown }: { label: string; value: string; onUp: () => void; onDown: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</span>
      <button type="button" onClick={onUp} className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <ChevronUp size={14} />
      </button>
      <span className="w-8 rounded-md bg-slate-50 py-1 text-center text-sm font-semibold tabular-nums text-slate-700">{value}</span>
      <button type="button" onClick={onDown} className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
        <ChevronDown size={14} />
      </button>
    </div>
  );
}
