import { useState } from 'react';
import type { AnalyticsBreakdownRowDTO } from '@zetsales/shared';
import { CHART_INK } from '../chartTheme';

interface ParetoChartProps {
  rows: AnalyticsBreakdownRowDTO[];
  formatValue: (v: number) => string;
  formatSecondaryRate?: (v: number) => string;
  secondaryRateLabel?: string;
  maxRows?: number;
  barColor?: string;
}

// Ranked horizontal bars (one hue — these rows are a single measure sliced by a nominal dimension,
// not distinct series, so bar length alone carries the magnitude) with a running cumulative-%
// column instead of an overlaid line: reason/store/zone labels are long free text, and a plotted
// line reads far worse than a number here. Every value is also a visible label (the contrast
// relief the dataviz palette requires), so nothing depends on color alone.
export function ParetoChart({ rows, formatValue, formatSecondaryRate, secondaryRateLabel, maxRows = 10, barColor = '#6366f1' }: ParetoChartProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const shown = rows.slice(0, maxRows);
  const maxValue = Math.max(...shown.map((r) => r.value), 1);

  if (shown.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-300">No data for this period</div>;
  }

  return (
    <div className="space-y-2.5">
      {shown.map((row) => {
        const widthPct = Math.max(2, (row.value / maxValue) * 100);
        const isHover = hoverKey === row.key;
        return (
          <div
            key={row.key}
            className="group"
            onMouseEnter={() => setHoverKey(row.key)}
            onMouseLeave={() => setHoverKey(null)}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[12.5px] font-medium text-slate-700" title={row.label}>
                {row.label}
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-[12.5px] font-semibold text-slate-900">{formatValue(row.value)}</span>
                {row.secondaryRate != null && formatSecondaryRate && (
                  <span className="text-[11px] font-medium text-slate-400">
                    {secondaryRateLabel ?? ''} {formatSecondaryRate(row.secondaryRate)}
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-2 rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full transition-all duration-300 ease-out"
                style={{ width: `${widthPct}%`, backgroundColor: barColor, opacity: isHover ? 1 : 0.85 }}
              />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10.5px] text-slate-400">
              <span>{row.count.toLocaleString()} orders</span>
              <span className="tabular-nums">cum. {row.cumulativePercentage}%</span>
            </div>
          </div>
        );
      })}
      <div className="pt-1 text-[10px] text-slate-300" style={{ color: CHART_INK.muted }}>
        Showing top {shown.length} of {rows.length}
      </div>
    </div>
  );
}
