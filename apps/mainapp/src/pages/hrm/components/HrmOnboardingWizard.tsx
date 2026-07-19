import { useEffect, useMemo, useState } from "react";
import { Building2, Check, Clock, Copy, ExternalLink, KeyRound, PartyPopper, Plus, Smartphone, Users } from "lucide-react";
import clsx from "clsx";
import { HRM_DEPARTMENT_PRESETS, type HrmDepartmentDTO, type HrmEmployeeDTO, type HrmShiftDTO } from "@zetsales/shared";
import { createHrmDepartment, updateHrmEmployee, updateHrmSettings } from "../../../lib/hrmApi";
import { Modal } from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/ToastProvider";
import { ShiftsEditor } from "./ShiftsEditor";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// The step list is dynamic, not fixed — "Assign shifts" only exists when there's both a
// multi-shift setup and actual employees to assign, so it never shows as an empty, pointless step.
type StepKey = "welcome" | "hours" | "assignShifts" | "weeklyOff" | "wages" | "departments" | "portal";

const STEP_LABEL: Record<StepKey, string> = {
  welcome: "Welcome",
  hours: "Office hours",
  assignShifts: "Assign shifts",
  weeklyOff: "Weekly off",
  wages: "Wages & overtime",
  departments: "Departments",
  portal: "Employee portal",
};

export function HrmOnboardingWizard({
  open,
  departments,
  onDepartmentAdded,
  shifts,
  onShiftAdded,
  employees,
  onEmployeeUpdated,
  onFinished,
}: {
  open: boolean;
  departments: HrmDepartmentDTO[];
  onDepartmentAdded: () => void;
  shifts: HrmShiftDTO[];
  onShiftAdded: () => void;
  employees: HrmEmployeeDTO[];
  onEmployeeUpdated: () => void;
  onFinished: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [officeStartTime, setOfficeStartTime] = useState("09:00");
  const [officeEndTime, setOfficeEndTime] = useState("18:00");
  const [multiShift, setMultiShift] = useState(false);
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([5]);
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(1.5);
  const [workingDaysPerMonth, setWorkingDaysPerMonth] = useState(26);
  const [payrollNotes, setPayrollNotes] = useState("");
  const [addingPreset, setAddingPreset] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savingEmployeeId, setSavingEmployeeId] = useState<string | null>(null);

  const activeEmployees = useMemo(() => employees.filter((e) => e.status !== "terminated"), [employees]);

  const steps = useMemo<StepKey[]>(() => {
    const list: StepKey[] = ["welcome", "hours"];
    if (multiShift && activeEmployees.length > 0) list.push("assignShifts");
    list.push("weeklyOff", "wages", "departments", "portal");
    return list;
  }, [multiShift, activeEmployees.length]);

  // If the step list shrinks out from under the current position (e.g. multiShift got toggled
  // back off after going past it), snap back to a valid index instead of rendering nothing.
  useEffect(() => {
    if (step >= steps.length) setStep(steps.length - 1);
  }, [step, steps.length]);
  const stepKey = steps[step] ?? steps[steps.length - 1];

  const punchUrl = `${window.location.origin}/punch`;
  const toggleDay = (day: number) => setWeeklyOffDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  const existingNames = new Set(departments.map((d) => d.name.toLowerCase()));
  const availablePresets = HRM_DEPARTMENT_PRESETS.filter((p) => !existingNames.has(p.toLowerCase()));

  const addPreset = async (name: string) => {
    setAddingPreset(name);
    try {
      await createHrmDepartment({ name });
      onDepartmentAdded();
    } catch (err) {
      toast.push((err as Error).message || "Could not add this department.", "info");
    } finally {
      setAddingPreset(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(punchUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push("Could not copy — select and copy the link manually.", "info");
    }
  };

  // Picking a shift here defaults the employee's own start/end time to that shift's hours, same
  // as doing it from the Employees tab — those fields become editable right below once assigned.
  const assignShift = async (employee: HrmEmployeeDTO, shiftId: string) => {
    const shift = shifts.find((s) => s.id === shiftId);
    setSavingEmployeeId(employee.id);
    try {
      await updateHrmEmployee(employee.id, {
        shiftId: shiftId || null,
        shiftStartTime: shift?.startTime ?? null,
        shiftEndTime: shift?.endTime ?? null,
      });
      onEmployeeUpdated();
    } catch (err) {
      toast.push((err as Error).message || "Could not assign this shift.", "info");
    } finally {
      setSavingEmployeeId(null);
    }
  };

  const updateEmployeeShiftTime = async (employee: HrmEmployeeDTO, field: "shiftStartTime" | "shiftEndTime", value: string) => {
    setSavingEmployeeId(employee.id);
    try {
      await updateHrmEmployee(employee.id, { [field]: value });
      onEmployeeUpdated();
    } catch (err) {
      toast.push((err as Error).message || "Could not update this employee's shift time.", "info");
    } finally {
      setSavingEmployeeId(null);
    }
  };

  const finish = async () => {
    setFinishing(true);
    try {
      await updateHrmSettings({
        officeStartTime,
        officeEndTime,
        multiShift,
        weeklyOffDays,
        overtimeMultiplier,
        workingDaysPerMonth,
        payrollNotes,
        markOnboarded: true,
      });
      toast.push("HRM setup complete.", "success");
      onFinished();
    } catch (err) {
      toast.push((err as Error).message || "Could not save setup.", "info");
    } finally {
      setFinishing(false);
    }
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";
  const isLastStep = step === steps.length - 1;

  // Each step must actually be filled in before moving on — this wizard has no "Skip" escape
  // hatch, so a step with nothing valid to submit would otherwise let someone click straight
  // through without office hours/shifts or a sane overtime rate ever being set.
  const canProceed =
    stepKey === "hours"
      ? multiShift
        ? shifts.length > 0
        : !!officeStartTime && !!officeEndTime
      : stepKey === "wages"
        ? overtimeMultiplier >= 1 && workingDaysPerMonth >= 1 && workingDaysPerMonth <= 31
        : true;

  return (
    <Modal open={open} onClose={() => {}} dismissible={false} title="Set up HRM" widthClass="max-w-lg" bodyClassName="max-h-[75vh] overflow-y-auto px-6 py-5">
      <div className="mb-5 flex items-center gap-1.5">
        {steps.map((key, i) => (
          <div key={key} className="flex flex-1 items-center gap-1.5">
            <div className={clsx("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-indigo-500" : "bg-slate-200")} />
          </div>
        ))}
      </div>
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
        Step {step + 1} of {steps.length} · {STEP_LABEL[stepKey]}
      </p>

      {stepKey === "welcome" && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-50">
            <PartyPopper size={26} className="text-indigo-500" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Welcome to HRM</h2>
          <p className="text-sm text-slate-500">
            A few quick questions so payroll, overtime, and attendance work correctly from day one — office hours, weekly off
            days, overtime pay, and your departments. Takes about a minute.
          </p>
        </div>
      )}

      {stepKey === "hours" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Clock size={16} className="text-slate-400" />
            <p className="text-sm">When is your office open?</p>
          </div>

          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={multiShift} onChange={(e) => setMultiShift(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            I have multiple shifts (e.g. Morning, Evening, Night)
          </label>

          {multiShift ? (
            <div>
              <p className="mb-2 text-xs text-slate-500">
                {activeEmployees.length > 0
                  ? "Set up your shifts — you'll assign your employees to them next."
                  : "Set up your shifts — you can assign employees to them anytime from the Employees tab once you've added some."}
              </p>
              <ShiftsEditor shifts={shifts} onChanged={onShiftAdded} />
              {shifts.length === 0 && <p className="mt-2 text-[11px] font-medium text-amber-600">Add at least one shift to continue.</p>}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Start time</label>
                  <input type="time" value={officeStartTime} onChange={(e) => setOfficeStartTime(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>End time</label>
                  <input type="time" value={officeEndTime} onChange={(e) => setOfficeEndTime(e.target.value)} className={inputClass} />
                </div>
              </div>
              <p className="text-xs text-slate-400">
                Hours worked beyond this window count as overtime; falling short counts as undertime — both adjust payroll automatically.
              </p>
            </>
          )}
        </div>
      )}

      {stepKey === "assignShifts" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Users size={16} className="text-slate-400" />
            <p className="text-sm">Assign each employee to a shift — optional, you can change this anytime from Employees.</p>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {activeEmployees.map((employee) => {
              const busy = savingEmployeeId === employee.id;
              return (
                <div key={employee.id} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">{employee.name}</span>
                    <select
                      value={employee.shiftId ?? ""}
                      disabled={busy}
                      onChange={(e) => void assignShift(employee, e.target.value)}
                      className="h-8 shrink-0 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none focus:border-indigo-400 disabled:opacity-50"
                    >
                      <option value="">Unassigned</option>
                      {shifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {employee.shiftId && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        type="time"
                        value={employee.shiftStartTime ?? ""}
                        disabled={busy}
                        onChange={(e) => void updateEmployeeShiftTime(employee, "shiftStartTime", e.target.value)}
                        className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none focus:border-indigo-400 disabled:opacity-50"
                      />
                      <input
                        type="time"
                        value={employee.shiftEndTime ?? ""}
                        disabled={busy}
                        onChange={(e) => void updateEmployeeShiftTime(employee, "shiftEndTime", e.target.value)}
                        className="h-8 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700 outline-none focus:border-indigo-400 disabled:opacity-50"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stepKey === "weeklyOff" && (
        <div className="space-y-4">
          <p className="text-sm text-slate-700">Which day(s) are never a working day?</p>
          <div className="flex flex-wrap gap-1.5">
            {DAY_LABELS.map((label, day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={clsx(
                  "h-9 min-w-[3.25rem] rounded-lg border px-2 text-xs font-semibold transition-colors",
                  weeklyOffDays.includes(day) ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            {weeklyOffDays.length === 0
              ? "No weekly off selected — every day counts as a working day."
              : "Any hours worked on these days count entirely as overtime, not just the excess."}
          </p>
        </div>
      )}

      {stepKey === "wages" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Overtime rate multiplier</label>
              <input
                type="number"
                min={1}
                step={0.1}
                value={overtimeMultiplier}
                onChange={(e) => setOvertimeMultiplier(Number(e.target.value))}
                className={inputClass}
              />
              <p className="mt-1.5 text-[11px] text-slate-400">1.5 = time-and-a-half per overtime hour.</p>
            </div>
            <div>
              <label className={labelClass}>Working days / month</label>
              <input
                type="number"
                min={1}
                max={31}
                value={workingDaysPerMonth}
                onChange={(e) => setWorkingDaysPerMonth(Number(e.target.value))}
                className={inputClass}
              />
              <p className="mt-1.5 text-[11px] text-slate-400">Used to derive a daily/hourly rate from salary.</p>
            </div>
          </div>
          <div>
            <label className={labelClass}>Any other wage terms? (optional)</label>
            <textarea
              value={payrollNotes}
              onChange={(e) => setPayrollNotes(e.target.value)}
              placeholder="e.g. Salary paid via bank transfer on the 5th of each month. Unpaid leave beyond 3 days needs owner approval."
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
      )}

      {stepKey === "departments" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Building2 size={16} className="text-slate-400" />
            <p className="text-sm">Add a few departments to start (optional, you can add more anytime)</p>
          </div>
          {availablePresets.length === 0 ? (
            <p className="text-xs text-slate-400">All suggested departments have been added.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availablePresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => void addPreset(preset)}
                  disabled={addingPreset === preset}
                  className="flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={11} /> {preset}
                </button>
              ))}
            </div>
          )}
          {departments.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-500">Added so far</p>
              <div className="flex flex-wrap gap-1.5">
                {departments.map((d) => (
                  <span key={d.id} className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <Check size={11} /> {d.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {stepKey === "portal" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Smartphone size={16} className="text-slate-400" />
            <p className="text-sm">Where employees check in and out — no login needed</p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <code className="flex-1 truncate text-sm font-medium text-slate-800">{punchUrl}</code>
            <button
              onClick={() => void copyLink()}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href="/punch"
              target="_blank"
              rel="noreferrer"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ExternalLink size={13} /> Open
            </a>
          </div>
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <KeyRound size={13} className="mt-0.5 shrink-0" />
            <p>Share this link with your team, and give each employee a PIN from the Employees tab — that's what unlocks this page for them.</p>
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center justify-end">
        <div className="flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={finishing}
              className="flex h-9 items-center rounded-lg border border-slate-200 px-3.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              Back
            </button>
          )}
          {isLastStep ? (
            <button
              onClick={() => void finish()}
              disabled={finishing || !canProceed}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {finishing ? "Finishing..." : "Finish setup"}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed}
              className="flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
