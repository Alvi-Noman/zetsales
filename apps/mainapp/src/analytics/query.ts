import type { CustomDateRange, DateRangeKey } from '../components/orders/dateRange';
import type { AnalyticsQueryParams } from '../lib/analyticsApi';

// Bridges the app's existing DateRangeMenu (used across Orders/Home) to the analytics endpoints'
// `range`/`from`/`to` contract. "All time" has no equivalent on the backend's current-vs-comparison
// model, so it's translated into an explicit wide custom span instead of being silently
// misinterpreted as the server's unrecognized-range fallback.
export function toAnalyticsQuery(range: DateRangeKey, customRange: CustomDateRange | null, storeId: string): AnalyticsQueryParams {
  const scopedStoreId = storeId !== 'all' ? storeId : undefined;
  if (range === 'all') {
    return { range: 'custom', from: '2015-01-01T00:00:00.000Z', to: new Date().toISOString(), storeId: scopedStoreId };
  }
  if (range === 'custom' && customRange?.from && customRange?.to) {
    return { range: 'custom', from: customRange.from, to: customRange.to, storeId: scopedStoreId };
  }
  return { range, storeId: scopedStoreId };
}

export type { DateRangeKey, CustomDateRange };
