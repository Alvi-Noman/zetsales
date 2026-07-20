import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Building2, DollarSign, ShoppingCart, Puzzle, TrendingUp, ArrowRight } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { MiniBarChart } from '../../components/ui/MiniBarChart';
import { LoadingState, ErrorState } from '../../components/ui/AsyncState';
import { useTenants } from '../../hooks/useTenants';
import { REVENUE_TREND, SUPPORT_TICKETS, formatCurrency, formatUsd } from '../../lib/mockData';

const BUSINESS_TYPE_COLORS = ['bg-indigo-500', 'bg-sky-500', 'bg-violet-500', 'bg-slate-500', 'bg-emerald-500'];

function DemoBadge() {
  return <Badge tone="amber">demo data</Badge>;
}

export function DashboardPage() {
  const { tenants, loading, error } = useTenants();

  // Fabricated — there's no billing/plan model in the backend yet, so these three come from
  // mockData.ts rather than real tenants. Everything else on this page (tenant count, plugin
  // adoption, business type mix, newest tenants) is the real thing.
  const totalMrr = REVENUE_TREND[REVENUE_TREND.length - 1].mrr;
  const totalGmv = REVENUE_TREND[REVENUE_TREND.length - 1].gmv;
  const openTickets = SUPPORT_TICKETS.filter((t) => t.status !== 'resolved').length;

  const pluginAdoption = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tenants) {
      for (const p of t.installedPlugins) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return [...counts.entries()].map(([module, installs]) => ({ module, installs })).sort((a, b) => b.installs - a.installs);
  }, [tenants]);

  const businessTypeMix = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tenants) {
      const key = t.businessType ?? 'Unspecified';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
  }, [tenants]);

  const newestTenants = tenants.slice(0, 8);

  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="pb-10">
      <PageHeader
        title="Overview"
        description="Consolidated performance across every tenant on the platform"
      />

      <div className="grid grid-cols-1 gap-4 px-6 pt-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly Recurring Revenue" value={formatUsd(totalMrr)} icon={DollarSign} change={8.4} sublabel="demo data — no billing model yet" />
        <StatCard label="GMV (30d)" value={formatCurrency(totalGmv)} icon={TrendingUp} change={12.1} sublabel="demo data — no billing model yet" />
        <StatCard label="Total Tenants" value={String(tenants.length)} icon={Building2} sublabel="real — from businesses collection" />
        <StatCard label="Plugin installs" value={String(pluginAdoption.reduce((s, p) => s + p.installs, 0))} icon={Puzzle} sublabel="real — across all tenants" />
      </div>

      <div className="grid grid-cols-1 gap-4 px-6 pt-4 xl:grid-cols-3">
        <div className="zs-card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div>
                <h3 className="text-sm font-semibold text-white">GMV Trend</h3>
                <p className="text-xs text-slate-500">Last 6 months, all tenants combined</p>
              </div>
              <DemoBadge />
            </div>
            <Link to="/billing" className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300">
              Revenue detail <ArrowRight size={12} />
            </Link>
          </div>
          <MiniBarChart data={REVENUE_TREND as unknown as Record<string, unknown>[]} valueKey="gmv" labelKey="month" formatValue={formatCurrency} />
        </div>

        <div className="zs-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Business Type Mix</h3>
          {businessTypeMix.length === 0 ? (
            <p className="text-xs text-slate-500">No tenants yet.</p>
          ) : (
            <div className="space-y-3">
              {businessTypeMix.map((b, i) => (
                <div key={b.type}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-slate-300">{b.type}</span>
                    <span className="text-slate-500">{b.count} tenants</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full ${BUSINESS_TYPE_COLORS[i % BUSINESS_TYPE_COLORS.length]}`}
                      style={{ width: `${(b.count / tenants.length) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-6 pt-4 xl:grid-cols-3">
        <div className="zs-card overflow-hidden xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
            <h3 className="text-sm font-semibold text-white">Newest Tenants</h3>
            <Link to="/tenants" className="flex items-center gap-1 text-xs font-medium text-indigo-400 hover:text-indigo-300">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {newestTenants.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">No tenants yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2 font-medium">Tenant</th>
                  <th className="px-5 py-2 font-medium">Country</th>
                  <th className="px-5 py-2 font-medium">Team size</th>
                  <th className="px-5 py-2 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {newestTenants.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-slate-900/60">
                    <td className="px-5 py-2.5">
                      <Link to={`/tenants/${t.id}`} className="font-medium text-slate-200 hover:text-indigo-300">
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 text-slate-400">{t.country ?? '—'}</td>
                    <td className="px-5 py-2.5 text-slate-400">{t.teamSize}</td>
                    <td className="px-5 py-2.5 text-slate-500">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="zs-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Plugin Adoption</h3>
            <Puzzle size={14} className="text-slate-500" />
          </div>
          {pluginAdoption.length === 0 ? (
            <p className="text-xs text-slate-500">No plugins installed by any tenant yet.</p>
          ) : (
            <div className="space-y-3">
              {pluginAdoption.map((p) => (
                <div key={p.module}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium capitalize text-slate-300">{p.module.replace(/-/g, ' ')}</span>
                    <span className="text-slate-500">{p.installs} installs</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                      style={{ width: `${(p.installs / Math.max(tenants.length, 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2.5">
            <span className="text-xs font-medium text-slate-400">Open support tickets</span>
            <Link to="/support" className="text-sm font-bold text-white hover:text-indigo-300">
              {openTickets}
            </Link>
          </div>
        </div>
      </div>

      <div className="px-6 pt-4">
        <div className="zs-card p-5">
          <h3 className="mb-3 text-sm font-semibold text-white">All Tenants</h3>
          <div className="flex flex-wrap gap-2">
            {tenants.slice(0, 16).map((t) => (
              <Link
                key={t.id}
                to={`/tenants/${t.id}`}
                className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-slate-700 hover:text-white"
              >
                {t.name}
                {t.country && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-500">{t.country}</span>
                  </>
                )}
              </Link>
            ))}
            {tenants.length === 0 && <p className="text-sm text-slate-500">No tenants yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
