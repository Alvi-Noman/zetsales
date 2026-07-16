const RESERVED_SUBDOMAINS = new Set([
  'admin',
  'api',
  'app',
  'assets',
  'help',
  'mail',
  'root',
  'support',
  'www',
  'zetsales',
]);

export function slugifyBusinessName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return slug || 'business';
}

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

export function workspaceUrlForSlug(slug: string): string {
  const base = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
  try {
    const url = new URL(base);
    if (url.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return base;
    url.hostname = `${slug}.${workspaceRootHost()}`;
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return base;
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
