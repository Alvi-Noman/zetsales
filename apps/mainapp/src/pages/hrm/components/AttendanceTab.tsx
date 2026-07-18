import { useMemo, useState } from "react";
import { CalendarDays, LogIn, LogOut } from "lucide-react";
import clsx from "clsx";
import type { HrmAttendanceDTO, HrmAttendanceStatus, HrmEmployeeDTO } from "@zetsales/shared";
import { hrmCheckIn, hrmCheckOut, markHrmAttendance } from "../../../lib/hrmApi";
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

function timeStr(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

const todayStr = () => new Date().toISOString().slice(0, 10);

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
                        {record?.source === "pin" ? "Self punch" : record?.source === "biometric" ? "Biometric" : record ? "Manual" : "—"}
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
