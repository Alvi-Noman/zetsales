import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { REPORTS_LIST } from "../../analytics/reportsRegistry";
import { ANALYTICS_CATEGORY_ORDER } from "../../analytics/cardRegistry";

export function ReportsListPage() {
  const navigate = useNavigate();
  const grouped = ANALYTICS_CATEGORY_ORDER.map((category) => ({
    category,
    reports: REPORTS_LIST.filter((r) => r.category === category),
  })).filter((g) => g.reports.length > 0);

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header">
        <button onClick={() => navigate("/analytics")} className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700">
          <ArrowLeft size={13} /> Analytics dashboard
        </button>
        <h1 className="zs-page-title">Reports</h1>
        <p className="zs-page-description">Click a report for a date-filtered table you can export as CSV or print to A4.</p>
      </div>

      <div className="zs-page-body space-y-6">
        {grouped.map(({ category, reports }) => (
          <section key={category}>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">{category}</h2>
            <div className="zs-surface divide-y divide-slate-100">
              {reports.map((r) => (
                <button
                  key={r.key}
                  onClick={() => navigate(`/analytics/reports/${r.key}`)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{r.label}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{r.description}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-slate-300" />
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
