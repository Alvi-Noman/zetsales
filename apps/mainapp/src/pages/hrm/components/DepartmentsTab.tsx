import { useEffect, useMemo, useState } from "react";
import { Building2, Plus, Trash2 } from "lucide-react";
import { HRM_DEPARTMENT_PRESETS, type HrmDepartmentDTO } from "@zetsales/shared";
import { createHrmDepartment, deleteHrmDepartment } from "../../../lib/hrmApi";
import { Modal } from "../../../components/ui/Modal";
import { useToast } from "../../../components/ui/ToastProvider";

function AddDepartmentModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setDescription("");
    }
  }, [open]);

  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createHrmDepartment({ name: name.trim(), description: description.trim() || undefined });
      toast.push("Department added.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || "Could not save this department.", "info");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add department" widthClass="max-w-sm">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Warehouse Operations"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Add department"}
        </button>
      </div>
    </Modal>
  );
}

export function DepartmentsTab({
  departments,
  loading,
  onChanged,
}: {
  departments: HrmDepartmentDTO[];
  loading: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [addingPreset, setAddingPreset] = useState<string | null>(null);

  const existingNames = useMemo(() => new Set(departments.map((d) => d.name.toLowerCase())), [departments]);
  const availablePresets = HRM_DEPARTMENT_PRESETS.filter((p) => !existingNames.has(p.toLowerCase()));

  const remove = async (dept: HrmDepartmentDTO) => {
    if (!window.confirm(`Delete "${dept.name}"? Employees in it become unassigned.`)) return;
    try {
      await deleteHrmDepartment(dept.id);
      toast.push("Department deleted.", "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not delete this department.", "info");
    }
  };

  const addPreset = async (name: string) => {
    setAddingPreset(name);
    try {
      await createHrmDepartment({ name });
      toast.push(`"${name}" added.`, "success");
      onChanged();
    } catch (err) {
      toast.push((err as Error).message || "Could not add this department.", "info");
    } finally {
      setAddingPreset(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
        <button
          onClick={() => setAddOpen(true)}
          className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={14} /> Add department
        </button>
      </div>

      <div className="zs-table-wrap">
        {loading && departments.length === 0 ? (
          <div className="zs-loading-state">Loading departments...</div>
        ) : departments.length === 0 ? (
          <div className="zs-empty-state">
            <Building2 size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No departments yet</p>
            <p className="max-w-sm text-xs text-slate-400">Group employees by team, e.g. Sales, Warehouse, Support.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="zs-table-head">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Name</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Employees</th>
                  <th className="px-4 py-2.5 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="zs-table-body">
                {departments.map((d) => (
                  <tr key={d.id} className="zs-data-row">
                    <td className="px-4 py-3 font-medium text-slate-800">{d.name}</td>
                    <td className="px-4 py-3 text-slate-500">{d.description || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{d.employeeCount}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => void remove(d)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
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

      <AddDepartmentModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={onChanged} />
    </div>
  );
}
