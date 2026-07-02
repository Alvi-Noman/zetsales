import { Check, Minus } from 'lucide-react';
import clsx from 'clsx';

interface CheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  ariaLabel?: string;
}

export function Checkbox({ checked, indeterminate, onChange, ariaLabel }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={clsx(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        checked || indeterminate
          ? 'bg-slate-900 border-slate-900'
          : 'bg-white border-slate-300 hover:border-slate-400'
      )}
    >
      {indeterminate ? (
        <Minus size={11} strokeWidth={3} className="text-white" />
      ) : checked ? (
        <Check size={11} strokeWidth={3} className="text-white" />
      ) : null}
    </button>
  );
}
