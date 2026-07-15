import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import clsx from "clsx";

export type ExportScope = "page" | "filtered" | "selected";
export type ExportFormat = "excel" | "plain";

interface RadioRowProps {
  checked: boolean;
  disabled?: boolean;
  label: string;
  sublabel?: string;
  onSelect: () => void;
}

function RadioRow({
  checked,
  disabled,
  label,
  sublabel,
  onSelect,
}: RadioRowProps) {
  return (
    <label
      className={clsx(
        "flex items-center gap-2.5 py-1.5",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      )}
    >
      <input
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="h-4 w-4 border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-60"
      />
      <span className="text-sm text-slate-700">
        {label}
        {sublabel && <span className="ml-1.5 text-slate-400">{sublabel}</span>}
      </span>
    </label>
  );
}

interface ExportOrdersModalProps {
  open: boolean;
  onClose: () => void;
  pageCount: number;
  filteredCount: number;
  selectedCount: number;
  hasActiveFilters: boolean;
  exporting: boolean;
  onExport: (scope: ExportScope, format: ExportFormat) => void;
}

// Mirrors the scope/format split sellers already expect from Shopify-style exports, but every
// option here maps to something ZetSales can actually produce — no "orders by date" or
// "transaction histories" placeholders that don't have real data behind them yet.
export function ExportOrdersModal({
  open,
  onClose,
  pageCount,
  filteredCount,
  selectedCount,
  hasActiveFilters,
  exporting,
  onExport,
}: ExportOrdersModalProps) {
  const [scope, setScope] = useState<ExportScope>("page");
  const [format, setFormat] = useState<ExportFormat>("excel");

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-900">Export orders</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Export
          </p>
          <RadioRow
            checked={scope === "page"}
            label="Current page"
            sublabel={`(${pageCount} orders)`}
            onSelect={() => setScope("page")}
          />
          <RadioRow
            checked={scope === "filtered"}
            label={
              hasActiveFilters ? "All orders matching filters" : "All orders"
            }
            sublabel={`(${filteredCount.toLocaleString()} orders)`}
            onSelect={() => setScope("filtered")}
          />
          <RadioRow
            checked={scope === "selected"}
            disabled={selectedCount === 0}
            label="Selected"
            sublabel={`(${selectedCount} orders)`}
            onSelect={() => setScope("selected")}
          />

          <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Export as
          </p>
          <RadioRow
            checked={format === "excel"}
            label="CSV for Excel, Numbers, or other spreadsheet programs"
            onSelect={() => setFormat("excel")}
          />
          <RadioRow
            checked={format === "plain"}
            label="Plain CSV file"
            onSelect={() => setFormat("plain")}
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onExport(scope, format)}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            {exporting ? "Exporting..." : "Export orders"}
          </button>
        </div>
      </div>
    </div>
  );
}
