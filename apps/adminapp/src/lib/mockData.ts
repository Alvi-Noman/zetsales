// Platform-level (cross-tenant) data for the super-admin console. There is no backend endpoint
// yet that aggregates across every tenant's commerce-service data, so this is deterministic mock
// data shaped like what that aggregation would eventually return — swap for a real /admin/*
// API once one exists.

export type TenantPlan = 'Starter' | 'Growth' | 'Scale' | 'Enterprise';
export type TenantStatus = 'active' | 'trialing' | 'past_due' | 'suspended' | 'churned';

export interface Tenant {
  id: string;
  name: string;
  domain: string;
  plan: TenantPlan;
  status: TenantStatus;
  mrr: number;
  gmv30d: number;
  orders30d: number;
  users: number;
  country: string;
  installedPlugins: string[];
  createdAt: string;
  lastActiveAt: string;
  healthScore: number; // 0-100
}

const PLUGIN_POOL = ['call-center', 'hrm', 'delivery-partners', 'ad-performance', 'zetsales-ads', 'accounting'];
const COUNTRIES = ['Bangladesh', 'Pakistan', 'India', 'UAE', 'Malaysia', 'Nigeria', 'Indonesia', 'Sri Lanka'];
const NAME_PARTS = [
  'Aarong', 'Kiaan', 'Lumina', 'Bazaar', 'Threadline', 'Velvet', 'Metro', 'Orchid', 'Nimbus', 'Coral',
  'Zenith', 'Havelock', 'Cascade', 'Solace', 'Pinehill', 'Marigold', 'Ember', 'Vantage', 'Northstar', 'Willow',
  'Bloom', 'Anchor', 'Drift', 'Crescent', 'Harbor', 'Ivory', 'Juniper', 'Kestrel', 'Lattice', 'Meridian',
];
const SUFFIXES = ['Retail', 'Fashion', 'Mart', 'Store', 'Collective', 'Traders', 'Living', 'Essentials', 'Boutique', 'Goods'];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function buildTenants(): Tenant[] {
  const rand = seededRandom(42);
  const plans: TenantPlan[] = ['Starter', 'Growth', 'Scale', 'Enterprise'];
  const statuses: TenantStatus[] = ['active', 'active', 'active', 'trialing', 'past_due', 'active', 'churned', 'active'];
  const tenants: Tenant[] = [];

  for (let i = 0; i < 42; i++) {
    const name = `${NAME_PARTS[i % NAME_PARTS.length]} ${SUFFIXES[Math.floor(rand() * SUFFIXES.length)]}`;
    const plan = plans[Math.floor(rand() * plans.length)];
    const status = statuses[Math.floor(rand() * statuses.length)];
    const planMultiplier = plan === 'Enterprise' ? 8 : plan === 'Scale' ? 4 : plan === 'Growth' ? 2 : 1;
    const mrr = Math.round((49 + rand() * 150) * planMultiplier);
    const gmv30d = Math.round(mrr * (18 + rand() * 40));
    const createdDaysAgo = Math.floor(30 + rand() * 700);
    const createdAt = new Date(Date.now() - createdDaysAgo * 86400000).toISOString();
    const lastActiveAt = new Date(Date.now() - Math.floor(rand() * (status === 'churned' ? 90 : 3)) * 86400000).toISOString();
    const pluginCount = Math.floor(rand() * 4);
    const installedPlugins = [...PLUGIN_POOL].sort(() => rand() - 0.5).slice(0, pluginCount);

    tenants.push({
      id: `tn_${(i + 1).toString().padStart(4, '0')}`,
      name,
      domain: `${name.toLowerCase().replace(/\s+/g, '-')}.zetsales.app`,
      plan,
      status,
      mrr,
      gmv30d,
      orders30d: Math.round(gmv30d / (12 + rand() * 20)),
      users: Math.round(2 + rand() * 22),
      country: COUNTRIES[Math.floor(rand() * COUNTRIES.length)],
      installedPlugins,
      createdAt,
      lastActiveAt,
      healthScore:
        status === 'churned' ? Math.round(5 + rand() * 15) :
        status === 'past_due' ? Math.round(30 + rand() * 25) :
        status === 'trialing' ? Math.round(45 + rand() * 30) :
        Math.round(65 + rand() * 34),
    });
  }
  return tenants.sort((a, b) => b.mrr - a.mrr);
}

export const TENANTS: Tenant[] = buildTenants();

export const PLAN_PRICE: Record<TenantPlan, number> = {
  Starter: 0,
  Growth: 0,
  Scale: 0,
  Enterprise: 0,
};

export interface TopProduct {
  id: string;
  name: string;
  category: string;
  tenantName: string;
  unitsSold30d: number;
  revenue30d: number;
  trend: number; // % change vs prior 30d
}

export const TOP_PRODUCTS: TopProduct[] = [
  { id: 'p1', name: 'Classic Cotton Panjabi', category: 'Apparel', tenantName: 'Aarong Fashion', unitsSold30d: 3821, revenue30d: 4582000, trend: 12.4 },
  { id: 'p2', name: 'Wireless Earbuds Pro', category: 'Electronics', tenantName: 'Nimbus Traders', unitsSold30d: 2914, revenue30d: 8742000, trend: 34.1 },
  { id: 'p3', name: 'Everyday Tote Bag', category: 'Accessories', tenantName: 'Willow Boutique', unitsSold30d: 2650, revenue30d: 1855000, trend: -4.2 },
  { id: 'p4', name: 'Skincare Starter Kit', category: 'Beauty', tenantName: 'Orchid Essentials', unitsSold30d: 2311, revenue30d: 3235400, trend: 21.7 },
  { id: 'p5', name: 'Kids Rain Jacket', category: 'Apparel', tenantName: 'Meridian Living', unitsSold30d: 1988, revenue30d: 1590400, trend: 8.9 },
  { id: 'p6', name: 'Smart Fitness Band', category: 'Electronics', tenantName: 'Vantage Mart', unitsSold30d: 1874, revenue30d: 5622000, trend: 45.6 },
  { id: 'p7', name: 'Ceramic Dinner Set', category: 'Home', tenantName: 'Coral Living', unitsSold30d: 1652, revenue30d: 3799600, trend: -1.8 },
  { id: 'p8', name: 'Leather Wallet', category: 'Accessories', tenantName: 'Harbor Goods', unitsSold30d: 1590, revenue30d: 1272000, trend: 6.3 },
  { id: 'p9', name: 'Organic Face Serum', category: 'Beauty', tenantName: 'Marigold Essentials', unitsSold30d: 1488, revenue30d: 2604000, trend: 18.2 },
  { id: 'p10', name: 'Bluetooth Speaker Mini', category: 'Electronics', tenantName: 'Zenith Traders', unitsSold30d: 1402, revenue30d: 2103000, trend: -6.5 },
];

export interface RevenuePoint {
  month: string;
  gmv: number;
  mrr: number;
  newTenants: number;
  churnedTenants: number;
}

export const REVENUE_TREND: RevenuePoint[] = [
  { month: 'Feb', gmv: 82_400_000, mrr: 41_200, newTenants: 6, churnedTenants: 1 },
  { month: 'Mar', gmv: 88_900_000, mrr: 44_800, newTenants: 8, churnedTenants: 2 },
  { month: 'Apr', gmv: 91_200_000, mrr: 47_650, newTenants: 5, churnedTenants: 1 },
  { month: 'May', gmv: 97_800_000, mrr: 52_300, newTenants: 9, churnedTenants: 3 },
  { month: 'Jun', gmv: 104_500_000, mrr: 57_900, newTenants: 11, churnedTenants: 2 },
  { month: 'Jul', gmv: 112_300_000, mrr: 63_400, newTenants: 7, churnedTenants: 1 },
];

export interface SupportTicket {
  id: string;
  subject: string;
  tenantName: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'pending' | 'resolved';
  createdAt: string;
  assignee: string;
}

export const SUPPORT_TICKETS: SupportTicket[] = [
  { id: 'tk_2381', subject: 'Courier webhook not updating order status', tenantName: 'Nimbus Traders', priority: 'urgent', status: 'open', createdAt: '2026-07-19T08:12:00Z', assignee: 'Rafi H.' },
  { id: 'tk_2380', subject: 'Requesting Enterprise plan upgrade', tenantName: 'Aarong Fashion', priority: 'medium', status: 'pending', createdAt: '2026-07-19T05:44:00Z', assignee: 'Unassigned' },
  { id: 'tk_2379', subject: 'CSV export missing SKU column', tenantName: 'Willow Boutique', priority: 'low', status: 'open', createdAt: '2026-07-18T14:02:00Z', assignee: 'Tania A.' },
  { id: 'tk_2378', subject: 'Payment gateway 3DS failing intermittently', tenantName: 'Vantage Mart', priority: 'high', status: 'open', createdAt: '2026-07-18T11:20:00Z', assignee: 'Rafi H.' },
  { id: 'tk_2377', subject: 'HRM payroll rounding discrepancy', tenantName: 'Meridian Living', priority: 'medium', status: 'resolved', createdAt: '2026-07-17T09:15:00Z', assignee: 'Tania A.' },
  { id: 'tk_2376', subject: 'Custom domain SSL not provisioning', tenantName: 'Coral Living', priority: 'high', status: 'pending', createdAt: '2026-07-16T16:50:00Z', assignee: 'Sami K.' },
];

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  category: 'billing' | 'security' | 'tenant' | 'system';
}

export const AUDIT_LOG: AuditLogEntry[] = [
  { id: 'al_9012', actor: 'Admin', action: 'Suspended tenant', target: 'Drift Mart', timestamp: '2026-07-20T02:14:00Z', category: 'tenant' },
  { id: 'al_9011', actor: 'System', action: 'Auto-retried failed payment', target: 'Cascade Store', timestamp: '2026-07-19T22:03:00Z', category: 'billing' },
  { id: 'al_9010', actor: 'Admin', action: 'Rotated API key', target: 'Nimbus Traders', timestamp: '2026-07-19T18:47:00Z', category: 'security' },
  { id: 'al_9009', actor: 'System', action: 'Deployed commerce-service', target: 'v2.34.0', timestamp: '2026-07-19T15:00:00Z', category: 'system' },
  { id: 'al_9008', actor: 'Admin', action: 'Upgraded plan to Scale', target: 'Vantage Mart', timestamp: '2026-07-19T10:22:00Z', category: 'billing' },
  { id: 'al_9007', actor: 'System', action: 'Flagged unusual login pattern', target: 'Ember Traders', timestamp: '2026-07-18T21:11:00Z', category: 'security' },
  { id: 'al_9006', actor: 'Admin', action: 'Approved new tenant signup', target: 'Kestrel Goods', timestamp: '2026-07-18T13:30:00Z', category: 'tenant' },
];

export interface ServiceHealth {
  name: string;
  status: 'operational' | 'degraded' | 'outage';
  uptime30d: number;
  p95LatencyMs: number;
  region: string;
}

export const SERVICE_HEALTH: ServiceHealth[] = [
  { name: 'auth-service', status: 'operational', uptime30d: 99.98, p95LatencyMs: 118, region: 'ap-south-1' },
  { name: 'commerce-service', status: 'operational', uptime30d: 99.95, p95LatencyMs: 210, region: 'ap-south-1' },
  { name: 'mainapp (CDN)', status: 'operational', uptime30d: 100, p95LatencyMs: 64, region: 'global' },
  { name: 'webhook-relay', status: 'degraded', uptime30d: 98.71, p95LatencyMs: 940, region: 'ap-south-1' },
  { name: 'reports-worker', status: 'operational', uptime30d: 99.89, p95LatencyMs: 340, region: 'ap-south-1' },
];

export const PLUGIN_ADOPTION: { module: string; installs: number }[] = [
  { module: 'HRM', installs: TENANTS.filter((t) => t.installedPlugins.includes('hrm')).length },
  { module: 'Call Center', installs: TENANTS.filter((t) => t.installedPlugins.includes('call-center')).length },
  { module: 'Delivery Partners', installs: TENANTS.filter((t) => t.installedPlugins.includes('delivery-partners')).length },
  { module: 'Ad Performance', installs: TENANTS.filter((t) => t.installedPlugins.includes('ad-performance')).length },
  { module: 'ZetSales Ads', installs: TENANTS.filter((t) => t.installedPlugins.includes('zetsales-ads')).length },
  { module: 'Accounting', installs: TENANTS.filter((t) => t.installedPlugins.includes('accounting')).length },
].sort((a, b) => b.installs - a.installs);

export const PLAN_DISTRIBUTION: { plan: TenantPlan; count: number }[] = (['Starter', 'Growth', 'Scale', 'Enterprise'] as TenantPlan[]).map((plan) => ({
  plan,
  count: TENANTS.filter((t) => t.plan === plan).length,
}));

export function formatCurrency(n: number): string {
  if (n >= 1_000_000) return `৳${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `৳${(n / 1_000).toFixed(1)}K`;
  return `৳${n}`;
}

export function formatUsd(n: number): string {
  if (n >= 1_000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n}`;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
