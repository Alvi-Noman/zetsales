import { useEffect, useState } from 'react';
import { Calendar, Check, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { Popover } from '../ui/Popover';
import { DATE_RANGE_LABELS, formatRangeLabel, type CustomDateRange, type DateRangeKey } from './dateRange';

const QUICK_OPTIONS: DateRangeKey[] = ['today', 'yesterday', 'last7', 'last14', 'last30', 'thisMonth'];
const MORE_OPTIONS: DateRangeKey[] = ['last90', 'lastMonth', 'thisYear', 'all'];

interface DateRangeMenuProps {
  value: DateRangeKey;
  onChange: (key: DateRangeKey) => void;
  customRange?: CustomDateRange | null;
  onCustomRangeChange?: (range: CustomDateRange) => void;
}

export function DateRangeMenu({ value, onChange, customRange, onCustomRangeChange }: DateRangeMenuProps) {
  const [draftFrom, setDraftFrom] = useState(customRange?.from ?? '');
  const [draftTo, setDraftTo] = useState(customRange?.to ?? '');

  useEffect(() => {
    setDraftFrom(customRange?.from ?? '');
    setDraftTo(customRange?.to ?? '');
  }, [customRange?.from, customRange?.to]);

  const applyCustom = (close: () => void) => {
    if (!draftFrom || !draftTo) return;
    const next = draftFrom <= draftTo ? { from: draftFrom, to: draftTo } : { from: draftTo, to: draftFrom };
    onCustomRangeChange?.(next);
    onChange('custom');
    close();
  };

  return (
    <Popover
      align="left"
      widthClass="w-80"
      trigger={() => (
        <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
          <Calendar size={14} className="text-slate-400" />
          <span className="whitespace-nowrap">{formatRangeLabel(value, customRange)}</span>
          <ChevronDown size={12} className="text-slate-400" />
        </div>
      )}
    >
      {(close: () => void) => (
        <div className="p-2">
          <div className="grid grid-cols-2 gap-1">
            {QUICK_OPTIONS.map((key) => (
              <button
                key={key}
                onClick={() => {
                  onChange(key);
                  close();
                }}
                className={clsx(
                  'flex h-9 items-center justify-between rounded-lg px-3 text-left text-sm font-medium hover:bg-slate-50',
                  value === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                )}
              >
                {DATE_RANGE_LABELS[key]}
                {value === key && <Check size={13} />}
              </button>
            ))}
          </div>

          <div className="mt-2 border-t border-slate-100 pt-2">
            {MORE_OPTIONS.map((key) => (
              <button
                key={key}
                onClick={() => {
                  onChange(key);
                  close();
                }}
                className={clsx(
                  'flex h-8 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium hover:bg-slate-50',
                  value === key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'
                )}
              >
                {DATE_RANGE_LABELS[key]}
                {value === key && <Check size={13} />}
              </button>
            ))}
          </div>

          <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500">Custom range</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-[11px] font-medium text-slate-500">
                From
                <input
                  type="date"
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                />
              </label>
              <label className="text-[11px] font-medium text-slate-500">
                To
                <input
                  type="date"
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
                />
              </label>
            </div>
            <button
              onClick={() => applyCustom(close)}
              disabled={!draftFrom || !draftTo}
              className="mt-3 h-9 w-full rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply range
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
