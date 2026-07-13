import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { AnalyticsCardKey, AnalyticsCategory } from '@zetsales/shared';
import type { AnalyticsQueryParams } from '../lib/analyticsApi';

export interface AnalyticsCardComponentProps {
  query: AnalyticsQueryParams;
}

export interface AnalyticsCardDefinition {
  // Loosened beyond the closed AnalyticsCardKey union (which keeps autocomplete for the ~60
  // official cards) so a plugin can contribute a card at the admin.analytics.block extension
  // target with an arbitrary key, without touching AnalyticsCardKey itself or any other consumer
  // of it — this registry boundary is the only place that needs to accept both.
  key: AnalyticsCardKey | (string & {});
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
