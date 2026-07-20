import { useState } from "react";
import { Check, Copy, ExternalLink, Landmark } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/ui/ToastProvider";

export function StoreDomainSettingsPage() {
  const { user } = useAuth();
  const { push } = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!user?.businessUrl) return;
    try {
      await navigator.clipboard.writeText(user.businessUrl);
      setCopied(true);
      push("Link copied.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      push("Couldn't copy — select and copy the link manually.", "info");
    }
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">Store &amp; Domain</h1>
        <p className="zs-page-description">Your workspace's live address and currency.</p>
      </div>
      <div className="zs-page-body overflow-y-auto">
        <div className="flex max-w-lg flex-col gap-4">
          <div className="zs-surface p-5">
            <h2 className="text-sm font-semibold text-slate-900">Workspace URL</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              This is where you and your team sign in — share it with anyone who needs access.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <code className="flex-1 truncate text-sm font-medium text-slate-800">{user?.businessUrl ?? "—"}</code>
              <button
                onClick={() => void copy()}
                disabled={!user?.businessUrl}
                className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
              {user?.businessUrl && (
                <a
                  href={user.businessUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <ExternalLink size={13} /> Open
                </a>
              )}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Your workspace address is based on your store name and can't be changed here — contact support if you need it updated.
            </p>
          </div>

          <div className="zs-surface p-5">
            <div className="flex items-center gap-2">
              <Landmark size={15} className="text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-900">Currency</h2>
            </div>
            <p className="mt-1 text-[13px] text-slate-500">
              All orders, products, and reports are priced in Bangladeshi Taka (৳ BDT) — this is fixed for every ZetSales workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
