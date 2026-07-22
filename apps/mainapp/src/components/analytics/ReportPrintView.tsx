import { useState } from "react";
import { createPortal } from "react-dom";
import { Printer, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { ReportTable } from "../../analytics/reportsRegistry";

interface ReportPrintViewProps {
  title: string;
  periodLabel: string;
  table: ReportTable;
  emptyLabel?: string;
  onClose: () => void;
}

// Same portal-outside-#root + print-area pattern as PrintOrderModal/CourierLabelModal — window.print()
// only paginates normal-flow content, so the printable table has to render outside the app shell's
// positioned/scrolling layout, not inside this modal's own overlay.
export function ReportPrintView({ title, periodLabel, table, emptyLabel = "No data for this period", onClose }: ReportPrintViewProps) {
  const { user } = useAuth();
  const [printing, setPrinting] = useState(false);

  const handlePrint = () => {
    setPrinting(true);
    setTimeout(() => {
      window.print();
      setPrinting(false);
    }, 0);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 print:static print:block print:h-auto print:p-0">
      <div className="absolute inset-0 bg-slate-900/40 print:hidden" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-[1200px] flex-col overflow-hidden rounded-lg bg-white shadow-2xl print:static print:block print:h-auto print:max-h-none print:w-full print:max-w-none print:overflow-visible print:rounded-none print:shadow-none">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 print:hidden">
          <div>
            <h2 className="text-base font-bold text-slate-900">Print preview</h2>
            <p className="mt-0.5 text-sm text-slate-500">A4 landscape, one table per page. Preview below, then print.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={printing}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Printer size={14} /> {printing ? "Preparing..." : "Print"}
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X size={16} />
            </button>
          </div>
        </div>
        <style>{`
          @media print { @page { size: A4 landscape; } }
          .zs-report-table td:first-child, .zs-report-table th:first-child { min-width: 200px; }
          .zs-report-table td, .zs-report-table th { white-space: nowrap; }
          .zs-report-table td:first-child, .zs-report-table th:first-child { white-space: normal; }
        `}</style>
        <div className="print-area overflow-y-auto bg-slate-50 print:overflow-visible print:bg-white">
          <div className="print-page-break mx-auto w-full max-w-[297mm] bg-white p-8 text-slate-900">
            <div className="mb-6 flex items-start justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-lg font-bold">{user?.businessName || "Your Business"}</p>
                <p className="mt-0.5 text-sm text-slate-500">{title}</p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>{periodLabel}</p>
                <p>Generated {new Date().toLocaleString()}</p>
              </div>
            </div>
            <table className="zs-report-table w-full border-collapse text-xs">
              <thead>
                <tr className="border-b-2 border-slate-800">
                  {table.columns.map((col) => (
                    <th key={col.key} className={`py-2 pr-3 font-bold uppercase tracking-wide text-slate-700 ${col.align === "right" ? "text-right" : "text-left"}`}>
                      {col.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.length === 0 ? (
                  <tr>
                    <td colSpan={table.columns.length} className="py-6 text-center text-slate-400">
                      {emptyLabel}
                    </td>
                  </tr>
                ) : (
                  table.rows.map((row, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      {table.columns.map((col) => {
                        const raw = row[col.key] ?? "";
                        return (
                          <td key={col.key} className={`py-1.5 pr-3 ${col.align === "right" ? "text-right tabular-nums" : "text-left"}`}>
                            {col.format ? col.format(raw) : raw}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
