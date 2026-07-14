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

interface AppMeta {
  headline: string;
  features: string[];
  category: string;
  worksWith: string[];
  gradient: string;
}

// Real, honest facts per app — headline/features restate what the app actually does, "Works
// with" and "Category" are plain classification, same as Shopify's own fields. Deliberately no
// star rating or "Popular with stores like yours" section: those are Shopify's own aggregated
// data across thousands of real merchant reviews — we have none, and fabricating a number would
// be fake social proof on our own App Store.
const APP_META: Record<string, AppMeta> = {
  fraudChecker: {
    headline: 'Catch risky orders before they ship',
    features: [
      'Flags orders with risk signals before they get confirmed',
      'Adds a fraud badge directly on the orders list',
      'One-click bulk-flag action for a batch of suspicious orders',
    ],
    category: 'Orders',
    worksWith: ['Orders'],
    gradient: 'from-rose-400 to-orange-300',
  },
  callCenter: {
    headline: 'Run your confirmation team from one screen',
    features: [
      'Live queue of orders waiting to be called',
      'Agent presence and call-attempt tracking',
      'Hourly call volume and confirmation-rate KPIs',
    ],
    category: 'Orders',
    worksWith: ['Orders', 'Team'],
    gradient: 'from-sky-400 to-blue-300',
  },
  adPerformance: {
    headline: 'Know what your ad spend is actually returning',
    features: [
      'Log ad spend manually by product and channel',
      'ROAS and cost-per-order reporting',
      'Break down performance by platform',
    ],
    category: 'Marketing',
    worksWith: ['Products', 'Orders'],
    gradient: 'from-amber-400 to-yellow-300',
  },
  customerService: {
    headline: 'Every customer conversation, one inbox',
    features: [
      'Unified inbox for Facebook and Instagram messages',
      'Reply to customers without leaving ZetSales',
      'Conversation history stays tied to each customer',
    ],
    category: 'Customer support',
    worksWith: ['Facebook', 'Instagram'],
    gradient: 'from-violet-400 to-fuchsia-300',
  },
  zetSalesAds: {
    headline: 'Connect your ad accounts, sync spend automatically',
    features: [
      'Connect Facebook, TikTok, and Google Ads accounts',
      'Ad spend syncs in instead of being logged by hand',
      'Feeds Ad Performance and campaign tools with real numbers',
    ],
    category: 'Marketing',
    worksWith: ['Facebook Ads', 'TikTok Ads', 'Google Ads'],
    gradient: 'from-indigo-500 to-violet-500',
  },
};

// Pastel captions behind the 3 highlight thumbnails, same shape as Shopify's own app-listing
// thumbnails — no image-generation tool is available here, so these are illustrated with plain
// CSS instead of a fabricated screenshot.
const THUMB_GRADIENTS = ['from-cyan-200 to-teal-100', 'from-lime-200 to-yellow-100', 'from-sky-200 to-indigo-100'];

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 text-sm">
      <div className="w-40 shrink-0 font-semibold text-slate-500">{label}</div>
      <div className="flex flex-1 flex-wrap gap-x-2 gap-y-1 text-slate-700">
        {values.map((v) => (
          <span key={v}>{v}</span>
        ))}
      </div>
    </div>
  );
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
  const meta = APP_META[manifest.key];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-8 py-4">
        <button onClick={() => navigate('/settings/apps')} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700">
          <ArrowLeft size={13} /> All apps
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-12 sm:grid-cols-[240px_1fr]">
          {/* Left rail — matches Shopify's app-detail sidebar shape, minus fabricated rating/popularity */}
          <div>
            <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                <Icon size={20} className="text-indigo-500" />
              </div>
              <div className="text-base font-bold text-slate-900">{manifest.name}</div>
            </div>

            <div className="mt-5 space-y-5 text-sm">
              <div>
                <div className="text-xs font-semibold text-slate-500">Pricing</div>
                <div className="mt-1 text-slate-700">Free</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Developer</div>
                <div className="mt-1 text-slate-700">ZetSales</div>
              </div>
              {manifest.authType === 'oauth' && (
                <div>
                  <div className="text-xs font-semibold text-slate-500">Install type</div>
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

          {/* Right column — illustrated UI preview + real feature list, honest metadata rows */}
          <div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px]">
              {/* Main preview — a stylized mockup of the app's own screen (a "browser card"
                  listing what it actually connects to), not a real screenshot. */}
              <div className={`overflow-hidden rounded-2xl bg-gradient-to-br ${meta.gradient} p-6`}>
                <div className="overflow-hidden rounded-xl bg-white shadow-lg">
                  <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                    <span className="ml-2 flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">
                      <Icon size={11} /> {manifest.name}
                    </span>
                  </div>
                  <div className="divide-y divide-slate-100 px-4 py-1.5">
                    {meta.worksWith.map((w) => (
                      <div key={w} className="flex items-center justify-between py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-[10px] font-bold text-indigo-500">
                            {w[0]}
                          </span>
                          <span className="text-xs font-medium text-slate-700">{w}</span>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-400">Connect</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* 3 highlight thumbnails, same shape as Shopify's captioned mini-previews */}
              <div className="flex flex-row gap-3 sm:flex-col">
                {meta.features.slice(0, 3).map((f, i) => (
                  <div key={f} className={`flex flex-1 items-center rounded-xl bg-gradient-to-br p-3 ${THUMB_GRADIENTS[i % THUMB_GRADIENTS.length]}`}>
                    <p className="text-[11px] font-medium leading-snug text-slate-800">{f}</p>
                  </div>
                ))}
              </div>
            </div>

            <h1 className="mt-8 text-lg font-bold text-slate-900">{meta.headline}</h1>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{manifest.description}</p>

            <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
              {meta.features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>

            <div className="mt-8 divide-y divide-slate-200 border-t border-slate-200">
              <Row label="Works with" values={meta.worksWith} />
              <Row label="Category" values={[meta.category]} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
