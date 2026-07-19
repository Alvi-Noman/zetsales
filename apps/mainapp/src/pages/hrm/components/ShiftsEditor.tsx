import { useState } from "react";
import { Clock3, Plus, Trash2 } from "lucide-react";
import { HRM_SHIFT_PRESETS, type HrmShiftDTO } from "@zetsales/shared";
import { createHrmShift, deleteHrmShift } from "../../../lib/hrmApi";
import { useToast } from "../../../components/ui/ToastProvider";

// Sensible default start/end for each preset name — user can add it as-is or add a custom shift
// with their own times right after.
const PRESET_TIMES: Record<(typeof HRM_SHIFT_PRESETS)[number], { startTime: string; endTime: string }> = {
  "Morning Shift": { startTime: "06:00", endTime: "14:00" },
  "Day Shift": { startTime: "09:00", endTime: "17:00" },
  "Evening Shift": { startTime: "14:00", endTime: "22:00" },
  "Night Shift": { startTime: "22:00", endTime: "06:00" },
};

function timeLabel(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function ShiftsEditor({ shifts, onChanged }: { shifts: HrmShiftDTO[]; onChanged: () => void }) {
  const toast = useToast();
  const [addingPreset, setAddingPreset] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customStart, setCustomStart] = useState("09:00");
  const [customEnd, setCustomEnd] = useState("17:00");
  const [savingCustom, setSavingCustom] = useState(false);

  const existingNames = new Set(shifts.map((s) => s.name.toLowerCase()));
  const availablePresets = HRM_SHIFT_PRESETS.filter((p) => !existingNames.has(p.toLowerCase()));

  const addPreset = async (name: (typeof HRM_SHIFT_PRESETS)[number]) => {
    setAddingPreset(name);
    try {
      await createHrmShift({ name, ...PRESET_TIMES[name] });
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not add this shift.", "info");
    } finally {
      setAddingPreset(null);
    }
  };

  const addCustom = async () => {
    if (!customName.trim()) return;
    setSavingCustom(true);
    try {
      await createHrmShift({ name: customName.trim(), startTime: customStart, endTime: customEnd });
      setCustomName("");
      setCustomOpen(false);
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not add this shift.", "info");
    } finally {
      setSavingCustom(false);
    }
  };

  const remove = async (shift: HrmShiftDTO) => {
    if (!window.confirm(`Delete "${shift.name}"? Employees assigned to it will need a new shift.`)) return;
    try {
      await deleteHrmShift(shift.id);
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not delete this shift.", "info");
    }
  };

  const inputClass =
    "h-9 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15";

  return (
    <div className="space-y-3">
      {shifts.length > 0 && (
        <div className="space-y-1.5">
          {shifts.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2">
                <Clock3 size={14} className="text-slate-400" />
                <span className="text-sm font-medium text-slate-800">{s.name}</span>
                <span className="text-xs text-slate-400">
                  {timeLabel(s.startTime)} – {timeLabel(s.endTime)}
                </span>
              </div>
              <button onClick={() => void remove(s)} className="rounded-md p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {availablePresets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-400">Quick add:</span>
          {availablePresets.map((preset) => (
            <button
              key={preset}
              onClick={() => void addPreset(preset)}
              disabled={addingPreset === preset}
              className="flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Plus size={11} /> {preset}
            </button>
          ))}
        </div>
      )}

      {customOpen ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Name</label>
            <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Weekend Shift" className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Start</label>
            <input type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-500">End</label>
            <input type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className={inputClass} />
          </div>
          <button
            onClick={() => void addCustom()}
            disabled={!customName.trim() || savingCustom}
            className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {savingCustom ? "Adding..." : "Add"}
          </button>
          <button onClick={() => setCustomOpen(false)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 hover:bg-white">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          className="flex h-8 items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-500 hover:bg-slate-50"
        >
          <Plus size={12} /> Add custom shift
        </button>
      )}
    </div>
  );
}
