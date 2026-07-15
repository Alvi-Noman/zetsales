import { useEffect, useState } from "react";
import { Ban, Megaphone, Package, Plus } from "lucide-react";
import clsx from "clsx";
import type { AdAccountDTO, AdAccountPlatform } from "@zetsales/shared";
import {
  getCapabilities,
  listAdAccounts,
  removeAdAccount,
  metaAdsOAuthStartUrl,
  tiktokAdsOAuthStartUrl,
  googleAdsOAuthStartUrl,
} from "../../lib/commerceApi";
import { useToast } from "../ui/ToastProvider";

const PLATFORM_META: Record<
  AdAccountPlatform,
  { label: string; color: string; startUrl: () => string }
> = {
  meta: {
    label: "Meta Ads",
    color: "bg-[#0866FF]",
    startUrl: metaAdsOAuthStartUrl,
  },
  tiktok: {
    label: "TikTok Ads",
    color: "bg-[#010101]",
    startUrl: tiktokAdsOAuthStartUrl,
  },
  google: {
    label: "Google Ads",
    color: "bg-[#4285F4]",
    startUrl: googleAdsOAuthStartUrl,
  },
};

function PlatformCard({
  platform,
  enabled,
  connectedCount,
}: {
  platform: AdAccountPlatform;
  enabled: boolean;
  connectedCount: number;
}) {
  const meta = PLATFORM_META[platform];
  return (
    <div className="flex items-center justify-between zs-surface p-5">
      <div className="flex items-center gap-3">
        <div
          className={clsx(
            "flex h-11 w-11 items-center justify-center rounded-lg text-white",
            meta.color,
          )}
        >
          <Megaphone size={20} />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-800">{meta.label}</p>
          <p className="text-xs text-slate-400">
            {!enabled
              ? "Not configured on this server"
              : connectedCount > 0
                ? `${connectedCount} account${connectedCount === 1 ? "" : "s"} connected`
                : "Not connected"}
          </p>
        </div>
      </div>
      {enabled ? (
        <button
          onClick={() => {
            window.location.href = meta.startUrl();
          }}
          className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus size={14} /> Connect
        </button>
      ) : (
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400">
          Not configured
        </span>
      )}
    </div>
  );
}

export function AdAccountsTab() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<AdAccountDTO[]>([]);
  const [caps, setCaps] = useState({
    metaAdsOAuthEnabled: false,
    tiktokAdsOAuthEnabled: false,
    googleAdsOAuthEnabled: false,
  });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [capsRes, accountsRes] = await Promise.all([
        getCapabilities(),
        listAdAccounts(),
      ]);
      setCaps(capsRes);
      setAccounts(accountsRes.accounts);
    } catch {
      toast.push("Could not load ad accounts.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRemove = async (account: AdAccountDTO) => {
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    try {
      await removeAdAccount(account.id);
      toast.push(`Disconnected ${account.displayName}.`);
    } catch {
      toast.push("Could not disconnect this ad account.", "info");
      void load();
    }
  };

  const countFor = (platform: AdAccountPlatform) =>
    accounts.filter((a) => a.platform === platform).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PlatformCard
          platform="meta"
          enabled={caps.metaAdsOAuthEnabled}
          connectedCount={countFor("meta")}
        />
        <PlatformCard
          platform="tiktok"
          enabled={caps.tiktokAdsOAuthEnabled}
          connectedCount={countFor("tiktok")}
        />
        <PlatformCard
          platform="google"
          enabled={caps.googleAdsOAuthEnabled}
          connectedCount={countFor("google")}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Connected ad accounts
        </h2>
        {loading ? (
          <div className="zs-loading-state zs-dashed-surface h-40">
            Loading...
          </div>
        ) : accounts.length === 0 ? (
          <div className="zs-dashed-surface flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Package size={24} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              No ad accounts connected yet
            </p>
            <p className="max-w-sm text-xs text-slate-400">
              Once connected, ad spend can sync in automatically instead of
              logging it manually on the Ad Performance page.
            </p>
          </div>
        ) : (
          <div className="zs-table-wrap zs-table-body">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="zs-data-row flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={clsx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white",
                      PLATFORM_META[a.platform].color,
                    )}
                  >
                    <Megaphone size={14} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {a.displayName}
                    </p>
                    <p className="text-xs text-slate-400">
                      {PLATFORM_META[a.platform].label} · {a.externalAccountId}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void handleRemove(a)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Ban size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
