import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, PhoneCall, Headset, Megaphone, ShieldAlert, Rocket, Blocks, type LucideIcon } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppManifestDTO } from '@zetsales/shared';
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

// A few honest, real facts per app — not fabricated ratings/reviews. "Works with" reflects what
// the app actually integrates with, same as Shopify's own "Works with" field, just not padded
// with invented social proof (star ratings, review counts) for apps nobody has actually reviewed.
const WORKS_WITH: Record<string, string[]> = {
  fraudChecker: ['Orders'],
  callCenter: ['Orders', 'Team'],
  adPerformance: ['Products', 'Orders'],
  customerService: ['Facebook', 'Instagram'],
  zetSalesAds: ['Facebook Ads', 'TikTok Ads', 'Google Ads'],
};

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AppDetailPage() {
  const { appKey } = useParams<{ appKey: string }>();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: apps, isLoading } = useQuery({ queryKey: ['apps', user?.tenantId], queryFn: listApps, enabled: !!user?.tenantId });
  const [installing, setInstalling] = useState(false);

  const entry = apps?.find((a) => a.manifest.key === appKey);
  const canManage = user?.role === 'owner' || user?.role === 'admin';

  const handleInstall = async (manifest: AppManifestDTO) => {
    setInstalling(true);
    if (manifest.authType === 'oauth') {
      if (!manifest.clientId || !manifest.homepageUrl) {
        toast.push('This app is missing its OAuth configuration.', 'info');
        setInstalling(false);
        return;
      }
      // A brief pause before handing off to the real OAuth redirect — the actual round trip
      // (redirect out, authorize, redirect back) provides the rest of the "installing" feel;
      // AppHostPage shows its own loading state while the session token is minted on return.
      await delay(600);
      const redirectUri = `${manifest.homepageUrl}/oauth/callback`;
      window.location.href = `/api/v1/oauth/authorize?client_id=${encodeURIComponent(manifest.clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
      return;
    }
    try {
      // installApp() itself is near-instant (a single DB flag flip) — race it against a minimum
      // display duration so installing never feels suspiciously instantaneous, same reasoning a
      // real OAuth app-review/consent step would naturally add.
      await Promise.all([installApp(manifest.key), delay(1400)]);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['apps'] }), refresh()]);
      toast.push(`${manifest.name} installed.`);
      if (manifest.isEmbeddedApp) {
        navigate(manifest.sidebarPath ?? '/home');
        return;
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not install this app.', 'info');
    } finally {
      setInstalling(false);
    }
  };

  const handleUninstall = async (manifest: AppManifestDTO) => {
    try {
      await uninstallApp(manifest.key);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['apps'] }), refresh()]);
      toast.push(`${manifest.name} uninstalled.`);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not uninstall this app.', 'info');
    }
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>;
  }
  if (!entry) {
    return <div className="flex h-full items-center justify-center text-sm text-slate-400">App not found.</div>;
  }

  const { manifest, install } = entry;
  const Icon = ICONS[manifest.icon] ?? Blocks;
  const isInstalled = install?.status === 'installed';
  const worksWith = WORKS_WITH[manifest.key] ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-8 py-4">
        <button onClick={() => navigate('/settings/apps')} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700">
          <ArrowLeft size={13} /> All apps
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-10 sm:grid-cols-[220px_1fr]">
          {/* Left rail — matches Shopify's app-detail sidebar shape, minus fabricated ratings */}
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                <Icon size={22} className="text-indigo-500" />
              </div>
              <div className="text-base font-bold text-slate-900">{manifest.name}</div>
            </div>

            <div className="mt-6 space-y-5 border-t border-slate-200 pt-5 text-sm">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pricing</div>
                <div className="mt-1 text-slate-700">Free to install</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Developer</div>
                <div className="mt-1 text-slate-700">ZetSales</div>
              </div>
              {manifest.authType === 'oauth' && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Install type</div>
                  <div className="mt-1 text-slate-700">Standalone app (OAuth)</div>
                </div>
              )}
            </div>

            <div className="mt-6">
              {isInstalled ? (
                <div className="space-y-2">
                  {manifest.isEmbeddedApp && (
                    <button
                      onClick={() => navigate(manifest.authType === 'oauth' ? `/apps/${manifest.key}` : manifest.sidebarPath ?? '/home')}
                      className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                      Open
                    </button>
                  )}
                  <button
                    disabled={!canManage}
                    onClick={() => handleUninstall(manifest)}
                    className="w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Uninstall
                  </button>
                </div>
              ) : (
                <button
                  disabled={!canManage || installing}
                  onClick={() => handleInstall(manifest)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {installing ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Installing…
                    </>
                  ) : (
                    'Install'
                  )}
                </button>
              )}
              {!canManage && <p className="mt-2 text-[11px] text-slate-400">Only an owner or admin can install apps.</p>}
            </div>
          </div>

          {/* Right column — description + honest metadata, no fabricated reviews */}
          <div>
            <h1 className="text-xl font-bold text-slate-900">{manifest.name}</h1>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{manifest.description}</p>

            {worksWith.length > 0 && (
              <div className="mt-8 border-t border-slate-200 pt-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Works with</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {worksWith.map((w) => (
                    <span key={w} className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                      {w}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
