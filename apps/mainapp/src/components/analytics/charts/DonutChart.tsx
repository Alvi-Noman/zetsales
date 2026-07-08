import { useState } from 'react';
import { categoricalColor } from '../chartTheme';

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
}

interface DonutChartProps {
  slices: DonutSlice[];
  formatValue: (v: number) => string;
  size?: number;
}

const RADIUS = 42;
const STROKE = 16;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Composition of genuinely distinct categories (payment methods, risk segments) — real identity,
// so it earns the fixed categorical palette. A legend with text labels always ships alongside (the
// contrast-relief requirement for the palette's lighter slots), and the center hole carries the
// total so the chart still answers "how much, overall" at a glance.
export function DonutChart({ slices, formatValue, size = 160 }: DonutChartProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const total = slices.reduce((s, r) => s + r.value, 0);

  if (total <= 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-300">No data for this period</div>;
  }

  let offset = 0;
  const arcs = slices.map((s, i) => {
    const fraction = s.value / total;
    const dash = fraction * CIRCUMFERENCE;
    const arc = { key: s.key, color: categoricalColor(i), dash, offset, fraction };
    offset += dash;
    return arc;
  });

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="50"
              cy="50"
              r={RADIUS}
              fill="none"
              stroke={a.color}
              strokeWidth={hoverKey === a.key ? STROKE + 2 : STROKE}
              strokeDasharray={`${a.dash} ${CIRCUMFERENCE - a.dash}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="butt"
              onMouseEnter={() => setHoverKey(a.key)}
              onMouseLeave={() => setHoverKey(null)}
              className="cursor-pointer transition-[stroke-width] duration-150"
              style={{ opacity: hoverKey && hoverKey !== a.key ? 0.45 : 1 }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[17px] font-bold tabular-nums text-slate-900">{formatValue(hoverKey ? slices.find((s) => s.key === hoverKey)?.value ?? 0 : total)}</span>
          <span className="text-[10px] font-medium text-slate-400">{hoverKey ? slices.find((s) => s.key === hoverKey)?.label : 'Total'}</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {slices.map((s, i) => (
          <div
            key={s.key}
            className="flex items-center justify-between gap-3 rounded-md px-1.5 py-1 transition-colors"
            style={{ backgroundColor: hoverKey === s.key ? '#f8fafc' : undefined }}
            onMouseEnter={() => setHoverKey(s.key)}
            onMouseLeave={() => setHoverKey(null)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: categoricalColor(i) }} />
              <span className="truncate text-[12.5px] font-medium text-slate-700">{s.label}</span>
            </span>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-slate-900">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
