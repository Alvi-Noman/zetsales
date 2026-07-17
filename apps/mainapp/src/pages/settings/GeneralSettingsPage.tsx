import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/ToastProvider";

export function GeneralSettingsPage() {
  const { user, updateBusinessName } = useAuth();
  const { push } = useToast();
  const [name, setName] = useState(user?.businessName ?? "");
  const [saving, setSaving] = useState(false);

  const isDirty = name.trim() !== (user?.businessName ?? "");

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      push("Store name must be at least 2 characters.", "info");
      return;
    }
    setSaving(true);
    try {
      await updateBusinessName(trimmed);
      push("Store name updated.");
    } catch {
      push("Couldn't update store name. Try again.", "info");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">General</h1>
        <p className="zs-page-description">Basic details about your store.</p>
      </div>
      <div className="zs-page-body overflow-y-auto">
        <div className="zs-surface max-w-lg p-5">
          <label className="block text-sm font-semibold text-slate-900" htmlFor="store-name">
            Store name
          </label>
          <p className="mt-1 text-[13px] text-slate-500">
            Shown across your workspace and used as the default business name on invoices.
          </p>
          <input
            id="store-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
            placeholder="Your store name"
          />
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 size={13} className="animate-spin" />}
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
