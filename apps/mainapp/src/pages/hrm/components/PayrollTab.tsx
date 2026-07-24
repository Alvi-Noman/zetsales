import { useState } from "react";
import { Banknote, CalendarRange, CheckCircle2, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { HrmPayrollDTO } from "@zetsales/shared";
import { generateHrmPayroll, markHrmPayrollPaid } from "../../../lib/hrmApi";
import { useToast } from "../../../components/ui/ToastProvider";

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const currentMonth = () => new Date().toISOString().slice(0, 7);

export function PayrollTab({
  payroll,
  loading,
  month,
  onMonthChange,
  onChanged,
}: {
  payroll: HrmPayrollDTO[];
  loading: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    try {
      await generateHrmPayroll(month);
      toast.push("Payroll generated.", "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not generate payroll.", "info");
    } finally {
      setGenerating(false);
    }
  };

  const pay = async (id: string) => {
    setBusyId(id);
    try {
      await markHrmPayrollPaid(id);
      toast.push("Marked as paid.", "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not mark this as paid.", "info");
    } finally {
      setBusyId(null);
    }
  };

  const totalNet = payroll.reduce((sum, p) => sum + p.netPay, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarRange size={15} className="text-slate-400" />
          <input
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => onMonthChange(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
          />
        </div>
        <button
          onClick={() => void generate()}
          disabled={generating}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          <Sparkles size={14} /> {generating ? "Generating..." : "Generate payroll"}
        </button>
      </div>

      <div className="zs-summary-strip">
        <div className="zs-summary-cell">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Banknote size={15} />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Net pay this month</span>
          </div>
          <div className="mt-2 text-xl font-bold tabular-nums text-slate-900">{money(totalNet)}</div>
        </div>
      </div>

      <div className="zs-table-wrap">
        {loading && payroll.length === 0 ? (
          <div className="zs-loading-state">Loading payroll...</div>
        ) : payroll.length === 0 ? (
          <div className="zs-empty-state">
            <Banknote size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No payroll generated for this month</p>
            <p className="max-w-sm text-xs text-slate-400">Click "Generate payroll" to create draft payslips for every active employee.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="zs-table-head">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Base salary</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Overtime</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Undertime</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Leave deduction</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Net pay</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="zs-table-body">
                  {payroll.map((p) => (
                    <tr key={p.id} className="zs-data-row">
                      <td className="px-4 py-3 font-medium text-slate-800">{p.employeeName}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{money(p.baseSalary)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-600">
                        {p.overtimePay > 0 ? (
                          <>
                            +{money(p.overtimePay)}
                            <span className="ml-1 text-[11px] text-slate-400">({p.overtimeHours}h)</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                        {p.undertimeDeduction > 0 ? (
                          <>
                            -{money(p.undertimeDeduction)}
                            <span className="ml-1 text-[11px] text-slate-400">({p.undertimeHours}h)</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">
                        {p.deductions > 0 ? (
                          <>
                            -{money(p.deductions)}
                            <span className="ml-1 text-[11px] text-slate-400">({p.unpaidLeaveDays}d)</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{money(p.netPay)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                            p.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          )}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {p.status === "draft" && (
                          <button
                            disabled={busyId === p.id}
                            onClick={() => void pay(p.id)}
                            className="flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                          >
                            <CheckCircle2 size={12} /> Mark paid
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2.5 p-3 lg:hidden">
              {payroll.map((p) => (
                <div key={p.id} className="zs-surface p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800">{p.employeeName}</p>
                    <span
                      className={clsx(
                        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize",
                        p.status === "paid" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                    <span>Base {money(p.baseSalary)}</span>
                    <span className="text-right">
                      {p.overtimePay > 0 ? (
                        <span className="text-emerald-600">+{money(p.overtimePay)} OT</span>
                      ) : (
                        "No overtime"
                      )}
                    </span>
                    <span>
                      {p.undertimeDeduction > 0 ? (
                        <span className="text-rose-600">-{money(p.undertimeDeduction)} undertime</span>
                      ) : (
                        "No undertime"
                      )}
                    </span>
                    <span className="text-right">
                      {p.deductions > 0 ? (
                        <span className="text-rose-600">-{money(p.deductions)} leave</span>
                      ) : (
                        "No leave deduction"
                      )}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
                    <span className="font-semibold tabular-nums text-slate-900">{money(p.netPay)} net</span>
                    {p.status === "draft" && (
                      <button
                        disabled={busyId === p.id}
                        onClick={() => void pay(p.id)}
                        className="flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                      >
                        <CheckCircle2 size={12} /> Mark paid
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
