import { Package } from "lucide-react";
import type { ProductRankingRowDTO } from "@zetsales/shared";

interface TopProductsCardProps {
  rows: ProductRankingRowDTO[] | null;
  formatMoney: (v: number) => string;
  formatCount: (v: number) => string;
  onViewAll: () => void;
  maxRows?: number;
}

// Ranked horizontal bars, one hue — this is a single measure (revenue) sliced by product identity,
// not distinct series, so bar length alone carries the magnitude (same convention as the Analytics
// module's ParetoChart). Every value is also a visible direct label, so nothing depends on color alone.
export function TopProductsCard({ rows, formatMoney, formatCount, onViewAll, maxRows = 6 }: TopProductsCardProps) {
  const shown = rows?.slice(0, maxRows) ?? [];
  const maxRevenue = Math.max(...shown.map((r) => r.revenue), 1);

  return (
    <section className="zs-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Top Products</h2>
        <button
          onClick={onViewAll}
          className="text-xs font-medium text-slate-400 hover:text-indigo-600"
        >
          View all
        </button>
      </div>

      {rows === null ? (
        <div className="space-y-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-slate-50" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1.5 text-center">
          <Package size={20} className="text-slate-300" />
          <p className="text-sm text-slate-400">No sales in this period</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((row) => {
            const widthPct = Math.max(2, (row.revenue / maxRevenue) * 100);
            return (
              <div key={row.productId} className="group">
                <div className="mb-1 flex items-center gap-3">
                  {row.image ? (
                    <img src={row.image} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100">
                      <Package size={13} className="text-slate-300" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-700" title={row.title}>
                    {row.title}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                    {formatCount(row.unitsSold)} sold
                  </span>
                  <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-slate-900">
                    {formatMoney(row.revenue)}
                  </span>
                </div>
                <div className="relative ml-10 h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-indigo-500 transition-all duration-300 ease-out group-hover:bg-indigo-600"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
