import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { TOP_PRODUCTS, formatCurrency } from '../../lib/mockData';

export function TopProductsPage() {
  return (
    <div className="pb-10">
      <PageHeader title="Top Products" description="Best sellers across all tenant storefronts, last 30 days" />

      <div className="px-6 pt-6">
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Tenant</th>
                <th className="px-5 py-3 font-medium">Units sold</th>
                <th className="px-5 py-3 font-medium">Revenue</th>
                <th className="px-5 py-3 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {TOP_PRODUCTS.map((p, i) => (
                <tr key={p.id} className="transition-colors hover:bg-slate-900/70">
                  <td className="px-5 py-3 text-slate-500">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-slate-200">{p.name}</td>
                  <td className="px-5 py-3">
                    <Badge tone="slate">{p.category}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{p.tenantName}</td>
                  <td className="px-5 py-3 text-slate-400">{p.unitsSold30d.toLocaleString()}</td>
                  <td className="px-5 py-3 font-medium text-slate-200">{formatCurrency(p.revenue30d)}</td>
                  <td className="px-5 py-3">
                    <span className={p.trend >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {p.trend >= 0 ? '+' : ''}
                      {p.trend.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
