import clsx from "clsx";
import type { LucideIcon } from "lucide-react";
import type { OrderTrendsDTO, TrendPointDTO } from "@zetsales/shared";
import { TrendChart, type TrendChartPoint } from "../orders/TrendChart";

export type KpiTone =
  | "indigo"
  | "emerald"
  | "amber"
  | "sky"
  | "violet"
  | "rose";
type MetricKey =
  | "totalOrders"
  | "totalRevenue"
  | "pending"
  | "confirmed"
  | "processing"
  | "delivered"
  | "cancelled"
  | "confirmedAmount"
  | "cancelledAmount";

const TONE_CLASSES: Record<
  KpiTone,
  {
    iconBg: string;
    text: string;
    line: string;
    wash: string;
    hoverBorder: string;
  }
> = {
  indigo: {
    iconBg: "bg-gradient-to-br from-indigo-100 to-indigo-50",
    text: "text-indigo-600",
    line: "#6366f1",
    wash: "from-indigo-500/[0.06]",
    hoverBorder: "hover:border-indigo-300",
  },
  emerald: {
    iconBg: "bg-gradient-to-br from-emerald-100 to-emerald-50",
    text: "text-emerald-600",
    line: "#10b981",
    wash: "from-emerald-500/[0.06]",
    hoverBorder: "hover:border-emerald-300",
  },
  amber: {
    iconBg: "bg-gradient-to-br from-orange-100 to-orange-50",
    text: "text-orange-600",
    line: "#f97316",
    wash: "from-orange-500/[0.06]",
    hoverBorder: "hover:border-orange-300",
  },
  sky: {
    iconBg: "bg-gradient-to-br from-blue-100 to-blue-50",
    text: "text-blue-600",
    line: "#3b82f6",
    wash: "from-blue-500/[0.06]",
    hoverBorder: "hover:border-blue-300",
  },
  violet: {
    iconBg: "bg-gradient-to-br from-violet-100 to-violet-50",
    text: "text-violet-600",
    line: "#8b5cf6",
    wash: "from-violet-500/[0.06]",
    hoverBorder: "hover:border-violet-300",
  },
  rose: {
    iconBg: "bg-gradient-to-br from-rose-100 to-rose-50",
    text: "text-rose-600",
    line: "#f43f8e",
    wash: "from-rose-500/[0.06]",
    hoverBorder: "hover:border-rose-300",
  },
};

function toChartPoints(
  points: TrendPointDTO[],
  key: MetricKey,
): TrendChartPoint[] {
  return points.map((p) => ({
    index: p.index,
    label: p.label,
    date: p.date,
    value: p[key],
  }));
}

interface HomeKpiCardProps {
  icon: LucideIcon;
  tone: KpiTone;
  label: string;
  value: string;
  metricKey: MetricKey;
  trends: OrderTrendsDTO | null;
  formatValue: (v: number) => string;
  onClick?: () => void;
}

export function HomeKpiCard({
  icon: Icon,
  tone,
  label,
  value,
  metricKey,
  trends,
  formatValue,
  onClick,
}: HomeKpiCardProps) {
  const t = TONE_CLASSES[tone];
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={clsx(
        "group relative flex flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white p-4 text-left transition-colors duration-200 ease-out",
        onClick && t.hoverBorder,
      )}
    >
      <div
        className={clsx(
          "pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100",
          t.wash,
        )}
      />

      <div className="relative flex items-start gap-3">
        <div
          className={clsx(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 ease-out group-hover:scale-110",
            t.iconBg,
            t.text,
          )}
        >
          <Icon size={20} strokeWidth={2.3} />
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-[22px] font-black leading-none tracking-tight text-slate-900 tabular-nums">
            {value}
          </p>
        </div>
      </div>

      <div className="relative mt-3.5">
        {trends ? (
          <TrendChart
            current={toChartPoints(trends.current.points, metricKey)}
            comparison={toChartPoints(trends.comparison.points, metricKey)}
            color={t.line}
            formatValue={formatValue}
          />
        ) : (
          <div className="h-[68px] animate-pulse rounded-md bg-slate-50" />
        )}
      </div>
    </Tag>
  );
}
