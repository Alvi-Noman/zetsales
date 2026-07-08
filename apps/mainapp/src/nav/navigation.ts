import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Users,
  Megaphone,
  Headset,
  Handshake,
  Landmark,
  Briefcase,
  UsersRound,
  BarChart3,
  Tag,
  FileText,
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
  {
    label: 'Products',
    path: '/products',
    icon: Package,
    module: 'products',
    children: [
      { label: 'All products', path: '/products' },
      { label: 'Collections', path: '/products/collections' },
      { label: 'Inventory', path: '/products/inventory' },
    ],
  },
  { label: 'Inventory', path: '/inventory', icon: Boxes, module: 'inventory', badge: 'New' },
  { label: 'Customers', path: '/customers', icon: Users, module: 'customers' },
  { label: 'Ad Performance', path: '/ad-performance', icon: Megaphone, module: 'adPerformance' },
  { label: 'Customer Service', path: '/customer-service', icon: Headset, module: 'customerService' },
  { label: 'Suppliers', path: '/suppliers', icon: Handshake, module: 'supplyChain' },
  { label: 'Accounting & Finance', path: '/accounting', icon: Landmark, module: 'accounting' },
  { label: 'Professional Services', path: '/professional-services', icon: Briefcase, module: 'professionalServices' },
  { label: 'HR & People', path: '/hr', icon: UsersRound, module: 'hr' },
  { label: 'Analytics', path: '/analytics', icon: BarChart3, module: 'analytics' },
  { label: 'Discounts', path: '/discounts', icon: Tag, module: 'discounts' },
  { label: 'Content', path: '/content', icon: FileText, module: 'content' },
];

export const NAV_FOOTER_ITEMS: NavItem[] = [
  { label: 'Integrations', path: '/integrations', icon: Puzzle, module: 'integrations' },
  { label: 'Team', path: '/team', icon: ShieldCheck, module: 'team' },
  { label: 'Settings', path: '/settings', icon: Settings, module: 'settings' },
];
