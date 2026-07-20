import { DollarSign, TrendingUp, UserPlus, UserMinus } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { MiniBarChart } from '../../components/ui/MiniBarChart';
import { REVENUE_TREND, TENANTS, formatCurrency, formatUsd } from '../../lib/mockData';

export function BillingPage() {
  const latest = REVENUE_TREND[REVENUE_TREND.length - 1];
  const prior = REVENUE_TREND[REVENUE_TREND.length - 2];
  const mrrGrowth = ((latest.mrr - prior.mrr) / prior.mrr) * 100;
  const gmvGrowth = ((latest.gmv - prior.gmv) / prior.gmv) * 100;
  const pastDue = TENANTS.filter((t) => t.status === 'past_due');

  return (
    <div className="pb-10">
      <PageHeader title="Revenue & Billing" description="Platform-wide subscription and transaction revenue" />

      <div className="grid grid-cols-1 gap-4 px-6 pt-6 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="MRR" value={formatUsd(latest.mrr)} icon={DollarSign} change={mrrGrowth} />
        <StatCard label="GMV (this month)" value={formatCurrency(latest.gmv)} icon={TrendingUp} change={gmvGrowth} />
        <StatCard label="New tenants" value={String(latest.newTenants)} icon={UserPlus} sublabel="this month" />
        <StatCard label="Churned tenants" value={String(latest.churnedTenants)} icon={UserMinus} sublabel="this month" />
      </div>

      <div className="grid grid-cols-1 gap-4 px-6 pt-4 xl:grid-cols-2">
        <div className="zs-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">MRR Growth</h3>
          <MiniBarChart data={REVENUE_TREND as unknown as Record<string, unknown>[]} valueKey="mrr" labelKey="month" formatValue={formatUsd} />
        </div>
        <div className="zs-card p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">GMV Growth</h3>
          <MiniBarChart data={REVENUE_TREND as unknown as Record<string, unknown>[]} valueKey="gmv" labelKey="month" formatValue={formatCurrency} />
        </div>
      </div>

      <div className="px-6 pt-4">
        <div className="zs-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-white">Accounts past due</h3>
          <p className="mb-4 text-xs text-slate-500">Failed or overdue subscription payments needing follow-up</p>
          {pastDue.length === 0 ? (
            <p className="text-sm text-slate-500">No past-due accounts. 🎉</p>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {pastDue.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-slate-200">{t.name}</span>
                    <span className="ml-2 text-xs text-slate-500">{t.plan} plan</span>
                  </div>
                  <span className="font-medium text-amber-400">{formatUsd(t.mrr)} overdue</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
