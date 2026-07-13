import { useEffect, useState } from 'react';
import { PhoneCall, Headset, Megaphone, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { PLUGIN_MODULES, type ModuleKey } from '@zetsales/shared';
import { getInstalledPlugins, updateInstalledPlugins } from '../../lib/commerceApi';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';

const PLUGIN_INFO: Record<ModuleKey, { label: string; description: string; icon: typeof PhoneCall }> = {
  callCenter: { label: 'Call Center', description: 'Live confirmation-team dashboard: queue, agent presence, and call KPIs.', icon: PhoneCall },
  adPerformance: { label: 'Ad Performance', description: 'Manual ad-cost tracking and ROAS reporting by product and channel.', icon: Megaphone },
  customerService: { label: 'Messages', description: 'Unified Facebook and Instagram inbox.', icon: Headset },
  fraudChecker: { label: 'Fraud Checker', description: 'Flags suspicious orders before they are confirmed.', icon: ShieldAlert },
} as Record<ModuleKey, { label: string; description: string; icon: typeof PhoneCall }>;

export function PluginsPage() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [installed, setInstalled] = useState<ModuleKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPlugin, setSavingPlugin] = useState<ModuleKey | null>(null);

  useEffect(() => {
    getInstalledPlugins()
      .then(setInstalled)
      .catch(() => toast.push('Could not load installed plugins.', 'info'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = async (module: ModuleKey) => {
    const next = installed.includes(module) ? installed.filter((m) => m !== module) : [...installed, module];
    setSavingPlugin(module);
    try {
      const saved = await updateInstalledPlugins(next);
      setInstalled(saved);
      await refresh();
      toast.push(next.includes(module) ? `${PLUGIN_INFO[module].label} installed.` : `${PLUGIN_INFO[module].label} uninstalled.`);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not update plugins.', 'info');
    } finally {
      setSavingPlugin(null);
    }
  };

  const canManage = user?.role === 'owner' || user?.role === 'admin';

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 bg-white px-8 py-5">
        <h1 className="text-xl font-bold text-slate-900">Plugins</h1>
        <p className="mt-0.5 text-sm text-slate-500">Turn optional features on or off for your workspace.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="grid max-w-2xl gap-3">
            {PLUGIN_MODULES.map((module) => {
              const info = PLUGIN_INFO[module];
              const Icon = info.icon;
              const isOn = installed.includes(module);
              return (
                <div key={module} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-indigo-50">
                    <Icon size={20} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{info.label}</div>
                    <div className="mt-0.5 text-[13px] text-slate-500">{info.description}</div>
                  </div>
                  <button
                    disabled={!canManage || savingPlugin === module}
                    onClick={() => toggle(module)}
                    className={clsx(
                      'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                      isOn ? 'bg-indigo-600' : 'bg-slate-200'
                    )}
                    aria-label={isOn ? `Uninstall ${info.label}` : `Install ${info.label}`}
                  >
                    <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', isOn ? 'translate-x-[22px]' : 'translate-x-0.5')} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {!canManage && !loading && <p className="mt-4 text-[13px] text-slate-400">Only an owner or admin can install or uninstall plugins.</p>}
      </div>
    </div>
  );
}
