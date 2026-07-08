import type { ReactNode } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import type { StoreDTO } from '@zetsales/shared';
import { DateRangeMenu } from '../orders/DateRangeMenu';
import { FilterMenu } from '../orders/FilterMenu';
import type { CustomDateRange, DateRangeKey } from '../orders/dateRange';
import { ComparisonMenu } from './ComparisonMenu';
import type { ComparisonMode, CustomComparisonRange } from './comparisonMode';

interface AnalyticsFilterBarProps {
  dateRange: DateRangeKey;
  onDateRangeChange: (key: DateRangeKey) => void;
  customRange: CustomDateRange | null;
  onCustomRangeChange: (range: CustomDateRange) => void;
  storeId: string;
  onStoreIdChange: (id: string) => void;
  stores: StoreDTO[];
  // Optional — only the two core Analytics pages (entry + detail) wire these up. Ad Performance
  // reuses this same filter bar but its endpoint has no comparison window/trend at all, so forcing
  // it to carry dead comparison state would just be a dropdown that silently does nothing.
  comparisonMode?: ComparisonMode;
  onComparisonModeChange?: (mode: ComparisonMode) => void;
  comparisonRange?: CustomComparisonRange | null;
  onComparisonRangeChange?: (range: CustomComparisonRange) => void;
  extra?: ReactNode;
}

// One filter row, shared by every card's detail page and the entry page's own summary scope —
// same controls, same composition rules as the rest of the app (DateRangeMenu/FilterMenu already
// used on Orders), so switching between "the KPI strip" and "one card's full view" never feels
// like a different tool.
export function AnalyticsFilterBar({
  dateRange,
  onDateRangeChange,
  customRange,
  onCustomRangeChange,
  storeId,
  onStoreIdChange,
  stores,
  comparisonMode,
  onComparisonModeChange,
  comparisonRange,
  onComparisonRangeChange,
  extra,
}: AnalyticsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <DateRangeMenu value={dateRange} onChange={onDateRangeChange} customRange={customRange} onCustomRangeChange={onCustomRangeChange} />
      {comparisonMode && onComparisonModeChange && (
        <ComparisonMenu value={comparisonMode} onChange={onComparisonModeChange} customRange={comparisonRange} onCustomRangeChange={onComparisonRangeChange} />
      )}
      <FilterMenu icon={StoreIcon} allLabel="All stores" value={storeId} options={stores.map((s) => ({ value: s.id, label: s.displayName }))} onChange={onStoreIdChange} />
      {extra}
    </div>
  );
}
