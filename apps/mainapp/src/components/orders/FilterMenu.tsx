import { ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Popover } from '../ui/Popover';

interface FilterMenuOption {
  value: string;
  label: string;
}

interface FilterMenuProps {
  icon: typeof ChevronDown;
  allLabel: string;
  value: string;
  options: FilterMenuOption[];
  onChange: (value: string) => void;
}

// A single-select pill dropdown matching DateRangeMenu/ColumnsMenu — used for Store and Payment
// status so every filter in the toolbar looks and behaves the same way, instead of mixing native
// <select> elements with custom popovers.
export function FilterMenu({ icon: Icon, allLabel, value, options, onChange }: FilterMenuProps) {
  const active = value !== 'all';
  const currentLabel = active ? options.find((o) => o.value === value)?.label ?? allLabel : allLabel;

  return (
    <Popover
      align="left"
      widthClass="w-52"
      trigger={() => (
        <div
          className={clsx(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer',
            active ? 'border-indigo-200 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          )}
        >
          <Icon size={13} className={active ? 'text-indigo-500' : 'text-slate-400'} />
          <span className="max-w-[10rem] truncate">{currentLabel}</span>
          <ChevronDown size={12} className={active ? 'text-indigo-400' : 'text-slate-400'} />
        </div>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto py-1.5">
          <button
            onClick={() => {
              onChange('all');
              close();
            }}
            className={clsx('flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50', value === 'all' ? 'font-semibold text-indigo-600' : 'text-slate-700')}
          >
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                close();
              }}
              className={clsx(
                'flex w-full items-center truncate px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                value === opt.value ? 'font-semibold text-indigo-600' : 'text-slate-700'
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
