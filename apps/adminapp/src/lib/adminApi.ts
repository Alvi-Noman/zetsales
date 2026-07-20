// Talks to auth-service's /api/v1/admin/* routes (via the api-gateway proxy — see vite.config.ts
// dev proxy / nginx.conf prod proxy). Only fields that actually exist on a business/user document
// are returned here — there is no billing/plan/MRR/GMV data model in the backend yet, so unlike
// mockData.ts (still used for the Dashboard/Billing/Products/Support demo sections) this never
// fabricates numbers.
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_API_TOKEN as string | undefined;

export interface TenantSummary {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  businessType: string | null;
  country: string | null;
  currency: string | null;
  installedPlugins: string[];
  teamSize: number;
  monthlyOrdersEstimate: string | null;
  createdAt: string | null;
}

export interface TenantMember {
  id: string;
  email: string;
  role: string | null;
  createdAt: string | null;
}

export interface TenantDetail extends TenantSummary {
  phone: string | null;
  members: TenantMember[];
}

async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/v1/admin${path}`, {
    headers: { 'x-admin-token': ADMIN_TOKEN ?? '' },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as { message?: string });
    throw new Error(body.message || `Request failed with HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export async function fetchTenants(): Promise<TenantSummary[]> {
  const data = await adminFetch<{ tenants: TenantSummary[] }>('/tenants');
  return data.tenants;
}

export async function fetchTenant(id: string): Promise<TenantDetail> {
  const data = await adminFetch<{ tenant: TenantDetail }>(`/tenants/${id}`);
  return data.tenant;
}
