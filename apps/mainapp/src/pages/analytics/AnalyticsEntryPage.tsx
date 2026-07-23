import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, SlidersHorizontal, TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";
import type {
  AnalyticsCardKey,
  AnalyticsCategory,
  AnalyticsLayoutDTO,
  AnalyticsSummaryDTO,
  StoreDTO,
} from "@zetsales/shared";
import { listStores } from "../../lib/commerceApi";
import {
  getAnalyticsLayout,
  getAnalyticsSummary,
} from "../../lib/analyticsApi";
import { AnalyticsFilterBar } from "../../components/analytics/AnalyticsFilterBar";
import { CustomizeDrawer } from "../../components/analytics/CustomizeDrawer";
import {
  ANALYTICS_CARD_MAP,
  ANALYTICS_CARDS,
  ANALYTICS_CATEGORY_ORDER,
} from "../../analytics/cardRegistry";
import type { AnalyticsCardDefinition } from "../../analytics/types";
import { toAnalyticsQuery } from "../../analytics/query";
import {
  formatMoney,
  formatCount,
  formatPercentRounded,
} from "../../analytics/format";
import type {
  CustomDateRange,
  DateRangeKey,
} from "../../components/orders/dateRange";
import type {
  ComparisonMode,
  CustomComparisonRange,
} from "../../components/analytics/comparisonMode";

// Module-level, not state: this page fully unmounts when you click into a card's detail view
// (a separate route) and remounts on the way back, so any scroll position saved in component state
// or a ref would be gone by the time it's needed. A plain module variable survives that
// unmount/remount as long as the SPA session does, which is exactly the lifetime this needs.
let savedScrollTop = 0;

function summaryTiles(summary: AnalyticsSummaryDTO | null) {
  return [
    {
      label: "Total sales",
      value: summary ? formatMoney(summary.totalSales.value) : null,
      trend: summary?.totalSales.trend,
      // Raw figure counts duplicate/quantity-error orders at full value even after they're
      // cancelled — those were never real demand, just data-entry noise, so the adjusted figure
      // (netting them out) is a closer read on true sales.
      sub: summary
        ? `Excl. data-entry errors: ${formatMoney(summary.adjustedTotalSales.value)}`
        : null,
    },
    {
      label: "Total orders",
      value: summary ? formatCount(summary.totalOrders.value) : null,
      trend: summary?.totalOrders.trend,
    },
    {
      label: "Avg order value",
      value: summary ? formatMoney(summary.aov.value) : null,
      trend: summary?.aov.trend,
    },
    {
      label: "Confirmation rate",
      value: summary
        ? formatPercentRounded(summary.confirmationRate.value)
        : null,
      trend: summary?.confirmationRate.trend,
      // Raw rate counts duplicate/quantity-error orders that got cancelled as "lost" — those were
      // never real demand, just data-entry noise caught on the way in, so the adjusted figure
      // (excluding them) is a closer read on true confirmation performance.
      sub: summary
        ? `Excl. data-entry errors: ${formatPercentRounded(summary.adjustedConfirmationRate.value)}`
        : null,
    },
    {
      label: "Delivered rate",
      value: summary ? formatPercentRounded(summary.deliveredRate.value) : null,
      trend: summary?.deliveredRate.trend,
    },
    {
      label: "RTO rate",
      value: summary ? formatPercentRounded(summary.rtoRate.value) : null,
      trend: summary?.rtoRate.trend,
      invert: true,
    },
    {
      label: "COD outstanding",
      value: summary ? formatMoney(summary.codOutstanding.value) : null,
      trend: summary?.codOutstanding.trend,
      invert: true,
    },
    {
      label: "Gross profit margin",
      value: summary
        ? formatPercentRounded(summary.grossProfitMargin.value)
        : null,
      trend: summary?.grossProfitMargin.trend,
    },
  ];
}

export function AnalyticsEntryPage() {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dateRange, setDateRange] = useState<DateRangeKey>("last30");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [storeId, setStoreId] = useState("all");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("none");
  const [comparisonRange, setComparisonRange] =
    useState<CustomComparisonRange | null>(null);
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummaryDTO | null>(null);
  const [layout, setLayout] = useState<AnalyticsLayoutDTO | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const query = useMemo(
    () =>
      toAnalyticsQuery(
        dateRange,
        customRange,
        storeId,
        comparisonMode,
        comparisonRange,
      ),
    [dateRange, customRange, storeId, comparisonMode, comparisonRange],
  );

  useEffect(() => {
    void listStores().then(setStores);
    void getAnalyticsLayout().then(setLayout);
  }, []);

  useEffect(() => {
    setSummary(null);
    void getAnalyticsSummary(query).then(setSummary);
  }, [
    query.range,
    query.from,
    query.to,
    query.storeId,
    query.comparisonMode,
    query.comparisonFrom,
    query.comparisonTo,
  ]);

  const orderedVisibleCards = useMemo(() => {
    if (!layout) return ANALYTICS_CARDS;
    const savedKeys = new Set(layout.cards.map((c) => c.key));
    const fromLayout = layout.cards
      .map((c) => ({ ...c, def: ANALYTICS_CARD_MAP[c.key] }))
      .filter((c) => c.def);
    const notYetSaved = ANALYTICS_CARDS.filter(
      (c) => !savedKeys.has(c.key as AnalyticsCardKey),
    ).map((def) => ({ key: def.key as AnalyticsCardKey, hidden: false, def }));
    return [...fromLayout, ...notYetSaved]
      .filter((c) => !c.hidden)
      .map((c) => c.def!);
  }, [layout]);

  // Grouped into a labeled section per category (Sales, Orders, Delivery, Customers, Finance,
  // Inventory) rather than one flat grid — each card keeps its position relative to other cards in
  // the same category (so drag-reordering within the customize drawer still does something), but
  // the macro structure always reads top-to-bottom in ANALYTICS_CATEGORY_ORDER.
  const cardsByCategory = useMemo(() => {
    const groups = new Map<AnalyticsCategory, AnalyticsCardDefinition[]>();
    for (const def of orderedVisibleCards) {
      const list = groups.get(def.category) ?? [];
      list.push(def);
      groups.set(def.category, list);
    }
    return ANALYTICS_CATEGORY_ORDER.map((category) => ({
      category,
      cards: groups.get(category) ?? [],
    })).filter((g) => g.cards.length > 0);
  }, [orderedVisibleCards]);

  // Restore before paint (not useEffect) so there's no visible flash of the top of the page before
  // jumping down — every card's compact tile already reserves its final height via a skeleton
  // placeholder while its own data is still loading, so the page's total height (and therefore
  // where this scrollTop actually lands) is stable from the very first render.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop;
  }, []);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        savedScrollTop = e.currentTarget.scrollTop;
      }}
      className="zs-page-scroll"
    >
      <div className="zs-page-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="zs-page-title">Analytics</h1>
            <p className="zs-page-description">
              Real performance across every connected store, right down to why
              an order didn't convert.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/analytics/reports")}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileText size={14} /> Reports
            </button>
            <button
              onClick={() => setCustomizeOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <SlidersHorizontal size={14} /> Customize
            </button>
          </div>
        </div>
        <div className="mt-4">
          <AnalyticsFilterBar
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            customRange={customRange}
            onCustomRangeChange={setCustomRange}
            storeId={storeId}
            onStoreIdChange={setStoreId}
            stores={stores}
            comparisonMode={comparisonMode}
            onComparisonModeChange={setComparisonMode}
            comparisonRange={comparisonRange}
            onComparisonRangeChange={setComparisonRange}
          />
        </div>
      </div>

      <div className="zs-page-body space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryTiles(summary).map((tile) => (
            <div key={tile.label} className="zs-surface p-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                {tile.label}
              </p>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums text-slate-900">
                  {tile.value ?? "—"}
                </span>
                {tile.trend != null && (
                  <span
                    className={clsx(
                      "flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
                      (tile.invert ? tile.trend <= 0 : tile.trend >= 0)
                        ? "text-emerald-600"
                        : "text-rose-600",
                    )}
                  >
                    {tile.trend >= 0 ? (
                      <TrendingUp size={11} />
                    ) : (
                      <TrendingDown size={11} />
                    )}
                    {Math.abs(tile.trend)}%
                  </span>
                )}
              </div>
              {"sub" in tile && tile.sub && (
                <p className="mt-1 text-[10.5px] font-medium text-slate-400">
                  {tile.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {cardsByCategory.map(({ category, cards }) => (
          <section key={category}>
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              {category}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {cards.map((def) => (
                <def.CardComponent key={def.key} query={query} />
              ))}
            </div>
          </section>
        ))}

        {orderedVisibleCards.length === 0 && (
          <div className="zs-dashed-surface flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm font-medium text-slate-600">
              Every card is hidden
            </p>
            <button
              onClick={() => setCustomizeOpen(true)}
              className="mt-1 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Add cards back
            </button>
          </div>
        )}
      </div>

      <CustomizeDrawer
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        layout={layout}
        onSaved={setLayout}
      />
    </div>
  );
}
