import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Globe, Phone, Calendar, Puzzle, Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { LoadingState, ErrorState } from '../../components/ui/AsyncState';
import { useTenant } from '../../hooks/useTenant';

export function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant, loading, error } = useTenant(id);

  return (
    <div className="pb-10">
      <div className="border-b border-slate-800 px-6 py-5">
        <Link to="/tenants" className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200">
          <ArrowLeft size={13} /> Back to Tenants
        </Link>

        {tenant && (
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-sm font-bold text-white">
              {tenant.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{tenant.name}</h2>
              {tenant.domain && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Globe size={12} /> {tenant.domain.replace(/^https?:\/\//, '')}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="px-6 pt-6">
        {loading ? (
          <LoadingState label="Loading tenant…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : !tenant ? (
          <ErrorState message="Tenant not found." />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="zs-card p-5 xl:col-span-2">
              <h3 className="mb-4 text-sm font-semibold text-white">Account details</h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Business type</dt>
                  <dd className="mt-0.5 font-medium text-slate-200">{tenant.businessType ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Country</dt>
                  <dd className="mt-0.5 font-medium text-slate-200">{tenant.country ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Currency</dt>
                  <dd className="mt-0.5 font-medium text-slate-200">{tenant.currency ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Est. monthly orders</dt>
                  <dd className="mt-0.5 font-medium text-slate-200">{tenant.monthlyOrdersEstimate ?? '—'}</dd>
                </div>
                {tenant.phone && (
                  <div className="col-span-2 flex items-center gap-1.5 text-xs text-slate-500">
                    <Phone size={12} /> {tenant.phone}
                  </div>
                )}
                <div className="col-span-2 flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar size={12} />
                  Joined {tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : '—'}
                </div>
              </dl>
            </div>

            <div className="zs-card p-5">
              <div className="mb-3 flex items-center gap-1.5">
                <Puzzle size={14} className="text-slate-500" />
                <h3 className="text-sm font-semibold text-white">Installed plugins</h3>
              </div>
              {tenant.installedPlugins.length === 0 ? (
                <p className="text-xs text-slate-500">No plugins installed.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {tenant.installedPlugins.map((p) => (
                    <Badge key={p} tone="indigo">
                      {p.replace(/-/g, ' ')}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="zs-card p-5 xl:col-span-3">
              <div className="mb-3 flex items-center gap-1.5">
                <Users size={14} className="text-slate-500" />
                <h3 className="text-sm font-semibold text-white">Team members ({tenant.members.length})</h3>
              </div>
              {tenant.members.length === 0 ? (
                <p className="text-xs text-slate-500">No team members yet.</p>
              ) : (
                <div className="divide-y divide-slate-800/70">
                  {tenant.members.map((m) => (
                    <div key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-medium text-slate-200">{m.email}</span>
                      <div className="flex items-center gap-3">
                        {m.role && <Badge tone="slate">{m.role}</Badge>}
                        <span className="text-xs text-slate-500">
                          {m.createdAt ? new Date(m.createdAt).toLocaleDateString() : '—'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
