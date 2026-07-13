import { PhoneCall, Headset, Megaphone, ShieldAlert, Rocket, Blocks, type LucideIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppManifestDTO, ModuleKey } from '@zetsales/shared';
import { listApps, installApp, uninstallApp } from '../../lib/commerceApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';

const ICONS: Record<string, LucideIcon> = {
  'phone-call': PhoneCall,
  megaphone: Megaphone,
  headset: Headset,
  'shield-alert': ShieldAlert,
  rocket: Rocket,
};

// Shopify App Store-style card grid — icon, name, description, and an Install button that
// becomes Installed + Uninstall once installed. embedded-type apps install instantly; oauth-type
// apps (none yet — see docs/plugin-platform.md) link straight to the OAuth authorize endpoint,
// same as clicking Install on a real Shopify app.
export function AppsPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: apps, isLoading } = useQuery({ queryKey: ['apps', user?.tenantId], queryFn: listApps, enabled: !!user?.tenantId });

  const canManage = user?.role === 'owner' || user?.role === 'admin';

  const handleInstall = async (manifest: AppManifestDTO) => {
    if (manifest.authType === 'oauth') {
      // Real OAuth 2.0 authorization-code redirect — client_id must be the app's actual
      // registered clientId (from oauth_apps), not its module key.
      if (!manifest.clientId || !manifest.homepageUrl) {
        toast.push('This app is missing its OAuth configuration.', 'info');
        return;
      }
      const redirectUri = `${manifest.homepageUrl}/oauth/callback`;
      window.location.href = `/api/v1/oauth/authorize?client_id=${encodeURIComponent(manifest.clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
      return;
    }
    try {
      await installApp(manifest.key);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['apps'] }), refresh()]);
      toast.push('App installed.');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not install this app.', 'info');
    }
  };

  const handleUninstall = async (appKey: ModuleKey) => {
    try {
      await uninstallApp(appKey);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['apps'] }), refresh()]);
      toast.push('App uninstalled.');
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not uninstall this app.', 'info');
    }
  };

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
                <div key={manifest.key} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                      <Icon size={20} className="text-indigo-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">{manifest.name}</div>
                      {isInstalled && <div className="text-[11px] font-medium text-emerald-600">Installed</div>}
                    </div>
                  </div>
                  <p className="flex-1 text-[13px] text-slate-500">{manifest.description}</p>
                  {isInstalled ? (
                    <div className="flex items-center gap-2">
                      {manifest.isEmbeddedApp && (
                        <button
                          onClick={() => navigate(manifest.authType === 'oauth' ? `/apps/${manifest.key}` : manifest.sidebarPath ?? '/home')}
                          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          Open
                        </button>
                      )}
                      <button
                        disabled={!canManage}
                        onClick={() => handleUninstall(manifest.key)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Uninstall
                      </button>
                    </div>
                  ) : (
                    <button
                      disabled={!canManage}
                      onClick={() => handleInstall(manifest)}
                      className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Install
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!canManage && !isLoading && <p className="mt-4 text-[13px] text-slate-400">Only an owner or admin can install or uninstall apps.</p>}
      </div>
    </div>
  );
}
