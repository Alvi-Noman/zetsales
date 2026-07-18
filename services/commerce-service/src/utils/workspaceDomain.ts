// Mirrors auth-service/src/utils/workspaceDomain.ts's slug-from-host logic (kept as a separate
// copy, not a shared import, since each service is deployed independently) — used only by the
// public HRM punch page, which is the first commerce-service route that must resolve a tenant
// from the request's hostname instead of a JWT.
const RESERVED_SUBDOMAINS = new Set(['admin', 'api', 'app', 'assets', 'help', 'mail', 'root', 'support', 'www', 'zetsales']);

export function isReservedSubdomain(slug: string): boolean {
  return RESERVED_SUBDOMAINS.has(slug);
}

function workspaceRootHost(): string {
  const configured = process.env.WORKSPACE_ROOT_DOMAIN?.trim();
  if (configured) return configured.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();

  try {
    const host = new URL(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'https://zetsales.com').hostname
      .replace(/^www\./, '')
      .toLowerCase();
    return host.startsWith('app.') ? host.slice(4) : host;
  } catch {
    return 'zetsales.com';
  }
}

export function workspaceSlugFromHost(hostHeader: string | string[] | undefined): string | null {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!raw) return null;
  const hostname = raw.split(',')[0]!.trim().split(':')[0]!.toLowerCase();
  const rootHost = workspaceRootHost();
  if (!hostname.endsWith(`.${rootHost}`)) return null;
  const slug = hostname.slice(0, -(rootHost.length + 1));
  return slug && !slug.includes('.') && !isReservedSubdomain(slug) ? slug : null;
}
