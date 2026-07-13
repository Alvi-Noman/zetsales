import { PhoneCall, Headset, Megaphone, ShieldAlert, Rocket, Blocks, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listApps } from '../../lib/commerceApi';
import { useAuth } from '../../context/AuthContext';

const ICONS: Record<string, LucideIcon> = {
  'phone-call': PhoneCall,
  megaphone: Megaphone,
  headset: Headset,
  'shield-alert': ShieldAlert,
  rocket: Rocket,
};

// A pure browsing grid, same as Shopify's App Store listing — cards carry no install action of
// their own; clicking one opens the app's own detail page (AppDetailPage.tsx), which is where
// Install/Uninstall actually happens.
export function AppsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: apps, isLoading } = useQuery({ queryKey: ['apps', user?.tenantId], queryFn: listApps, enabled: !!user?.tenantId });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-slate-900">Apps</h1>
        <p className="mt-0.5 text-sm text-slate-500">Install optional apps to extend your workspace.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(apps ?? []).map(({ manifest, install }) => {
              const Icon = ICONS[manifest.icon] ?? Blocks;
              const isInstalled = install?.status === 'installed';
              return (
                <button
                  key={manifest.key}
                  onClick={() => navigate(`/settings/apps/${manifest.key}`)}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Icon size={20} className="text-indigo-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{manifest.name}</div>
                      {isInstalled && <div className="text-[11px] font-medium text-emerald-600">Installed</div>}
                    </div>
                  </div>
                  <p className="text-[13px] text-slate-500">{manifest.description}</p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
