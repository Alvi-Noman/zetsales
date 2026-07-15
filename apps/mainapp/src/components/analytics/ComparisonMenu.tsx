import { useEffect, useState } from "react";
import { GitCompare, Check, ChevronDown } from "lucide-react";
import clsx from "clsx";
import { Popover } from "../ui/Popover";
import {
  COMPARISON_MODE_LABELS,
  type ComparisonMode,
  type CustomComparisonRange,
} from "./comparisonMode";

// 'custom' deliberately isn't in this list — same reason DateRangeMenu keeps its own custom range
// out of QUICK_OPTIONS/MORE_OPTIONS: it needs its own two-date input, not a single click, so it
// gets its own section at the bottom instead of a row that would otherwise do nothing on click.
const MODES: ComparisonMode[] = [
  "none",
  "previousPeriod",
  "previousYear",
  "previousYearMatchDay",
];

interface ComparisonMenuProps {
  value: ComparisonMode;
  onChange: (mode: ComparisonMode) => void;
  customRange?: CustomComparisonRange | null;
  onCustomRangeChange?: (range: CustomComparisonRange) => void;
}

export function ComparisonMenu({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
}: ComparisonMenuProps) {
  const [draftFrom, setDraftFrom] = useState(customRange?.from ?? "");
  const [draftTo, setDraftTo] = useState(customRange?.to ?? "");

  useEffect(() => {
    setDraftFrom(customRange?.from ?? "");
    setDraftTo(customRange?.to ?? "");
  }, [customRange?.from, customRange?.to]);

  const applyCustom = (close: () => void) => {
    if (!draftFrom || !draftTo) return;
    const next =
      draftFrom <= draftTo
        ? { from: draftFrom, to: draftTo }
        : { from: draftTo, to: draftFrom };
    onCustomRangeChange?.(next);
    onChange("custom");
    close();
  };

  return (
    <Popover
      align="left"
      widthClass="w-72"
      trigger={() => (
        <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
          <GitCompare size={14} className="text-slate-400" />
          <span className="whitespace-nowrap">
            {COMPARISON_MODE_LABELS[value]}
          </span>
          <ChevronDown size={12} className="text-slate-400" />
        </div>
      )}
    >
      {(close: () => void) => (
        <div className="p-2">
          {MODES.map((mode) => (
            <button
              key={mode}
              onClick={() => {
                onChange(mode);
                close();
              }}
              className={clsx(
                "flex h-9 w-full items-center justify-between rounded-lg px-3 text-left text-sm font-medium hover:bg-slate-50",
                value === mode
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-700",
              )}
            >
              {COMPARISON_MODE_LABELS[mode]}
              {value === mode && <Check size={13} />}
            </button>
          ))}

          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500">
                Custom comparison range
              </p>
              {value === "custom" && (
                <Check size={13} className="text-indigo-600" />
              )}
            </div>
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
              Apply comparison range
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
