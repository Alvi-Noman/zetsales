import { useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

export interface TrendChartPoint {
  index: number;
  label: string;
  date: string;
  value: number;
}

interface TrendChartProps {
  current: TrendChartPoint[];
  comparison: TrendChartPoint[];
  color: string;
  formatValue: (v: number) => string;
  formatDate?: (iso: string) => string;
  height?: number;
}

const CHART_WIDTH = 240;
const AXIS_WIDTH = 34;
const TOTAL_WIDTH = CHART_WIDTH + AXIS_WIDTH;

// Catmull-Rom -> cubic Bezier conversion, so the line reads as a smooth organic curve (like a real
// analytics dashboard) instead of jagged straight segments between daily/hourly buckets.
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

// Closes a line path down to the chart's baseline so it can be filled — the soft fade-to-transparent
// area under the primary line, matching how Stripe/Linear/Vercel Analytics render their charts.
function areaPath(linePath: string, points: { x: number; y: number }[], baselineY: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath} L ${last.x.toFixed(2)},${baselineY} L ${first.x.toFixed(2)},${baselineY} Z`;
}

function defaultFormatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// "Nice" round gridline values (0, mid, max rounded to a clean step) rather than the raw
// min/max — a ruler's cm marks land on round numbers, not on whatever your object happens to
// measure.
function niceTicks(maxValue: number, count = 3): number[] {
  if (maxValue <= 0) return [0];
  const rawStep = maxValue / (count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = niceNormalized * magnitude;
  const ticks: number[] = [];
  for (let v = 0; v <= maxValue + step * 0.5; v += step) ticks.push(Math.round(v));
  return ticks;
}

// Two overlaid lines (solid = current period, dashed = the "intelligently" matched comparison
// period). A real value scale (gridlines + labels, like a ruler's cm marks) is always visible;
// the time scale only appears on hover, right where the crosshair is, instead of permanently
// competing for the small amount of space in a KPI card.
export function TrendChart({ current, comparison, color, formatValue, formatDate = defaultFormatDate, height = 68 }: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gradientId = useId();

  const maxIndex = Math.max(current.length - 1, comparison.length - 1, 1);
  const allValues = [...current.map((p) => p.value), ...comparison.map((p) => p.value)];
  const maxValue = Math.max(...allValues, 1);
  const ticks = useMemo(() => niceTicks(maxValue), [maxValue]);
  const scaleMax = Math.max(maxValue, ticks[ticks.length - 1] ?? maxValue, 1);
  const padY = 4;

  const toXY = (p: TrendChartPoint) => ({
    x: (p.index / maxIndex) * CHART_WIDTH,
    y: height - padY - (p.value / scaleMax) * (height - padY * 2),
  });
  const valueToY = (v: number) => height - padY - (v / scaleMax) * (height - padY * 2);

  const currentPoints = useMemo(() => current.map(toXY), [current, maxIndex, scaleMax, height]);
  const comparisonPoints = useMemo(() => comparison.map(toXY), [comparison, maxIndex, scaleMax, height]);
  const currentPath = useMemo(() => smoothPath(currentPoints), [currentPoints]);
  const comparisonPath = useMemo(() => smoothPath(comparisonPoints), [comparisonPoints]);
  const currentAreaPath = useMemo(() => areaPath(currentPath, currentPoints, height), [currentPath, currentPoints, height]);

  const handleMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * CHART_WIDTH;
    const index = Math.round((relX / CHART_WIDTH) * maxIndex);
    setHoverIndex(Math.max(0, Math.min(maxIndex, index)));
  };

  const hoverCurrent = hoverIndex !== null ? current[hoverIndex] : undefined;
  const hoverComparison = hoverIndex !== null ? comparison[hoverIndex] : undefined;
  const hoverX = hoverIndex !== null ? (hoverIndex / maxIndex) * CHART_WIDTH : null;
  // Percentage across the *whole* container (axis margin + chart), since that's what the SVG's
  // viewBox actually spans — used for positioning the HTML overlay (tooltip/time label) in CSS.
  const hoverPct = hoverX !== null ? ((AXIS_WIDTH + hoverX) / TOTAL_WIDTH) * 100 : 0;
  const hoverLabel = hoverCurrent?.label ?? hoverComparison?.label;

  if (current.length === 0 && comparison.length === 0) {
    return <div className="flex items-center justify-center text-[11px] text-slate-300" style={{ height }}>No data</div>;
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: height + 14 }}
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      <svg width="100%" height={height} viewBox={`0 0 ${TOTAL_WIDTH} ${height}`} preserveAspectRatio="none" className="block overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.16" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Value scale: gridlines + labels, always visible — this is the ruler's cm marks. */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={AXIS_WIDTH} y1={valueToY(t)} x2={TOTAL_WIDTH} y2={valueToY(t)} stroke="#f1f5f9" strokeWidth="1" />
            <text x={AXIS_WIDTH - 5} y={valueToY(t)} textAnchor="end" dominantBaseline="middle" fontSize="8" fill="#94a3b8">
              {formatValue(t)}
            </text>
          </g>
        ))}

        <g transform={`translate(${AXIS_WIDTH}, 0)`}>
          <path d={currentAreaPath} fill={`url(#${gradientId})`} stroke="none" />
          <path d={comparisonPath} fill="none" stroke="#d4dbe4" strokeWidth="1.25" strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" />
          <path d={currentPath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.85" />
          {hoverX !== null && <line x1={hoverX} y1={0} x2={hoverX} y2={height} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="2 2" />}
          {hoverIndex !== null && comparisonPoints[hoverIndex] && (
            <circle cx={comparisonPoints[hoverIndex].x} cy={comparisonPoints[hoverIndex].y} r="2" fill="#94a3b8" stroke="#fff" strokeWidth="1.25" />
          )}
          {hoverIndex !== null && currentPoints[hoverIndex] && (
            <circle cx={currentPoints[hoverIndex].x} cy={currentPoints[hoverIndex].y} r="2.5" fill={color} stroke="#fff" strokeWidth="1.25" />
          )}
        </g>
      </svg>

      {/* Time scale — only appears on hover, anchored under the crosshair. */}
      {hoverIndex !== null && hoverLabel && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap text-[9px] font-semibold text-slate-500"
          style={{ top: height + 1, left: `${hoverPct}%` }}
        >
          {hoverLabel}
        </div>
      )}

      {hoverIndex !== null && (hoverCurrent || hoverComparison) && (
        <div
          className="pointer-events-none absolute top-1 z-20 min-w-[128px] rounded-lg border border-slate-200/80 bg-white/25 px-2.5 py-1.5 text-[11px] shadow-lg shadow-slate-900/15 ring-1 ring-inset ring-white/50 backdrop-blur-md backdrop-saturate-150"
          style={{ left: `clamp(0px, ${hoverPct}%, calc(100% - 128px))` }}
        >
          {hoverCurrent && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-slate-500">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                {formatDate(hoverCurrent.date)}
              </span>
              <span className="font-semibold text-slate-800 tabular-nums">{formatValue(hoverCurrent.value)}</span>
            </div>
          )}
          {hoverComparison && (
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-slate-400">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                {formatDate(hoverComparison.date)}
              </span>
              <span className="font-medium text-slate-500 tabular-nums">{formatValue(hoverComparison.value)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
