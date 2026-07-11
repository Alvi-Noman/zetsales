import { getSession, type ExtensionSession } from './storage.js';

export class ApiError extends Error {}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const session = await getSession();
  if (!session) throw new ApiError('Log in to ZetSales from the extension options page first.');

  const res = await fetch(`${session.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) throw new ApiError(data?.message || `Request failed (${res.status})`);
  return data as T;
}

export async function login(
  email: string,
  password: string,
  apiBaseUrl: string
): Promise<Pick<ExtensionSession, 'token' | 'tenantId' | 'email'>> {
  const res = await fetch(`${apiBaseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, longLived: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) throw new ApiError(data?.message || 'Login failed');
  return { token: data.token as string, tenantId: data.user.tenantId as string, email: data.user.email as string };
}
