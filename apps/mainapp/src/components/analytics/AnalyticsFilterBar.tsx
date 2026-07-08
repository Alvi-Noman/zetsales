import type { ReactNode } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import type { StoreDTO } from '@zetsales/shared';
import { DateRangeMenu } from '../orders/DateRangeMenu';
import { FilterMenu } from '../orders/FilterMenu';
import type { CustomDateRange, DateRangeKey } from '../orders/dateRange';

interface AnalyticsFilterBarProps {
  dateRange: DateRangeKey;
  onDateRangeChange: (key: DateRangeKey) => void;
  customRange: CustomDateRange | null;
  onCustomRangeChange: (range: CustomDateRange) => void;
  storeId: string;
  onStoreIdChange: (id: string) => void;
  stores: StoreDTO[];
  extra?: ReactNode;
}

// One filter row, shared by every card's detail page and the entry page's own summary scope —
// same controls, same composition rules as the rest of the app (DateRangeMenu/FilterMenu already
// used on Orders), so switching between "the KPI strip" and "one card's full view" never feels
// like a different tool.
export function AnalyticsFilterBar({ dateRange, onDateRangeChange, customRange, onCustomRangeChange, storeId, onStoreIdChange, stores, extra }: AnalyticsFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <DateRangeMenu value={dateRange} onChange={onDateRangeChange} customRange={customRange} onCustomRangeChange={onCustomRangeChange} />
      <FilterMenu icon={StoreIcon} allLabel="All stores" value={storeId} options={stores.map((s) => ({ value: s.id, label: s.displayName }))} onChange={onStoreIdChange} />
      {extra}
    </div>
  );
}
