import { useEffect, useMemo, useState } from "react";
import { KeyRound, Plus, Search, Trash2, UserRound } from "lucide-react";
import clsx from "clsx";
import type { HrmDepartmentDTO, HrmEmployeeDTO, HrmEmployeeStatus, HrmShiftDTO } from "@zetsales/shared";
import {
  clearHrmEmployeePin,
  createHrmDepartment,
  createHrmEmployee,
  deleteHrmEmployee,
  setHrmEmployeePin,
  updateHrmEmployee,
  type HrmEmployeeInput,
} from "../../../lib/hrmApi";
import { Modal } from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/ToastProvider";

const STATUS_LABEL: Record<HrmEmployeeStatus, string> = {
  active: "Active",
  onLeave: "On leave",
  suspended: "Suspended",
  terminated: "Terminated",
};

const STATUS_TONE: Record<HrmEmployeeStatus, string> = {
  active: "bg-emerald-50 text-emerald-700",
  onLeave: "bg-amber-50 text-amber-700",
  suspended: "bg-orange-50 text-orange-700",
  terminated: "bg-slate-100 text-slate-500",
};

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const ADD_NEW_DESIGNATION = "__add_new_designation__";
const ADD_NEW_DEPARTMENT = "__add_new_department__";

// Styled in-app replacement for window.prompt() — opened when "+ Add new..." is picked from the
// Designation/Department dropdown. A dedicated text input here (not the select itself) means
// typing is never intercepted by the select's own type-ahead search.
function QuickAddModal({
  open,
  title,
  placeholder,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  placeholder: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (open) setValue("");
  }, [open]);

  const confirm = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <Modal open={open} onClose={onCancel} title={title} widthClass="max-w-xs">
      <div className="space-y-4">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={!value.trim()}
            className="flex h-9 flex-1 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
          <button
            onClick={onCancel}
            className="flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EmployeeFormModal({
  open,
  onClose,
  onSaved,
  departments,
  onDepartmentCreated,
  designationOptions,
  shifts,
  multiShift,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  departments: HrmDepartmentDTO[];
  onDepartmentCreated: () => void;
  designationOptions: string[];
  shifts: HrmShiftDTO[];
  multiShift: boolean;
  employee: HrmEmployeeDTO | null;
}) {
  const toast = useToast();
  const [form, setForm] = useState<HrmEmployeeInput>({});
  // The department's name, not its id — resolved to an id (existing match, or a freshly created
  // department) only at save time via resolveDepartmentId below. Kept as a name here so the
  // dropdown's "+ Add new department" option can add one without an id yet.
  const [departmentName, setDepartmentName] = useState("");
  const [saving, setSaving] = useState(false);
  const [addDesignationOpen, setAddDesignationOpen] = useState(false);
  const [addDepartmentOpen, setAddDepartmentOpen] = useState(false);
  const isEdit = !!employee;

  useEffect(() => {
    if (open) {
      setDepartmentName(employee?.departmentName ?? "");
      setForm(
        employee
          ? {
              name: employee.name,
              email: employee.email ?? "",
              phone: employee.phone ?? "",
              shiftId: employee.shiftId ?? "",
              shiftStartTime: employee.shiftStartTime,
              shiftEndTime: employee.shiftEndTime,
              designation: employee.designation,
              status: employee.status,
              joinDate: employee.joinDate,
              monthlySalary: employee.monthlySalary,
              address: employee.address ?? "",
              emergencyContact: employee.emergencyContact ?? "",
              notes: employee.notes ?? "",
            }
          : { status: "active", joinDate: new Date().toISOString().slice(0, 10), monthlySalary: 0 }
      );
    }
  }, [open, employee]);

  const set = <K extends keyof HrmEmployeeInput>(key: K, value: HrmEmployeeInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  const canSave = (form.name?.trim().length ?? 0) > 0 && (form.designation?.trim().length ?? 0) > 0 && !saving;

  // Case-insensitive match against existing departments so typing the name of one that already
  // exists reuses it instead of creating a duplicate; an unrecognized name creates a new one.
  const resolveDepartmentId = async (): Promise<string | null> => {
    const trimmed = departmentName.trim();
    if (!trimmed) return null;
    const existing = departments.find((d) => d.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const dept = await createHrmDepartment({ name: trimmed });
    onDepartmentCreated();
    return dept.id;
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const departmentId = await resolveDepartmentId();
      const payload = { ...form, departmentId };
      if (isEdit) {
        await updateHrmEmployee(employee!.id, payload);
        toast.push("Employee updated.", "success");
      } else {
        await createHrmEmployee(payload);
        toast.push("Employee added.", "success");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || "Could not save this employee.", "info");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit employee" : "Add employee"} widthClass="max-w-lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Full name</label>
            <input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Rahim Uddin" className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Designation</label>
            <select
              value={form.designation ?? ""}
              onChange={(e) => {
                if (e.target.value === ADD_NEW_DESIGNATION) {
                  setAddDesignationOpen(true);
                  return;
                }
                set("designation", e.target.value);
              }}
              className={inputClass}
            >
              <option value="" disabled>
                Select designation
              </option>
              {designationOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
              {form.designation && !designationOptions.includes(form.designation) && (
                <option value={form.designation}>{form.designation}</option>
              )}
              <option value={ADD_NEW_DESIGNATION}>+ Add new designation</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Phone</label>
            <input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Department</label>
            <select
              value={departmentName}
              onChange={(e) => {
                if (e.target.value === ADD_NEW_DEPARTMENT) {
                  setAddDepartmentOpen(true);
                  return;
                }
                setDepartmentName(e.target.value);
              }}
              className={inputClass}
            >
              <option value="">Unassigned</option>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
              {departmentName && !departments.some((d) => d.name === departmentName) && (
                <option value={departmentName}>{departmentName}</option>
              )}
              <option value={ADD_NEW_DEPARTMENT}>+ Add new department</option>
            </select>
          </div>
          {multiShift && (
            <div>
              <label className={labelClass}>Shift</label>
              <select
                value={form.shiftId ?? ""}
                onChange={(e) => {
                  const shiftId = e.target.value;
                  const shift = shifts.find((s) => s.id === shiftId);
                  setForm((f) => ({
                    ...f,
                    shiftId,
                    // Defaults to the shift's own hours whenever the shift selection changes —
                    // still freely editable afterward via the fields below.
                    shiftStartTime: shift?.startTime ?? null,
                    shiftEndTime: shift?.endTime ?? null,
                  }));
                }}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {shifts.length === 0 && <p className="mt-1.5 text-[11px] text-slate-400">Add shifts from Settings first.</p>}
            </div>
          )}
          <div>
            <label className={labelClass}>Status</label>
            <select value={form.status ?? "active"} onChange={(e) => set("status", e.target.value as HrmEmployeeStatus)} className={inputClass}>
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {multiShift && form.shiftId && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Shift start (for this employee)</label>
              <input
                type="time"
                value={form.shiftStartTime ?? ""}
                onChange={(e) => set("shiftStartTime", e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Shift end (for this employee)</label>
              <input
                type="time"
                value={form.shiftEndTime ?? ""}
                onChange={(e) => set("shiftEndTime", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Join date</label>
            <input type="date" value={form.joinDate ?? ""} onChange={(e) => set("joinDate", e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Monthly salary (৳)</label>
            <input
              type="number"
              min={0}
              value={form.monthlySalary ?? 0}
              onChange={(e) => set("monthlySalary", Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Address</label>
          <input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Emergency contact</label>
          <input value={form.emergencyContact ?? ""} onChange={(e) => set("emergencyContact", e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Notes</label>
          <input value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Optional" className={inputClass} />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : isEdit ? "Save changes" : "Add employee"}
        </button>
      </div>

      <QuickAddModal
        open={addDesignationOpen}
        title="Add new designation"
        placeholder="e.g. Warehouse Associate"
        onCancel={() => setAddDesignationOpen(false)}
        onConfirm={(value) => {
          set("designation", value);
          setAddDesignationOpen(false);
        }}
      />
      <QuickAddModal
        open={addDepartmentOpen}
        title="Add new department"
        placeholder="e.g. Warehouse Operations"
        onCancel={() => setAddDepartmentOpen(false)}
        onConfirm={(value) => {
          setDepartmentName(value);
          setAddDepartmentOpen(false);
        }}
      />
    </Modal>
  );
}

function SetPinModal({
  open,
  onClose,
  onSaved,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  employee: HrmEmployeeDTO | null;
}) {
  const toast = useToast();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPin("");
      setConfirmPin("");
    }
  }, [open]);

  const canSave = /^\d{4,6}$/.test(pin) && pin === confirmPin && !saving;

  const save = async () => {
    if (!canSave || !employee) return;
    setSaving(true);
    try {
      await setHrmEmployeePin(employee.id, pin);
      toast.push("PIN saved. Share it with the employee — it won't be shown again.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || "Could not save this PIN.", "info");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!employee || !window.confirm(`Remove ${employee.name}'s punch PIN? They won't be able to use the attendance page until a new one is set.`)) return;
    setSaving(true);
    try {
      await clearHrmEmployeePin(employee.id);
      toast.push("PIN removed.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || "Could not remove this PIN.", "info");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-center text-xl tracking-[0.4em] text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${employee?.hasPin ? "Reset" : "Set"} attendance PIN`}
      subtitle={`${employee?.name ?? ""} will use this PIN on the attendance page to check in/out — no login needed.`}
      widthClass="max-w-sm"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">4-6 digit PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Confirm PIN</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className={inputClass}
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save PIN"}
        </button>
        {employee?.hasPin && (
          <button
            onClick={() => void clear()}
            disabled={saving}
            className="flex h-9 w-full items-center justify-center text-xs font-semibold text-rose-500 hover:text-rose-600 disabled:opacity-40"
          >
            Remove PIN
          </button>
        )}
      </div>
    </Modal>
  );
}

export function EmployeesTab({
  employees,
  departments,
  shifts,
  multiShift,
  loading,
  onChanged,
}: {
  employees: HrmEmployeeDTO[];
  departments: HrmDepartmentDTO[];
  shifts: HrmShiftDTO[];
  multiShift: boolean;
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<HrmEmployeeDTO | null>(null);
  const [pinTarget, setPinTarget] = useState<HrmEmployeeDTO | null>(null);

  const designationOptions = useMemo(
    () => Array.from(new Set(employees.map((e) => e.designation).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [employees]
  );

  const rows = useMemo(() => {
    let list = employees;
    if (shiftFilter) list = list.filter((e) => e.shiftId === shiftFilter);
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((e) => e.name.toLowerCase().includes(q) || e.employeeCode.toLowerCase().includes(q) || e.designation.toLowerCase().includes(q));
  }, [employees, search, shiftFilter]);

  const remove = async (employee: HrmEmployeeDTO) => {
    if (!window.confirm(`Remove ${employee.name} from HRM? This cannot be undone.`)) return;
    try {
      await deleteHrmEmployee(employee.id);
      toast.push("Employee removed.", "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not remove this employee.", "info");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="zs-search">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employees" className="zs-search-input" />
          </div>
          {multiShift && shifts.length > 0 && (
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400"
            >
              <option value="">All shifts</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={14} /> Add employee
        </button>
      </div>

      <div className="zs-table-wrap">
        {loading && employees.length === 0 ? (
          <div className="zs-loading-state">Loading employees...</div>
        ) : rows.length === 0 ? (
          <div className="zs-empty-state">
            <UserRound size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No employees yet</p>
            <p className="max-w-sm text-xs text-slate-400">Add your first team member to start tracking attendance, leave, and payroll.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="zs-table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Employee</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Department</th>
                  {multiShift && <th className="px-4 py-2.5 text-left font-semibold">Shift</th>}
                  <th className="px-4 py-2.5 text-left font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Salary</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Joined</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Attendance PIN</th>
                  <th className="px-4 py-2.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="zs-table-body">
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className="zs-data-row cursor-pointer"
                    onClick={() => {
                      setEditing(e);
                      setFormOpen(true);
                    }}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{e.name}</p>
                      <p className="text-xs text-slate-400">
                        {e.employeeCode} · {e.designation}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{e.departmentName || "Unassigned"}</td>
                    {multiShift && <td className="px-4 py-3 text-slate-600">{e.shiftName || "Unassigned"}</td>}
                    <td className="px-4 py-3">
                      <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", STATUS_TONE[e.status])}>
                        {STATUS_LABEL[e.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800">{money(e.monthlySalary)}</td>
                    <td className="px-4 py-3 text-slate-500">{new Date(e.joinDate).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(evt) => {
                          evt.stopPropagation();
                          setPinTarget(e);
                        }}
                        className={clsx(
                          "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                          e.hasPin ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        )}
                      >
                        <KeyRound size={11} /> {e.hasPin ? "PIN set" : "Set PIN"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(evt) => {
                          evt.stopPropagation();
                          void remove(e);
                        }}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={onChanged}
        departments={departments}
        onDepartmentCreated={onChanged}
        designationOptions={designationOptions}
        shifts={shifts}
        multiShift={multiShift}
        employee={editing}
      />
      <SetPinModal open={!!pinTarget} onClose={() => setPinTarget(null)} onSaved={onChanged} employee={pinTarget} />
    </div>
  );
}
