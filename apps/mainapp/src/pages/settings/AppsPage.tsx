import {
  PhoneCall,
  Headset,
  Megaphone,
  ShieldAlert,
  Rocket,
  Blocks,
  Eye,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listApps } from "../../lib/commerceApi";
import { useAuth } from "../../context/AuthContext";

const ICONS: Record<string, LucideIcon> = {
  "phone-call": PhoneCall,
  megaphone: Megaphone,
  headset: Headset,
  "shield-alert": ShieldAlert,
  rocket: Rocket,
  users: UserRound,
};

// A pure browsing grid; Install/Uninstall happens on the detail page.
export function AppsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: apps, isLoading } = useQuery({
    queryKey: ["apps", user?.tenantId],
    queryFn: listApps,
    enabled: !!user?.tenantId,
  });

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">Plugins</h1>
        <p className="zs-page-description">
          Install optional plugins to extend your workspace.
        </p>
      </div>
      <div className="zs-page-body overflow-y-auto">
        {isLoading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(apps ?? []).map(({ manifest, install }) => {
              const Icon = ICONS[manifest.icon] ?? Blocks;
              const isInstalled = install?.status === "installed";
              return (
                <article
                  key={manifest.key}
                  className="zs-surface flex min-h-[150px] flex-col p-5 text-left"
                >
                  <div className="flex flex-1 flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                        <Icon size={20} className="text-indigo-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-900">
                          {manifest.name}
                        </div>
                        {isInstalled && (
                          <div className="text-[11px] font-medium text-emerald-600">
                            Installed
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-[13px] text-slate-500">
                      {manifest.description}
                    </p>
                  </div>
                  <button
                    onClick={() => navigate(`/settings/apps/${manifest.key}`)}
                    className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <Eye size={13} /> View details
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
