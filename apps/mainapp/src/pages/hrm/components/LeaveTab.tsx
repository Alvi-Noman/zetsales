import { useEffect, useState } from "react";
import { Check, ClipboardList, Plus, X } from "lucide-react";
import clsx from "clsx";
import type { HrmEmployeeDTO, HrmLeaveRequestDTO, HrmLeaveType } from "@zetsales/shared";
import { cancelHrmLeaveRequest, createHrmLeaveRequest, decideHrmLeaveRequest } from "../../../lib/hrmApi";
import { Modal } from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/ToastProvider";

const TYPE_LABEL: Record<HrmLeaveType, string> = {
  sick: "Sick",
  casual: "Casual",
  annual: "Annual",
  unpaid: "Unpaid",
  other: "Other",
};

const STATUS_TONE: Record<HrmLeaveRequestDTO["status"], string> = {
  pending: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

function RequestLeaveModal({
  open,
  onClose,
  onSaved,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  employees: HrmEmployeeDTO[];
}) {
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState("");
  const [type, setType] = useState<HrmLeaveType>("casual");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmployeeId("");
      setType("casual");
      setFromDate("");
      setToDate("");
      setReason("");
    }
  }, [open]);

  const canSave = employeeId && fromDate && toDate && reason.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createHrmLeaveRequest({ employeeId, type, fromDate, toDate, reason: reason.trim() });
      toast.push("Leave request submitted.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || "Could not submit this leave request.", "info");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

  return (
    <Modal open={open} onClose={onClose} title="Request leave" widthClass="max-w-md">
      <div className="space-y-4">
        <div>
          <label className={labelClass}>Employee</label>
          <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={inputClass}>
            <option value="">Select employee</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.employeeCode})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Leave type</label>
          <select value={type} onChange={(e) => setType(e.target.value as HrmLeaveType)} className={inputClass}>
            {Object.entries(TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>To</label>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div>
          <label className={labelClass}>Reason</label>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family emergency" className={inputClass} />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Submitting..." : "Submit request"}
        </button>
      </div>
    </Modal>
  );
}

export function LeaveTab({
  leaveRequests,
  employees,
  loading,
  onChanged,
}: {
  leaveRequests: HrmLeaveRequestDTO[];
  employees: HrmEmployeeDTO[];
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [requestOpen, setRequestOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const decide = async (id: string, status: "approved" | "rejected") => {
    setBusyId(id);
    try {
      await decideHrmLeaveRequest(id, status);
      toast.push(`Leave request ${status}.`, "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not update this request.", "info");
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (id: string) => {
    setBusyId(id);
    try {
      await cancelHrmLeaveRequest(id);
      toast.push("Leave request cancelled.", "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not cancel this request.", "info");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setRequestOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={14} /> Request leave
        </button>
      </div>

      <div className="zs-table-wrap">
        {loading && leaveRequests.length === 0 ? (
          <div className="zs-loading-state">Loading leave requests...</div>
        ) : leaveRequests.length === 0 ? (
          <div className="zs-empty-state">
            <ClipboardList size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No leave requests</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="zs-table-head">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Type</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Dates</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Days</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Reason</th>
                    <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                    <th className="px-4 py-2.5 text-right font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="zs-table-body">
                  {leaveRequests.map((r) => (
                    <tr key={r.id} className="zs-data-row">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.employeeName}</td>
                      <td className="px-4 py-3 text-slate-600">{TYPE_LABEL[r.type]}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {new Date(r.fromDate).toLocaleDateString()} – {new Date(r.toDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.days}</td>
                      <td className="px-4 py-3 max-w-[240px] truncate text-slate-500" title={r.reason}>
                        {r.reason}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize", STATUS_TONE[r.status])}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.status === "pending" && (
                          <div className="flex justify-end gap-1.5">
                            <button
                              disabled={busyId === r.id}
                              onClick={() => void decide(r.id, "approved")}
                              className="flex h-7 items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                            >
                              <Check size={12} /> Approve
                            </button>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => void decide(r.id, "rejected")}
                              className="flex h-7 items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                            >
                              <X size={12} /> Reject
                            </button>
                            <button
                              disabled={busyId === r.id}
                              onClick={() => void cancel(r.id)}
                              className="flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-2.5 p-3 lg:hidden">
              {leaveRequests.map((r) => (
                <div key={r.id} className="zs-surface p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800">{r.employeeName}</p>
                      <p className="text-xs text-slate-400">
                        {TYPE_LABEL[r.type]} · {r.days} day{r.days === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className={clsx("inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold capitalize", STATUS_TONE[r.status])}>
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-2.5 border-t border-slate-100 pt-2.5 text-xs text-slate-500">
                    <p>
                      {new Date(r.fromDate).toLocaleDateString()} – {new Date(r.toDate).toLocaleDateString()}
                    </p>
                    <p className="mt-1 text-slate-500">{r.reason}</p>
                  </div>
                  {r.status === "pending" && (
                    <div className="mt-2.5 flex gap-1.5">
                      <button
                        disabled={busyId === r.id}
                        onClick={() => void decide(r.id, "approved")}
                        className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                      >
                        <Check size={12} /> Approve
                      </button>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => void decide(r.id, "rejected")}
                        className="flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                      >
                        <X size={12} /> Reject
                      </button>
                      <button
                        disabled={busyId === r.id}
                        onClick={() => void cancel(r.id)}
                        className="flex h-7 items-center rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <RequestLeaveModal open={requestOpen} onClose={() => setRequestOpen(false)} onSaved={onChanged} employees={employees} />
    </div>
  );
}
