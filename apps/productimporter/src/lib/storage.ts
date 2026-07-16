export interface ExtensionSession {
  token: string;
  tenantId: string;
  email: string;
  apiBaseUrl: string;
  appBaseUrl: string;
}

const STORAGE_KEY = 'zetsalesSession';

export const DEFAULT_API_BASE_URL = 'https://app.zetsales.com/api/v1';
export const DEFAULT_APP_BASE_URL = 'https://app.zetsales.com';

export async function getSession(): Promise<ExtensionSession | null> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as ExtensionSession | undefined) ?? null;
}

export async function setSession(session: ExtensionSession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: session });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEY);
}
