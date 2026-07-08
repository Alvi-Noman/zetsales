import type { CustomDateRange, DateRangeKey } from '../components/orders/dateRange';
import type { AnalyticsQueryParams } from '../lib/analyticsApi';
import type { ComparisonMode, CustomComparisonRange } from '../components/analytics/comparisonMode';

// Bridges the app's existing DateRangeMenu (used across Orders/Home) to the analytics endpoints'
// `range`/`from`/`to` contract. "All time" has no equivalent on the backend's current-vs-comparison
// model, so it's translated into an explicit wide custom span instead of being silently
// misinterpreted as the server's unrecognized-range fallback.
//
// comparisonMode/comparisonRange are optional so every existing call site (before this feature
// existed) still compiles unchanged and just gets the backend's default ("previousPeriod") behavior.
export function toAnalyticsQuery(
  range: DateRangeKey,
  customRange: CustomDateRange | null,
  storeId: string,
  comparisonMode?: ComparisonMode,
  comparisonRange?: CustomComparisonRange | null
): AnalyticsQueryParams {
  const scopedStoreId = storeId !== 'all' ? storeId : undefined;
  const comparison =
    comparisonMode === 'custom' && comparisonRange?.from && comparisonRange?.to
      ? { comparisonMode, comparisonFrom: comparisonRange.from, comparisonTo: comparisonRange.to }
      : comparisonMode
        ? { comparisonMode }
        : {};
  if (range === 'all') {
    return { range: 'custom', from: '2015-01-01T00:00:00.000Z', to: new Date().toISOString(), storeId: scopedStoreId, ...comparison };
  }
  if (range === 'custom' && customRange?.from && customRange?.to) {
    return { range: 'custom', from: customRange.from, to: customRange.to, storeId: scopedStoreId, ...comparison };
  }
  return { range, storeId: scopedStoreId, ...comparison };
}

export type { DateRangeKey, CustomDateRange };
