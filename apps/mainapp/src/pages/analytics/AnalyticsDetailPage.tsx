import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { AnalyticsCardKey, StoreDTO } from "@zetsales/shared";
import { listStores } from "../../lib/commerceApi";
import { AnalyticsFilterBar } from "../../components/analytics/AnalyticsFilterBar";
import { ANALYTICS_CARD_MAP } from "../../analytics/cardRegistry";
import { toAnalyticsQuery } from "../../analytics/query";
import type {
  CustomDateRange,
  DateRangeKey,
} from "../../components/orders/dateRange";
import type {
  ComparisonMode,
  CustomComparisonRange,
} from "../../components/analytics/comparisonMode";
import { PageTitle } from "../../components/layout/PageTitle";

// One route (`/analytics/:cardKey`) for every card — the header, filter bar, and page chrome are
// identical across all of them; only the registry entry's DetailComponent (the chart + table for
// that one metric) differs. This is what guarantees every card actually has a matching full-view
// page with working filters, instead of that being something to check card-by-card.
export function AnalyticsDetailPage() {
  const { cardKey } = useParams<{ cardKey: string }>();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRangeKey>("last30");
  const [customRange, setCustomRange] = useState<CustomDateRange | null>(null);
  const [storeId, setStoreId] = useState("all");
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("none");
  const [comparisonRange, setComparisonRange] =
    useState<CustomComparisonRange | null>(null);
  const [stores, setStores] = useState<StoreDTO[]>([]);

  useEffect(() => {
    void listStores().then(setStores);
  }, []);

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
  const def = ANALYTICS_CARD_MAP[cardKey as AnalyticsCardKey];

  if (!def) {
    return (
      <div className="zs-page flex items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-slate-600">
          This analytics card doesn't exist.
        </p>
        <button
          onClick={() => navigate("/analytics")}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          Back to analytics
        </button>
      </div>
    );
  }

  const Icon = def.icon;

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header">
        <button
          onClick={() => navigate("/analytics")}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft size={13} /> All analytics
        </button>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <Icon size={18} />
          </span>
          <div>
            <PageTitle hideBack>{def.title}</PageTitle>
            <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
              {def.description}
            </p>
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

      <div className="zs-page-body">
        <def.DetailComponent query={query} />
      </div>
    </div>
  );
}
