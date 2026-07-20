import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { SERVICE_HEALTH, type ServiceHealth } from '../../lib/mockData';

const STATUS_TONE: Record<ServiceHealth['status'], 'emerald' | 'amber' | 'red'> = {
  operational: 'emerald',
  degraded: 'amber',
  outage: 'red',
};

export function SystemHealthPage() {
  const allOperational = SERVICE_HEALTH.every((s) => s.status === 'operational');

  return (
    <div className="pb-10">
      <PageHeader title="System Health" description="Live status of platform services" />

      <div className="px-6 pt-6">
        <div className={`mb-4 flex items-center gap-2 rounded-xl border p-4 ${allOperational ? 'border-emerald-900/40 bg-emerald-500/5' : 'border-amber-900/40 bg-amber-500/5'}`}>
          <span className={`h-2 w-2 rounded-full ${allOperational ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
          <span className="text-sm font-medium text-slate-200">
            {allOperational ? 'All systems operational' : 'Some services are degraded'}
          </span>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Service</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Uptime (30d)</th>
                <th className="px-5 py-3 font-medium">p95 latency</th>
                <th className="px-5 py-3 font-medium">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {SERVICE_HEALTH.map((s) => (
                <tr key={s.name} className="transition-colors hover:bg-slate-900/70">
                  <td className="px-5 py-3 font-medium text-slate-200">{s.name}</td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{s.uptime30d.toFixed(2)}%</td>
                  <td className="px-5 py-3 text-slate-400">{s.p95LatencyMs}ms</td>
                  <td className="px-5 py-3 text-slate-500">{s.region}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
