import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  Package,
  CreditCard,
  LifeBuoy,
  Activity,
  ScrollText,
  Settings,
} from 'lucide-react';

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Tenants', path: '/tenants', icon: Building2 },
  { label: 'Top Products', path: '/products', icon: Package },
  { label: 'Revenue & Billing', path: '/billing', icon: CreditCard },
  { label: 'Support', path: '/support', icon: LifeBuoy },
  { label: 'System Health', path: '/system', icon: Activity },
  { label: 'Audit Log', path: '/audit', icon: ScrollText },
];

export const NAV_FOOTER_ITEMS: NavItem[] = [
  { label: 'Settings', path: '/settings', icon: Settings },
];
