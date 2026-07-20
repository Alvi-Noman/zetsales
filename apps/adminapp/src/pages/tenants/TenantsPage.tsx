import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { LoadingState, ErrorState } from '../../components/ui/AsyncState';
import { useTenants } from '../../hooks/useTenants';

export function TenantsPage() {
  const { tenants, loading, error } = useTenants();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query) return tenants;
    const q = query.toLowerCase();
    return tenants.filter((t) => t.name.toLowerCase().includes(q) || (t.domain ?? '').toLowerCase().includes(q));
  }, [tenants, query]);

  return (
    <div className="pb-10">
      <PageHeader title="Tenants" description={`${tenants.length} businesses registered on ZetSales`} />

      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-6 py-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tenant or domain…"
            className="h-8 w-64 rounded-lg border border-slate-800 bg-slate-900 pl-8 pr-3 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <span className="ml-auto text-xs text-slate-500">{filtered.length} results</span>
      </div>

      <div className="px-6 pt-4">
        {loading ? (
          <LoadingState label="Loading tenants…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <div className="zs-table-wrap overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/40">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3 font-medium">Tenant</th>
                  <th className="px-5 py-3 font-medium">Country</th>
                  <th className="px-5 py-3 font-medium">Business type</th>
                  <th className="px-5 py-3 font-medium">Team size</th>
                  <th className="px-5 py-3 font-medium">Plugins</th>
                  <th className="px-5 py-3 font-medium">Est. monthly orders</th>
                  <th className="px-5 py-3 font-medium">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {filtered.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-slate-900/70">
                    <td className="px-5 py-3">
                      <Link to={`/tenants/${t.id}`} className="font-medium text-slate-200 hover:text-indigo-300">
                        {t.name}
                      </Link>
                      {t.domain && <div className="text-xs text-slate-500">{t.domain.replace(/^https?:\/\//, '')}</div>}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{t.country ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-400">{t.businessType ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-400">{t.teamSize}</td>
                    <td className="px-5 py-3">
                      {t.installedPlugins.length === 0 ? (
                        <span className="text-slate-600">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {t.installedPlugins.map((p) => (
                            <Badge key={p} tone="indigo">
                              {p.replace(/-/g, ' ')}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-400">{t.monthlyOrdersEstimate ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="px-5 py-10 text-center text-sm text-slate-500">No tenants match your search.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
