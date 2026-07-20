import { useState } from "react";
import { Loader2 } from "lucide-react";
import { changePassword } from "../../lib/settingsApi";
import { useToast } from "../../components/ui/ToastProvider";

export function SecuritySettingsPage() {
  const { push } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSave = currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await changePassword(currentPassword, newPassword);
      push("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      push((err as Error).message || "Couldn't update password. Try again.", "info");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "mt-3 w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400";

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">Security</h1>
        <p className="zs-page-description">Manage your account password.</p>
      </div>
      <div className="zs-page-body overflow-y-auto">
        <div className="max-w-lg">
          <div className="zs-surface p-5">
            <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
            <p className="mt-1 text-[13px] text-slate-500">Use at least 8 characters. You'll stay signed in on this device.</p>

            <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="current-password">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />

            <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="new-password">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />

            <label className="mt-4 block text-xs font-semibold text-slate-600" htmlFor="confirm-password">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
            {mismatch && <p className="mt-1.5 text-[11px] font-medium text-rose-600">Passwords don't match.</p>}

            <button
              onClick={() => void handleSave()}
              disabled={!canSave}
              className="mt-5 inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <Loader2 size={13} className="animate-spin" />}
              Update password
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
