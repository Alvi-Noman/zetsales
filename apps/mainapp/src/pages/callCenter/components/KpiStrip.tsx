import { CheckCircle2, PhoneCall, TrendingUp, XCircle } from "lucide-react";
import clsx from "clsx";
import type { CallCenterKpisDTO } from "@zetsales/shared";
import {
  formatCount,
  formatMinutes,
  formatPercent,
} from "../../../analytics/format";

const TONE = {
  indigo: "bg-indigo-50 text-indigo-600 ring-indigo-600/20",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-600/20",
  rose: "bg-rose-50 text-rose-600 ring-rose-600/20",
  violet: "bg-violet-50 text-violet-600 ring-violet-600/20",
  amber: "bg-amber-50 text-amber-600 ring-amber-600/20",
  slate: "bg-slate-100 text-slate-500 ring-slate-500/20",
} as const;

function HeroTile({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: typeof PhoneCall;
  tone: keyof typeof TONE;
  label: string;
  value: string;
}) {
  return (
    <div className="zs-surface p-4">
      <span
        className={clsx(
          "inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 ring-inset",
          TONE[tone],
        )}
      >
        <Icon size={16} />
      </span>
      <p className="mt-2.5 text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>
      <p className="text-xs font-medium text-slate-400">{label}</p>
    </div>
  );
}

function MiniTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "rose";
}) {
  return (
    <div className="zs-surface p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p
        className={clsx(
          "mt-1.5 text-lg font-bold tabular-nums",
          tone === "rose" ? "text-rose-600" : "text-slate-900",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function KpiStrip({ kpis }: { kpis: CallCenterKpisDTO | null }) {
  const empty = "-";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <HeroTile
          icon={PhoneCall}
          tone="indigo"
          label="Calls made"
          value={kpis ? formatCount(kpis.callsToday) : empty}
        />
        <HeroTile
          icon={CheckCircle2}
          tone="emerald"
          label="Confirmed"
          value={kpis ? formatCount(kpis.confirmedToday) : empty}
        />
        <HeroTile
          icon={XCircle}
          tone="rose"
          label="Failed / no answer"
          value={kpis ? formatCount(kpis.failedToday) : empty}
        />
        <HeroTile
          icon={TrendingUp}
          tone="violet"
          label="Confirmation rate"
          value={
            kpis?.confirmationRateToday != null
              ? formatPercent(kpis.confirmationRateToday)
              : empty
          }
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <MiniTile
          label="Avg time to confirm"
          value={
            kpis ? formatMinutes(kpis.avgTimeToConfirmMinutesToday) : empty
          }
        />
        <MiniTile
          label="Pending queue"
          value={kpis ? formatCount(kpis.pendingQueueCount) : empty}
        />
        <MiniTile
          label="SLA breaches (2h+)"
          value={kpis ? formatCount(kpis.slaBreachCount) : empty}
          tone={kpis && kpis.slaBreachCount > 0 ? "rose" : undefined}
        />
      </div>
    </div>
  );
}
