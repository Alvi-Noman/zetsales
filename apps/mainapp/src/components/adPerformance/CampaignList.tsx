import { useEffect, useState } from "react";
import { AlertCircle, Pause, Play } from "lucide-react";
import clsx from "clsx";
import type {
  AdAccountPlatform,
  AdCampaignDTO,
  AdCampaignPlatformStatusDTO,
} from "@zetsales/shared";
import {
  activateCampaign,
  listCampaigns,
  pauseCampaign,
} from "../../lib/commerceApi";
import { useToast } from "../ui/ToastProvider";

const PLATFORM_LABEL: Record<AdAccountPlatform, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
};

const STATUS_STYLE: Record<AdCampaignPlatformStatusDTO["status"], string> = {
  pending: "bg-slate-100 text-slate-500",
  creating: "bg-amber-50 text-amber-700",
  paused: "bg-slate-100 text-slate-600",
  active: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-700",
};

function PlatformChip({
  platform,
  status,
  campaignId,
  onChanged,
}: {
  platform: AdAccountPlatform;
  status: AdCampaignPlatformStatusDTO;
  campaignId: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      const res =
        status.status === "active"
          ? await pauseCampaign(campaignId, platform)
          : await activateCampaign(campaignId, platform);
      if (!res.success) {
        toast.push(res.message || "Could not update this campaign.", "info");
        return;
      }
      onChanged();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not update this campaign.",
        "info",
      );
    } finally {
      setBusy(false);
    }
  };

  const canToggle = status.status === "paused" || status.status === "active";

  return (
    <div
      className={clsx(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        STATUS_STYLE[status.status],
      )}
      title={status.error ?? undefined}
    >
      <span>
        {PLATFORM_LABEL[platform]} · {status.status}
      </span>
      {status.error && <AlertCircle size={11} />}
      {canToggle && (
        <button
          onClick={() => void toggle()}
          disabled={busy}
          className="rounded-full p-0.5 hover:bg-black/10 disabled:opacity-50"
        >
          {status.status === "active" ? (
            <Pause size={11} />
          ) : (
            <Play size={11} />
          )}
        </button>
      )}
    </div>
  );
}

export function CampaignList({ refreshKey }: { refreshKey: number }) {
  const toast = useToast();
  const [campaigns, setCampaigns] = useState<AdCampaignDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await listCampaigns();
      setCampaigns(res.campaigns);
    } catch {
      toast.push("Could not load campaigns.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Any campaign still 'pending'/'creating' on some platform means the fire-and-forget backend
  // launch hasn't settled yet — poll briefly so the status updates without a manual refresh.
  useEffect(() => {
    const inFlight = campaigns.some((c) =>
      [c.platforms.meta, c.platforms.google, c.platforms.tiktok].some(
        (p) => p && (p.status === "pending" || p.status === "creating"),
      ),
    );
    if (!inFlight) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);

  if (loading)
    return (
      <div className="zs-dashed-surface py-10 text-center text-sm text-slate-400">
        Loading...
      </div>
    );
  if (campaigns.length === 0)
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        No campaigns created yet.
      </p>
    );

  return (
    <div className="space-y-3">
      {campaigns.map((c) => (
        <div key={c.id} className="zs-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                {c.name}
              </p>
              <p className="truncate text-xs text-slate-400">
                {c.budgetType === "daily"
                  ? "৳" + c.budgetAmount + "/day"
                  : "৳" + c.budgetAmount + " total"}{" "}
                ·{" "}
                {c.goal === "maximize_value"
                  ? "Maximize value"
                  : "Maximize conversions"}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {c.platforms.meta && (
                <PlatformChip
                  platform="meta"
                  status={c.platforms.meta}
                  campaignId={c.id}
                  onChanged={load}
                />
              )}
              {c.platforms.google && (
                <PlatformChip
                  platform="google"
                  status={c.platforms.google}
                  campaignId={c.id}
                  onChanged={load}
                />
              )}
              {c.platforms.tiktok && (
                <PlatformChip
                  platform="tiktok"
                  status={c.platforms.tiktok}
                  campaignId={c.id}
                  onChanged={load}
                />
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
