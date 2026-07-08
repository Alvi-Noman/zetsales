// Mirrors services/commerce-service/src/utils/dateRange.ts's ComparisonMode exactly — kept as a
// plain string union here (not round-tripped through the shared package) the same way `range`
// itself already is, since it's a query-input concern, not a server-returned DTO shape.
export type ComparisonMode = 'previousPeriod' | 'previousYear' | 'previousYearMatchDay' | 'custom' | 'none';

export const COMPARISON_MODE_LABELS: Record<ComparisonMode, string> = {
  none: 'No comparison',
  previousPeriod: 'Previous period',
  previousYear: 'Previous year',
  previousYearMatchDay: 'Previous year (match day)',
  custom: 'Custom',
};

export interface CustomComparisonRange {
  from: string;
  to: string;
}
