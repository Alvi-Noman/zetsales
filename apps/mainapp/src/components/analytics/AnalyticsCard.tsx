import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUpRight, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import type { AnalyticsCardKey } from "@zetsales/shared";

interface AnalyticsCardShellProps {
  title: string;
  cardKey: AnalyticsCardKey;
  loading: boolean;
  headlineValue?: string;
  trend?: number | null;
  trendGoodDirection?: "up" | "down";
  children: ReactNode;
}

// Every compact card on the entry-page grid shares this chrome: title, an optional headline
// number + trend chip, and a body slot for whatever mini-visualization that card's data suits. The
// whole tile is the click target through to /analytics/:key, matching the rest of the app's
// pattern of clickable KPI tiles (HomeKpiCard) navigating to the page that has the detail.
export function AnalyticsCardShell({
  title,
  cardKey,
  loading,
  headlineValue,
  trend,
  trendGoodDirection = "up",
  children,
}: AnalyticsCardShellProps) {
  const navigate = useNavigate();
  const trendIsGood =
    trend != null && (trendGoodDirection === "up" ? trend >= 0 : trend <= 0);

  return (
    <button
      onClick={() => navigate(`/analytics/${cardKey}`)}
      className="group flex h-full w-full flex-col rounded-lg border border-slate-200/80 bg-white p-4 text-left transition-colors duration-150 hover:border-indigo-300"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </p>
        <ArrowUpRight
          size={13}
          className="shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>

      {headlineValue !== undefined && (
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[20px] font-black leading-none tracking-tight text-slate-900 tabular-nums">
            {loading ? "—" : headlineValue}
          </span>
          {!loading && trend != null && (
            <span
              className={clsx(
                "flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
                trendIsGood ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {trend >= 0 ? (
                <TrendingUp size={11} />
              ) : (
                <TrendingDown size={11} />
              )}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex-1">
        {loading ? (
          <div className="h-24 w-full animate-pulse rounded-lg bg-slate-50" />
        ) : (
          children
        )}
      </div>
    </button>
  );
}
