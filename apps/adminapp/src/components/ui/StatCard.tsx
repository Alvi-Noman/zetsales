import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

export function StatCard({
  label,
  value,
  icon: Icon,
  change,
  sublabel,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  change?: number;
  sublabel?: string;
}) {
  return (
    <div className="zs-card zs-card-hover flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800/80 text-slate-400">
          <Icon size={14} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
        {change !== undefined && (
          <span
            className={clsx(
              'flex items-center gap-0.5 text-xs font-semibold',
              change >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}
          >
            {change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      {sublabel && <span className="text-[11px] text-slate-500">{sublabel}</span>}
    </div>
  );
}
