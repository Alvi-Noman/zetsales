import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  CalendarClock,
  Printer,
  Truck,
  Undo2,
  Users,
  Megaphone,
  Headset,
  PhoneCall,
  Handshake,
  Landmark,
  BarChart3,
  Puzzle,
  ShieldCheck,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import type { BusinessType, ModuleKey } from '@zetsales/shared';

export interface NavChild {
  label: string;
  path: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  module: ModuleKey;
  badge?: string;
  children?: NavChild[];
  // Restricts visibility to tenants whose onboarding businessType matches — used for nav items
  // that only make sense for a specific sourcing model (e.g. Pre-Orders only fits Importers and
  // Local Wholesale Buyers, not Manufacturers or Dropshippers).
  businessTypes?: BusinessType[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/home', icon: LayoutDashboard, module: 'home' },
  {
    label: 'Orders',
    path: '/orders',
    icon: ShoppingCart,
    module: 'orders',
    children: [
      { label: 'Drafts', path: '/orders/drafts' },
      { label: 'Abandoned checkouts', path: '/orders/abandoned' },
    ],
  },
  {
    label: 'Print Out',
    path: '/print-out',
    icon: Printer,
    module: 'printOut',
    children: [{ label: 'Invoice Design', path: '/print-out/templates' }],
  },
  { label: 'Call Center', path: '/call-center', icon: PhoneCall, module: 'callCenter' },
  { label: 'Messages', path: '/messages', icon: Headset, module: 'customerService' },
  {
    label: 'Products',
    path: '/products',
    icon: Package,
    module: 'products',
    children: [{ label: 'Collections', path: '/products/collections' }],
  },
  {
    label: 'Inventory',
    path: '/inventory',
    icon: Boxes,
    module: 'inventory',
    badge: 'New',
    children: [{ label: 'Manage Warehouses', path: '/inventory/warehouses' }],
  },
  {
    label: 'Pre-Orders',
    path: '/pre-orders',
    icon: CalendarClock,
    module: 'preOrders',
    businessTypes: ['I import my products', 'I buy from local wholesalers'],
  },
  { label: 'Returns', path: '/returns', icon: Undo2, module: 'inventory' },
  { label: 'Suppliers', path: '/suppliers', icon: Handshake, module: 'supplyChain' },
  { label: 'Delivery Partners', path: '/delivery-partners', icon: Truck, module: 'supplyChain' },
  { label: 'Customers', path: '/customers', icon: Users, module: 'customers' },
  { label: 'Ad Performance', path: '/ad-performance', icon: Megaphone, module: 'adPerformance' },
  { label: 'Accounting & Finance', path: '/accounting', icon: Landmark, module: 'accounting' },
  {
    label: 'Analytics',
    path: '/analytics',
    icon: BarChart3,
    module: 'analytics',
    children: [{ label: 'Report', path: '/analytics/report' }],
  },
];

export const NAV_FOOTER_ITEMS: NavItem[] = [
  { label: 'Team', path: '/team', icon: ShieldCheck, module: 'team' },
  { label: 'Integrations', path: '/integrations', icon: Puzzle, module: 'integrations' },
  {
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    module: 'settings',
    children: [{ label: 'Apps', path: '/settings/apps' }],
  },
];
