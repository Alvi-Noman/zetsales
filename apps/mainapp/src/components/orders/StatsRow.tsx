import { Ban, CheckCircle2, Clock3, ShoppingBag } from "lucide-react";
import clsx from "clsx";
import type {
  OrderStatsDTO,
  OrderTabKey,
  OrderTrendsDTO,
  TrendPointDTO,
} from "@zetsales/shared";
import { TrendChart, type TrendChartPoint } from "./TrendChart";

type Tone = "indigo" | "emerald" | "amber" | "sky" | "violet" | "rose";
type MetricKey =
  | "totalOrders"
  | "totalRevenue"
  | "pending"
  | "confirmed"
  | "processing"
  | "delivered"
  | "cancelled";

const TONE_CLASSES: Record<
  Tone,
  {
    iconBg: string;
    text: string;
    line: string;
    wash: string;
    border: string;
    hoverBorder: string;
  }
> = {
  indigo: {
    iconBg: "bg-gradient-to-br from-indigo-100 to-indigo-50",
    text: "text-indigo-600",
    line: "#6366f1",
    wash: "from-indigo-500/[0.06]",
    border: "border-indigo-300",
    hoverBorder: "hover:border-indigo-300",
  },
  emerald: {
    iconBg: "bg-gradient-to-br from-emerald-100 to-emerald-50",
    text: "text-emerald-600",
    line: "#10b981",
    wash: "from-emerald-500/[0.06]",
    border: "border-emerald-300",
    hoverBorder: "hover:border-emerald-300",
  },
  amber: {
    iconBg: "bg-gradient-to-br from-orange-100 to-orange-50",
    text: "text-orange-600",
    line: "#f97316",
    wash: "from-orange-500/[0.06]",
    border: "border-orange-300",
    hoverBorder: "hover:border-orange-300",
  },
  sky: {
    iconBg: "bg-gradient-to-br from-blue-100 to-blue-50",
    text: "text-blue-600",
    line: "#3b82f6",
    wash: "from-blue-500/[0.06]",
    border: "border-blue-300",
    hoverBorder: "hover:border-blue-300",
  },
  violet: {
    iconBg: "bg-gradient-to-br from-violet-100 to-violet-50",
    text: "text-violet-600",
    line: "#8b5cf6",
    wash: "from-violet-500/[0.06]",
    border: "border-violet-300",
    hoverBorder: "hover:border-violet-300",
  },
  rose: {
    iconBg: "bg-gradient-to-br from-rose-100 to-rose-50",
    text: "text-rose-600",
    line: "#f43f8e",
    wash: "from-rose-500/[0.06]",
    border: "border-rose-300",
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

interface KpiCardProps {
  icon: typeof ShoppingBag;
  tone: Tone;
  label: string;
  value: string;
  metricKey: MetricKey;
  trends: OrderTrendsDTO | null;
  formatValue: (v: number) => string;
  active: boolean;
  onClick: () => void;
}

function KpiCard({
  icon: Icon,
  tone,
  label,
  value,
  metricKey,
  trends,
  formatValue,
  active,
  onClick,
}: KpiCardProps) {
  const t = TONE_CLASSES[tone];

  return (
    <button
      onClick={onClick}
      className={clsx(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-white p-4 text-left transition-colors duration-200 ease-out",
        active ? t.border : clsx("border-slate-200/80", t.hoverBorder),
      )}
    >
      {/* Soft tone-tinted wash that fades in on hover, sitting under everything else. */}
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
    </button>
  );
}

function StatsRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-[172px] flex-1 animate-pulse rounded-lg border border-slate-200/80 bg-white"
        />
      ))}
    </div>
  );
}

interface StatsRowProps {
  stats: OrderStatsDTO | null;
  trends: OrderTrendsDTO | null;
  activeTab: OrderTabKey;
  onNavigate: (tab: OrderTabKey) => void;
}

const formatCount = (v: number) => v.toLocaleString();

export function StatsRow({
  stats,
  trends,
  activeTab,
  onNavigate,
}: StatsRowProps) {
  if (!stats) return <StatsRowSkeleton />;

  const cancelledOrders =
    stats.cancelledOrders ?? stats.tabCounts.cancelled ?? 0;

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <KpiCard
        icon={ShoppingBag}
        tone="indigo"
        label="Total Orders"
        value={stats.totalOrders.toLocaleString()}
        metricKey="totalOrders"
        trends={trends}
        formatValue={formatCount}
        active={activeTab === "all"}
        onClick={() => onNavigate("all")}
      />
      <KpiCard
        icon={Clock3}
        tone="amber"
        label="Pending Orders"
        value={stats.tabCounts.pending.toLocaleString()}
        metricKey="pending"
        trends={trends}
        formatValue={formatCount}
        active={activeTab === "pending"}
        onClick={() => onNavigate("pending")}
      />
      <KpiCard
        icon={CheckCircle2}
        tone="emerald"
        label="Confirmed Orders"
        value={stats.tabCounts.confirmed.toLocaleString()}
        metricKey="confirmed"
        trends={trends}
        formatValue={formatCount}
        active={activeTab === "confirmed"}
        onClick={() => onNavigate("confirmed")}
      />
      <KpiCard
        icon={Ban}
        tone="rose"
        label="Cancelled"
        value={cancelledOrders.toLocaleString()}
        metricKey="cancelled"
        trends={trends}
        formatValue={formatCount}
        active={activeTab === "cancelled"}
        onClick={() => onNavigate("cancelled")}
      />
    </div>
  );
}
