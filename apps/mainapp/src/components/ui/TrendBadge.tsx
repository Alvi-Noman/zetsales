import { TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";

interface TrendBadgeProps {
  trend: number | null | undefined;
  // Some metrics are "good when down" (RTO rate, cancellations) — this flips which direction
  // renders green vs rose without changing the arrow itself, which always just shows sign.
  invert?: boolean;
}

// Same up/down arrow + percentage chip used across Analytics (AnalyticsCardShell,
// AnalyticsEntryPage's summary tiles) — factored out so Home's stat tiles use the identical
// treatment instead of a third hand-rolled copy.
export function TrendBadge({ trend, invert = false }: TrendBadgeProps) {
  if (trend == null) return null;
  const isGood = invert ? trend <= 0 : trend >= 0;

  return (
    <span
      className={clsx(
        "flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        isGood ? "text-emerald-600" : "text-rose-600",
      )}
    >
      {trend >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(trend)}%
    </span>
  );
}
