import { useState } from 'react';
import type { WeeklyPatternCellDTO } from '@zetsales/shared';
import { sequentialColor } from '../chartTheme';

interface HeatmapGridProps {
  cells: WeeklyPatternCellDTO[];
  maxOrderCount: number;
  formatValue: (v: number) => string;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function hourLabel(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

// Pure magnitude on a grid — sequential single hue, one lighter step means "fewer orders", is the
// safe default here (no identity to encode, just "how much"). Each cell is its own hit target with
// a hover tooltip, since a 24x7 grid has no room for a direct label on every cell.
export function HeatmapGrid({ cells, maxOrderCount, formatValue }: HeatmapGridProps) {
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null);
  const byKey = new Map(cells.map((c) => [`${c.dayOfWeek}-${c.hour}`, c]));
  const max = Math.max(maxOrderCount, 1);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full">
        <div className="flex pl-10">
          {HOURS.filter((h) => h % 3 === 0).map((h) => (
            <div key={h} className="text-[9px] text-slate-400" style={{ width: `${(3 / 24) * 100}%` }}>
              {hourLabel(h)}
            </div>
          ))}
        </div>
        {DAY_LABELS.map((day, dayIdx) => (
          <div key={day} className="flex items-center gap-0.5">
            <div className="w-9 shrink-0 text-[10.5px] font-medium text-slate-500">{day}</div>
            <div className="flex flex-1 gap-0.5 py-0.5">
              {HOURS.map((h) => {
                const cell = byKey.get(`${dayIdx}-${h}`);
                const count = cell?.orderCount ?? 0;
                const isHover = hover?.day === dayIdx && hover?.hour === h;
                return (
                  <div
                    key={h}
                    className="group relative flex-1"
                    onMouseEnter={() => setHover({ day: dayIdx, hour: h })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div
                      className="aspect-square rounded-[3px] transition-transform duration-100"
                      style={{
                        backgroundColor: count > 0 ? sequentialColor(count / max) : '#f8fafc',
                        transform: isHover ? 'scale(1.25)' : undefined,
                      }}
                    />
                    {isHover && (
                      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10.5px] font-medium text-white shadow-lg">
                        {day} {hourLabel(h)} · {count} orders · {formatValue(cell?.revenue ?? 0)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
