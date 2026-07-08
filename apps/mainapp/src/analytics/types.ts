import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AnalyticsCardKey, AnalyticsCategory } from '@zetsales/shared';
import type { AnalyticsQueryParams } from '../lib/analyticsApi';

export interface AnalyticsCardComponentProps {
  query: AnalyticsQueryParams;
}

export interface AnalyticsCardDefinition {
  key: AnalyticsCardKey;
  title: string;
  category: AnalyticsCategory;
  description: string;
  icon: LucideIcon;
  // Compact tile shown on the entry page grid — fetches its own data and renders a mini
  // visualization + headline metric; clicking it navigates to /analytics/:key.
  CardComponent: ComponentType<AnalyticsCardComponentProps>;
  // Full content rendered inside the shared AnalyticsDetailPage shell (header + filter bar already
  // provided) — the large chart + breakdown table for this one metric.
  DetailComponent: ComponentType<AnalyticsCardComponentProps>;
}
