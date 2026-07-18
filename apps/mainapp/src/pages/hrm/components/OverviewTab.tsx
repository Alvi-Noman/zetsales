import { Building2, CalendarCheck2, CalendarX2, ClipboardList, Landmark, Users } from "lucide-react";
import clsx from "clsx";
import type { HrmDashboardDTO } from "@zetsales/shared";

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "indigo" | "amber" | "rose";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
  }[tone];
  return (
    <div className="zs-summary-cell">
      <div className="flex items-center gap-2">
        <span className={clsx("flex h-7 w-7 items-center justify-center rounded-lg", toneClass)}>
          <Icon size={15} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

export function OverviewTab({ dashboard }: { dashboard: HrmDashboardDTO | null }) {
  if (!dashboard) return <div className="zs-loading-state">Loading overview...</div>;

  return (
    <div className="space-y-5">
      <div className="zs-summary-strip">
        <MetricCard icon={Users} label="Total employees" value={String(dashboard.totalEmployees)} tone="slate" />
        <MetricCard icon={CalendarCheck2} label="Present today" value={String(dashboard.presentToday)} tone="emerald" />
        <MetricCard icon={CalendarX2} label="Absent today" value={String(dashboard.absentToday)} tone="rose" />
        <MetricCard icon={ClipboardList} label="On leave today" value={String(dashboard.onLeaveToday)} tone="amber" />
        <MetricCard icon={ClipboardList} label="Pending leave requests" value={String(dashboard.pendingLeaveRequests)} tone="indigo" />
        <MetricCard icon={Landmark} label="This month's payroll" value={money(dashboard.monthlyPayrollTotal)} tone="indigo" />
      </div>

      <div className="zs-table-wrap">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <Building2 size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Headcount by department</h3>
        </div>
        {dashboard.departmentBreakdown.length === 0 ? (
          <div className="zs-empty-state">
            <Building2 size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No departments yet</p>
            <p className="max-w-sm text-xs text-slate-400">Add a department from the Departments tab to see headcount here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {dashboard.departmentBreakdown.map((d) => (
              <div key={d.departmentName} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-slate-700">{d.departmentName}</span>
                <span className="text-sm font-semibold tabular-nums text-slate-900">{d.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
