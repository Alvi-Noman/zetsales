import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  Megaphone,
  Headset,
  Warehouse,
  Landmark,
  Briefcase,
  UsersRound,
  BarChart3,
  Tag,
  FileText,
  Puzzle,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export interface NavChild {
  label: string;
  path: string;
}

export interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  badge?: string;
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Home', path: '/home', icon: LayoutDashboard },
  {
    label: 'Orders',
    path: '/orders',
    icon: ShoppingCart,
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
    children: [
      { label: 'All products', path: '/products' },
      { label: 'Collections', path: '/products/collections' },
      { label: 'Inventory', path: '/products/inventory' },
    ],
  },
  { label: 'Customers', path: '/customers', icon: Users },
  { label: 'Sales & CRM', path: '/sales-crm', icon: Megaphone },
  { label: 'Customer Service', path: '/customer-service', icon: Headset },
  { label: 'Supply Chain & Warehouse', path: '/supply-chain', icon: Warehouse },
  { label: 'Accounting & Finance', path: '/accounting', icon: Landmark },
  { label: 'Professional Services', path: '/professional-services', icon: Briefcase },
  { label: 'HR & People', path: '/hr', icon: UsersRound },
  { label: 'Analytics', path: '/analytics', icon: BarChart3 },
  { label: 'Discounts', path: '/discounts', icon: Tag },
  { label: 'Content', path: '/content', icon: FileText },
];

export const NAV_FOOTER_ITEMS: NavItem[] = [
  { label: 'Integrations', path: '/integrations', icon: Puzzle },
  { label: 'Settings', path: '/settings', icon: Settings },
];
