import { useEffect, useState } from "react";
import { Check, Clock, Copy, ExternalLink, KeyRound, Save, Smartphone } from "lucide-react";
import clsx from "clsx";
import type { HrmSettingsDTO } from "@zetsales/shared";
import { updateHrmSettings } from "../../../lib/hrmApi";
import { useToast } from "../../../components/ui/ToastProvider";

function PunchPortalCard() {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const punchUrl = `${window.location.origin}/punch`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(punchUrl);
      setCopied(true);
      toast.push("Link copied.", "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.push("Could not copy — select and copy the link manually.", "info");
    }
  };

  return (
    <div className="zs-table-wrap p-5">
      <div className="mb-1 flex items-center gap-2">
        <Smartphone size={15} className="text-slate-400" />
        <h3 className="text-sm font-semibold text-slate-800">Employee attendance portal</h3>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        This is where your employees check in, check out, and log breaks — no login required, works from any phone or computer
        (including from home).
      </p>

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
        <code className="flex-1 truncate text-sm font-medium text-slate-800">{punchUrl}</code>
        <button
          onClick={() => void copy()}
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

      <div className="mt-4 space-y-3">
        <div className="flex gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">1</span>
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Set a PIN for each employee</span> — go to{" "}
            <span className="font-medium">Employees</span>, click <span className="font-medium">"Set PIN"</span> next to their name, and give
            them a 4-6 digit code.
          </p>
        </div>
        <div className="flex gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">2</span>
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">Share the link above</span> with your team — ask them to bookmark it on their
            phone or home computer.
          </p>
        </div>
        <div className="flex gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">3</span>
          <p className="text-xs text-slate-600">
            <span className="font-semibold text-slate-800">They pick their name and enter their PIN</span> — the page shows only the action
            that makes sense right now: <span className="font-medium">I'm In</span>, <span className="font-medium">Taking a break</span>,{" "}
            <span className="font-medium">I'm Back</span>, or <span className="font-medium">I'm Out</span>.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <KeyRound size={13} className="mt-0.5 shrink-0" />
        <p>An employee without a PIN set can't use this page yet — check the Employees tab for anyone still showing "Set PIN".</p>
      </div>
    </div>
  );
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SettingsTab({ settings, loading, onChanged }: { settings: HrmSettingsDTO | null; loading: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [officeStartTime, setOfficeStartTime] = useState("09:00");
  const [officeEndTime, setOfficeEndTime] = useState("18:00");
  const [weeklyOffDays, setWeeklyOffDays] = useState<number[]>([]);
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(1.5);
  const [workingDaysPerMonth, setWorkingDaysPerMonth] = useState(26);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setOfficeStartTime(settings.officeStartTime);
      setOfficeEndTime(settings.officeEndTime);
      setWeeklyOffDays(settings.weeklyOffDays);
      setOvertimeMultiplier(settings.overtimeMultiplier);
      setWorkingDaysPerMonth(settings.workingDaysPerMonth);
    }
  }, [settings]);

  const toggleDay = (day: number) => setWeeklyOffDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));

  const save = async () => {
    setSaving(true);
    try {
      await updateHrmSettings({ officeStartTime, officeEndTime, weeklyOffDays, overtimeMultiplier, workingDaysPerMonth });
      toast.push("HRM settings saved.", "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not save settings.", "info");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15";
  const labelClass = "mb-1.5 block text-xs font-semibold text-slate-600";

  if (loading && !settings) return <div className="zs-loading-state">Loading settings...</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <PunchPortalCard />

      <div className="zs-table-wrap p-5">
        <div className="mb-4 flex items-center gap-2">
          <Clock size={15} className="text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Office hours &amp; overtime</h3>
        </div>
        <p className="mb-4 text-xs text-slate-400">
          Used to calculate overtime and undertime on payroll — hours worked beyond office hours (or any hours on a weekly off day)
          count as overtime; falling short on a working day is deducted as undertime.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Office start time</label>
            <input type="time" value={officeStartTime} onChange={(e) => setOfficeStartTime(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Office end time</label>
            <input type="time" value={officeEndTime} onChange={(e) => setOfficeEndTime(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="mt-4">
          <label className={labelClass}>Weekly off day(s)</label>
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
          <p className="mt-1.5 text-[11px] text-slate-400">
            {weeklyOffDays.length === 0 ? "No weekly off day — every day is a working day." : "Any hours worked on these days count entirely as overtime."}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
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
            <p className="mt-1.5 text-[11px] text-slate-400">e.g. 1.5 = time-and-a-half for every overtime hour.</p>
          </div>
          <div>
            <label className={labelClass}>Working days per month</label>
            <input
              type="number"
              min={1}
              max={31}
              value={workingDaysPerMonth}
              onChange={(e) => setWorkingDaysPerMonth(Number(e.target.value))}
              className={inputClass}
            />
            <p className="mt-1.5 text-[11px] text-slate-400">Used to derive a daily/hourly rate from monthly salary.</p>
          </div>
        </div>

        <button
          onClick={() => void save()}
          disabled={saving}
          className="mt-5 flex h-10 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save size={14} /> {saving ? "Saving..." : "Save settings"}
        </button>
      </div>
    </div>
  );
}
