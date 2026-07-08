import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';
import { useClickOutside } from '../../hooks/useClickOutside';

const MENU_HEIGHT_ESTIMATE = 224; // matches max-h-56 below

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface SelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  className?: string;
  menuClassName?: string;
}

// A locally-anchored dropdown (no portal) so it can nest safely inside another Popover's
// portaled content — a portaled child would live outside its parent popover's own click-outside
// ref, so selecting an option here would look like an "outside click" to the parent and close it
// before the selection registers. Staying in the normal DOM flow avoids that entirely.
export function Select<T extends string>({ value, onChange, options, className, menuClassName }: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const recompute = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setDropUp(spaceBelow < MENU_HEIGHT_ESTIMATE && spaceAbove > spaceBelow);
    };
    recompute();
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none transition-colors',
          open ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-slate-300',
          className
        )}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <ChevronDown size={14} className={clsx('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className={clsx(
            'absolute z-20 max-h-56 w-full min-w-max overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg shadow-slate-900/10',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
            menuClassName
          )}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={clsx(
                'flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-slate-50',
                o.value === value ? 'font-medium text-indigo-600' : 'text-slate-700'
              )}
            >
              {o.label}
              {o.value === value && <Check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
