import { useEffect, useState } from "react";
import { Loader2, Monitor } from "lucide-react";
import type { SessionDTO } from "@zetsales/shared";
import { changePassword, listSessions, revokeAllSessions, revokeSession } from "../../lib/settingsApi";
import { useToast } from "../../components/ui/ToastProvider";
import { parseUserAgent } from "../../lib/parseUserAgent";
import { relativeTime } from "../../components/orders/time";
import { PageTitle } from "../../components/layout/PageTitle";

export function SecuritySettingsPage() {
  const { push } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [sessions, setSessions] = useState<SessionDTO[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const loadSessions = () => {
    listSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleRevoke = async (tokenId: string) => {
    setRevokingId(tokenId);
    try {
      await revokeSession(tokenId);
      setSessions((prev) => prev?.filter((s) => s.tokenId !== tokenId) ?? null);
      push("Device signed out.");
    } catch (err) {
      push((err as Error).message || "Couldn't sign out that device. Try again.", "info");
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      await revokeAllSessions();
      setSessions((prev) => prev?.filter((s) => s.current) ?? null);
      push("Signed out of all other devices.");
    } catch (err) {
      push((err as Error).message || "Couldn't sign out other devices. Try again.", "info");
    } finally {
      setRevokingAll(false);
    }
  };

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
        <PageTitle>Security</PageTitle>
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

          <div className="zs-surface mt-5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Sign-in & devices</h2>
                <p className="mt-1 text-[13px] text-slate-500">Browsers currently signed in to your account.</p>
              </div>
              {sessions && sessions.length > 1 && (
                <button
                  onClick={() => void handleRevokeAll()}
                  disabled={revokingAll}
                  className="shrink-0 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {revokingAll ? "Signing out…" : "Log out of all other devices"}
                </button>
              )}
            </div>

            {sessions === null ? (
              <p className="mt-4 text-[13px] text-slate-400">Loading…</p>
            ) : sessions.length === 0 ? (
              <p className="mt-4 text-[13px] text-slate-400">No active sessions found.</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {sessions.map((s) => {
                  const { browser, os } = parseUserAgent(s.userAgent);
                  return (
                    <li key={s.tokenId} className="flex items-center justify-between gap-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                          <Monitor size={15} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {browser} on {os}
                            {s.current && (
                              <span className="ml-2 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                                This device
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">
                            {s.ip ?? "Unknown IP"} · signed in {relativeTime(s.createdAt)}
                          </p>
                        </div>
                      </div>
                      {!s.current && (
                        <button
                          onClick={() => void handleRevoke(s.tokenId)}
                          disabled={revokingId === s.tokenId}
                          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {revokingId === s.tokenId ? "Signing out…" : "Sign out"}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
