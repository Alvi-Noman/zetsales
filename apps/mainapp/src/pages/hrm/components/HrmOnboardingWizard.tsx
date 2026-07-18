import { useState } from "react";
import { Building2, Check, Clock, Copy, ExternalLink, KeyRound, PartyPopper, Plus, Smartphone } from "lucide-react";
import clsx from "clsx";
import { HRM_DEPARTMENT_PRESETS, type HrmDepartmentDTO, type HrmSettingsDTO } from "@zetsales/shared";
import { createHrmDepartment, updateHrmSettings } from "../../../lib/hrmApi";
import { Modal } from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/ToastProvider";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STEP_LABELS = ["Welcome", "Office hours", "Weekly off", "Wages & overtime", "Departments", "Employee portal"];

export function HrmOnboardingWizard({
  open,
  departments,
  onDepartmentAdded,
  onFinished,
}: {
  open: boolean;
  departments: HrmDepartmentDTO[];
  onDepartmentAdded: () => void;
  onFinished: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [officeStartTime, setOfficeStartTime] = useState("09:00");
  const [officeEndTime, setOfficeEndTime] = useState("18:00");
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([5]);
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(1.5);
  const [workingDaysPerMonth, setWorkingDaysPerMonth] = useState(26);
  const [payrollNotes, setPayrollNotes] = useState("");
  const [addingPreset, setAddingPreset] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const finish = async (asSkip: boolean) => {
    setFinishing(true);
    try {
      await updateHrmSettings({
        officeStartTime,
        officeEndTime,
        weeklyOffDays,
        overtimeMultiplier,
        workingDaysPerMonth,
        payrollNotes,
        markOnboarded: true,
      });
      toast.push(asSkip ? "Setup skipped — you can change these anytime in Settings." : "HRM setup complete.", "success");
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
  const isLastStep = step === STEP_LABELS.length - 1;

  return (
    <Modal open={open} onClose={() => void finish(true)} title="Set up HRM" widthClass="max-w-lg" bodyClassName="max-h-[75vh] overflow-y-auto px-6 py-5">
      <div className="mb-5 flex items-center gap-1.5">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center gap-1.5">
            <div
              className={clsx(
                "h-1.5 flex-1 rounded-full transition-colors",
                i <= step ? "bg-indigo-500" : "bg-slate-150 bg-slate-200"
              )}
            />
          </div>
        ))}
      </div>
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
        Step {step + 1} of {STEP_LABELS.length} · {STEP_LABELS[step]}
      </p>

      {step === 0 && (
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

      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-slate-700">
            <Clock size={16} className="text-slate-400" />
            <p className="text-sm">When is your office open?</p>
          </div>
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
        </div>
      )}

      {step === 2 && (
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

      {step === 3 && (
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

      {step === 4 && (
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

      {step === 5 && (
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

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={() => void finish(true)}
          disabled={finishing}
          className="text-xs font-semibold text-slate-400 hover:text-slate-600 disabled:opacity-40"
        >
          Skip setup
        </button>
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
              onClick={() => void finish(false)}
              disabled={finishing}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {finishing ? "Finishing..." : "Finish setup"}
            </button>
          ) : (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex h-9 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
