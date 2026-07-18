import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarDays, CalendarRange, ChevronDown, ChevronRight, Clock, LogIn, LogOut } from "lucide-react";
import clsx from "clsx";
import type { HrmAttendanceDTO, HrmAttendanceStatus, HrmEmployeeDTO } from "@zetsales/shared";
import { hrmCheckIn, hrmCheckOut, listHrmAttendance, markHrmAttendance } from "../../../lib/hrmApi";
import { useToast } from "../../../components/ui/ToastProvider";

const STATUS_LABEL: Record<HrmAttendanceStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  halfDay: "Half day",
  onLeave: "On leave",
};

const STATUS_TONE: Record<HrmAttendanceStatus, string> = {
  present: "bg-emerald-50 text-emerald-700",
  absent: "bg-rose-50 text-rose-700",
  late: "bg-amber-50 text-amber-700",
  halfDay: "bg-indigo-50 text-indigo-700",
  onLeave: "bg-slate-100 text-slate-600",
};

const SOURCE_LABEL: Record<string, string> = { pin: "Self punch", biometric: "Biometric", manual: "Manual" };

function timeStr(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function dateStr(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Only counts breaks that have actually ended — an open (still-ongoing) break isn't included in
// the total, since its duration isn't known yet.
function closedBreakMinutes(record: HrmAttendanceDTO): number {
  return record.breaks.reduce((sum, b) => (b.end ? sum + (new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000 : sum), 0);
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgoStr = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function DailyView({
  employees,
  attendance,
  loading,
  date,
  onDateChange,
  onChanged,
}: {
  employees: HrmEmployeeDTO[];
  attendance: HrmAttendanceDTO[];
  loading: boolean;
  date: string;
  onDateChange: (date: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const isToday = date === todayStr();

  const byEmployee = useMemo(() => new Map(attendance.map((a) => [a.employeeId, a])), [attendance]);
  const activeEmployees = useMemo(() => employees.filter((e) => e.status !== "terminated"), [employees]);

  const withBusy = async (employeeId: string, fn: () => Promise<unknown>) => {
    setBusyId(employeeId);
    try {
      await fn();
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not update attendance.", "info");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} className="text-slate-400" />
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => onDateChange(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
          />
        </div>
        <p className="text-xs text-slate-400">Check-in/out only applies to today. Past dates can be marked manually.</p>
      </div>

      <div className="zs-table-wrap">
        {loading && activeEmployees.length === 0 ? (
          <div className="zs-loading-state">Loading attendance...</div>
        ) : activeEmployees.length === 0 ? (
          <div className="zs-empty-state">
            <CalendarDays size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No active employees</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="zs-table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Check-in</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Check-out</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Hours</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Via</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="zs-table-body">
                {activeEmployees.map((emp) => {
                  const record = byEmployee.get(emp.id);
                  const busy = busyId === emp.id;
                  return (
                    <tr key={emp.id} className="zs-data-row">
                      <td className="px-4 py-3 font-medium text-slate-800">{emp.name}</td>
                      <td className="px-4 py-3">
                        <select
                          value={record?.status ?? ""}
                          disabled={busy}
                          onChange={(e) =>
                            void withBusy(emp.id, () =>
                              markHrmAttendance({ employeeId: emp.id, date, status: e.target.value as HrmAttendanceStatus })
                            )
                          }
                          className={clsx(
                            "rounded-full border-0 px-2 py-0.5 text-xs font-semibold outline-none",
                            record ? STATUS_TONE[record.status] : "bg-slate-50 text-slate-400"
                          )}
                        >
                          <option value="" disabled>
                            Not marked
                          </option>
                          {Object.entries(STATUS_LABEL).map(([key, label]) => (
                            <option key={key} value={key}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{timeStr(record?.checkIn ?? null)}</td>
                      <td className="px-4 py-3 text-slate-600">{timeStr(record?.checkOut ?? null)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{record?.hoursWorked ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {record ? SOURCE_LABEL[record.source ?? "manual"] ?? "Manual" : "—"}
                        {record && record.breaks.some((b) => !b.end) && (
                          <span className="ml-1.5 inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">On break</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isToday && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              disabled={busy || !!record?.checkIn}
                              onClick={() => void withBusy(emp.id, () => hrmCheckIn(emp.id))}
                              className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <LogIn size={12} /> In
                            </button>
                            <button
                              disabled={busy || !record?.checkIn || !!record?.checkOut}
                              onClick={() => void withBusy(emp.id, () => hrmCheckOut(emp.id))}
                              className="flex h-7 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <LogOut size={12} /> Out
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryView({ employees }: { employees: HrmEmployeeDTO[] }) {
  const [from, setFrom] = useState(daysAgoStr(6));
  const [to, setTo] = useState(todayStr());
  const [employeeId, setEmployeeId] = useState("");
  const [records, setRecords] = useState<HrmAttendanceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toast = useToast();

  const activeEmployees = useMemo(() => employees.filter((e) => e.status !== "terminated"), [employees]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listHrmAttendance({ from, to, employeeId: employeeId || undefined })
      .then((res) => {
        if (!cancelled) setRecords(res);
      })
      .catch(() => {
        if (!cancelled) toast.push("Could not load attendance history.", "info");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, employeeId]);

  const toggleExpand = (id: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const summary = useMemo(() => {
    const presentDays = records.filter((r) => r.status === "present" || r.status === "late" || r.status === "halfDay").length;
    const totalHours = records.reduce((sum, r) => sum + (r.hoursWorked ?? 0), 0);
    const totalBreakMinutes = records.reduce((sum, r) => sum + closedBreakMinutes(r), 0);
    const totalBreakCount = records.reduce((sum, r) => sum + r.breaks.length, 0);
    return { presentDays, totalHours: Math.round(totalHours * 10) / 10, totalBreakMinutes, totalBreakCount };
  }, [records]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange size={15} className="text-slate-400" />
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={to}
            min={from}
            max={todayStr()}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
          />
        </div>
        <select
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
        >
          <option value="">All employees</option>
          {activeEmployees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>

      <div className="zs-summary-strip">
        <div className="zs-summary-cell">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Records</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{records.length}</p>
        </div>
        <div className="zs-summary-cell">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Present days</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.presentDays}</p>
        </div>
        <div className="zs-summary-cell">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total hours</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.totalHours}</p>
        </div>
        <div className="zs-summary-cell">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Breaks taken</p>
          <p className="mt-1 text-lg font-bold text-slate-900">
            {summary.totalBreakCount} <span className="text-xs font-normal text-slate-400">({formatMinutes(summary.totalBreakMinutes)})</span>
          </p>
        </div>
      </div>

      <div className="zs-table-wrap">
        {loading && records.length === 0 ? (
          <div className="zs-loading-state">Loading history...</div>
        ) : records.length === 0 ? (
          <div className="zs-empty-state">
            <CalendarRange size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No attendance records in this range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="zs-table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold"></th>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Check-in</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Check-out</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Hours</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Breaks</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Via</th>
                </tr>
              </thead>
              <tbody className="zs-table-body">
                {records.map((r) => {
                  const isOpen = expanded.has(r.id);
                  const hasBreaks = r.breaks.length > 0;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className={clsx("zs-data-row", hasBreaks && "cursor-pointer")}
                        onClick={() => hasBreaks && toggleExpand(r.id)}
                      >
                        <td className="px-4 py-3 text-slate-400">
                          {hasBreaks && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{dateStr(r.date)}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{r.employeeName}</td>
                        <td className="px-4 py-3">
                          <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[r.status])}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{timeStr(r.checkIn)}</td>
                        <td className="px-4 py-3 text-slate-600">{timeStr(r.checkOut)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.hoursWorked ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {r.breaks.length > 0 ? `${r.breaks.length} · ${formatMinutes(closedBreakMinutes(r))}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{SOURCE_LABEL[r.source ?? "manual"] ?? "Manual"}</td>
                      </tr>
                      {isOpen && hasBreaks && (
                        <tr className="bg-slate-50/70">
                          <td></td>
                          <td colSpan={8} className="px-4 py-2.5">
                            <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                              {r.breaks.map((b, i) => (
                                <span key={i} className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Clock size={12} className="text-slate-400" />
                                  Break {i + 1}: {timeStr(b.start)} – {b.end ? timeStr(b.end) : "ongoing"}
                                  {b.end && <span className="text-slate-400">({formatMinutes((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000)})</span>}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function AttendanceTab({
  employees,
  attendance,
  loading,
  date,
  onDateChange,
  onChanged,
}: {
  employees: HrmEmployeeDTO[];
  attendance: HrmAttendanceDTO[];
  loading: boolean;
  date: string;
  onDateChange: (date: string) => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"daily" | "history">("daily");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 w-fit">
        <button
          onClick={() => setMode("daily")}
          className={clsx(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            mode === "daily" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Daily
        </button>
        <button
          onClick={() => setMode("history")}
          className={clsx(
            "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
            mode === "history" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
          )}
        >
          History
        </button>
      </div>

      {mode === "daily" ? (
        <DailyView employees={employees} attendance={attendance} loading={loading} date={date} onDateChange={onDateChange} onChanged={onChanged} />
      ) : (
        <HistoryView employees={employees} />
      )}
    </div>
  );
}
