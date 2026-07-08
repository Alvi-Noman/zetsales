import { useState } from 'react';
import type { CallCenterHourlyVolumeDTO } from '@zetsales/shared';

export function HourlyVolumeChart({ data }: { data: CallCenterHourlyVolumeDTO[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.calls, d.confirmed)));

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Call volume</h2>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-indigo-400" /> Calls
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Confirmed
          </span>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-slate-300">No calls logged for this range</div>
      ) : (
        <div className="relative">
          <div className="flex h-40 items-end gap-2 border-b border-slate-100">
            {data.map((d) => (
              <div
                key={d.hour}
                className="relative flex flex-1 items-end justify-center gap-[3px]"
                onMouseEnter={() => setHovered(d.hour)}
                onMouseLeave={() => setHovered((h) => (h === d.hour ? null : h))}
              >
                {hovered === d.hour && (
                  <div className="pointer-events-none absolute -top-11 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg">
                    <span className="font-semibold">{d.label}</span> — {d.calls} call{d.calls === 1 ? '' : 's'}, {d.confirmed} confirmed
                  </div>
                )}
                <div className="w-full max-w-[10px] rounded-t bg-indigo-400/80" style={{ height: `${Math.max(2, (d.calls / max) * 100)}%` }} />
                <div className="w-full max-w-[10px] rounded-t bg-emerald-500" style={{ height: `${Math.max(d.confirmed > 0 ? 2 : 0, (d.confirmed / max) * 100)}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex gap-2">
            {data.map((d) => (
              <div key={d.hour} className="flex-1 text-center text-[10px] text-slate-400">
                {d.hour % 3 === 0 ? d.label : ''}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
