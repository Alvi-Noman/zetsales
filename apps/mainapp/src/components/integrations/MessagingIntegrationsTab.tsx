import { useEffect, useState } from "react";
import { Ban, Camera, MessageCircle, Zap } from "lucide-react";
import clsx from "clsx";
import type { SocialAccountDTO } from "@zetsales/shared";
import {
  facebookOAuthStartUrl,
  getMessagingCapabilities,
  listSocialAccounts,
  removeSocialAccount,
} from "../../lib/messagingApi";
import { useToast } from "../ui/ToastProvider";

const PROVIDER_META = {
  facebook: {
    label: "Facebook Page",
    color: "bg-[#1877F2]",
    icon: MessageCircle,
  },
  instagram: {
    label: "Instagram",
    color: "bg-gradient-to-br from-[#f09433] via-[#dc2743] to-[#bc1888]",
    icon: Camera,
  },
} as const;

function AccountCard({
  account,
  onRemove,
}: {
  account: SocialAccountDTO;
  onRemove: (account: SocialAccountDTO) => void;
}) {
  const meta = PROVIDER_META[account.provider];
  return (
    <div className="flex items-center justify-between zs-surface p-4">
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white",
            meta.color,
          )}
        >
          <meta.icon size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{account.name}</p>
          <p className="text-xs text-slate-400">{meta.label}</p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span
          className={clsx(
            "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
            account.status === "connected"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
              : "bg-rose-50 text-rose-700 ring-rose-600/20",
          )}
        >
          {account.status === "connected" ? "Connected" : "Error"}
        </span>
        <button
          onClick={() => onRemove(account)}
          className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
        >
          <Ban size={14} />
        </button>
      </div>
    </div>
  );
}

export function MessagingIntegrationsTab() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<SocialAccountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [metaAppConfigured, setMetaAppConfigured] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [caps, list] = await Promise.all([
        getMessagingCapabilities(),
        listSocialAccounts(),
      ]);
      setMetaAppConfigured(caps.metaAppConfigured);
      setAccounts(list);
    } catch {
      toast.push("Could not load connected pages.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnect = () => {
    window.location.href = facebookOAuthStartUrl();
  };

  const handleRemove = async (account: SocialAccountDTO) => {
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    try {
      await removeSocialAccount(account.id);
      toast.push(`Disconnected ${account.name}.`);
    } catch {
      toast.push("Could not disconnect this account.", "info");
      void load();
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between zs-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#1877F2] text-white">
            <MessageCircle size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              Facebook &amp; Instagram
            </p>
            <p className="text-xs text-slate-400">
              {accounts.length > 0
                ? `${accounts.length} account${accounts.length === 1 ? "" : "s"} connected`
                : "Not connected"}
            </p>
          </div>
        </div>
        <button
          onClick={handleConnect}
          disabled={!metaAppConfigured}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Zap size={14} /> Connect Business Suite
        </button>
      </div>

      {!metaAppConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700">
          Facebook/Instagram messaging isn't configured on this server yet. Set
          META_APP_ID and META_APP_SECRET.
        </div>
      )}

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Connected pages &amp; accounts
        </h2>
        {loading ? (
          <div className="zs-loading-state zs-dashed-surface h-40">
            Loading...
          </div>
        ) : accounts.length === 0 ? (
          <div className="zs-dashed-surface flex flex-col items-center justify-center gap-2 py-14 text-center">
            <MessageCircle size={24} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              No pages connected yet
            </p>
            <p className="text-xs text-slate-400">
              Connect your Business Suite above to bring every Page's Messenger
              and Instagram DMs into one inbox.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <AccountCard
                key={account.id}
                account={account}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
