import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
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
import type { ModuleKey } from '@zetsales/shared';

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
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/home', icon: LayoutDashboard, module: 'home' },
  {
    label: 'Orders',
    path: '/orders',
    icon: ShoppingCart,
    module: 'orders',
    children: [
      { label: 'All orders', path: '/orders' },
      { label: 'Drafts', path: '/orders/drafts' },
      { label: 'Abandoned checkouts', path: '/orders/abandoned' },
    ],
  },
  { label: 'Call Center', path: '/call-center', icon: PhoneCall, module: 'callCenter' },
  { label: 'Messages', path: '/messages', icon: Headset, module: 'customerService' },
  {
    label: 'Products',
    path: '/products',
    icon: Package,
    module: 'products',
    children: [
      { label: 'All products', path: '/products' },
      { label: 'Collections', path: '/products/collections' },
    ],
  },
  { label: 'Inventory', path: '/inventory', icon: Boxes, module: 'inventory', badge: 'New' },
  { label: 'Suppliers', path: '/suppliers', icon: Handshake, module: 'supplyChain' },
  { label: 'Customers', path: '/customers', icon: Users, module: 'customers' },
  { label: 'Ad Performance', path: '/ad-performance', icon: Megaphone, module: 'adPerformance' },
  { label: 'Accounting & Finance', path: '/accounting', icon: Landmark, module: 'accounting' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, module: 'analytics' },
];

export const NAV_FOOTER_ITEMS: NavItem[] = [
  { label: 'Team', path: '/team', icon: ShieldCheck, module: 'team' },
  { label: 'Integrations', path: '/integrations', icon: Puzzle, module: 'integrations' },
  { label: 'Settings', path: '/settings', icon: Settings, module: 'settings' },
];
