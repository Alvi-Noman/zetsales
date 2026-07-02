import { useEffect, useState } from 'react';
import { Filter } from 'lucide-react';
import clsx from 'clsx';
import { Popover } from '../ui/Popover';

export interface AdvancedFilters {
  amountMin: string;
  amountMax: string;
  callAttemptsMin: string;
  courierPartner: string;
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = { amountMin: '', amountMax: '', callAttemptsMin: '', courierPartner: '' };

export function activeAdvancedFilterCount(f: AdvancedFilters): number {
  return Object.values(f).filter((v) => v.trim() !== '').length;
}

interface MoreFiltersMenuProps {
  value: AdvancedFilters;
  onApply: (value: AdvancedFilters) => void;
}

// Real, always-available order fields that the three headline pills (Channel/Status/Payment)
// don't cover — order value, how many confirmation calls have gone unanswered, and which courier
// picked it up. Draft state lives locally so typing a number doesn't refetch on every keystroke.
export function MoreFiltersMenu({ value, onApply }: MoreFiltersMenuProps) {
  const [draft, setDraft] = useState<AdvancedFilters>(value);
  useEffect(() => setDraft(value), [value]);

  const activeCount = activeAdvancedFilterCount(value);

  return (
    <Popover
      align="left"
      widthClass="w-72"
      trigger={() => (
        <div
          className={clsx(
            'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cursor-pointer',
            activeCount > 0 ? 'border-indigo-200 bg-indigo-50 text-indigo-700 font-medium' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
          )}
        >
          <Filter size={13} className={activeCount > 0 ? 'text-indigo-500' : 'text-slate-400'} />
          More Filters
          {activeCount > 0 && (
            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </div>
      )}
    >
      {(close: () => void) => (
        <div className="space-y-3.5 p-3.5">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-500">Order amount (৳)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                placeholder="Min"
                value={draft.amountMin}
                onChange={(e) => setDraft((d) => ({ ...d, amountMin: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
              <span className="text-slate-300">–</span>
              <input
                type="number"
                min={0}
                placeholder="Max"
                value={draft.amountMax}
                onChange={(e) => setDraft((d) => ({ ...d, amountMax: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-500">Call attempts (at least)</label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 3"
              value={draft.callAttemptsMin}
              onChange={(e) => setDraft((d) => ({ ...d, callAttemptsMin: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold text-slate-500">Courier partner</label>
            <input
              type="text"
              placeholder="e.g. Pathao, RedX..."
              value={draft.courierPartner}
              onChange={(e) => setDraft((d) => ({ ...d, courierPartner: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:bg-white"
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <button
              onClick={() => {
                setDraft(EMPTY_ADVANCED_FILTERS);
                onApply(EMPTY_ADVANCED_FILTERS);
                close();
              }}
              className="text-xs font-medium text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
            <button
              onClick={() => {
                onApply(draft);
                close();
              }}
              className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Apply filters
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
