import axios from 'axios';

// Ported from commerce-service's integrations/googleAdsClient.ts — OAuth pieces only. The
// Performance Max campaign-creation helpers stay in commerce-service (adCampaignsController.ts
// still owns campaign launch, reading the same `adAccounts` collection this service writes to).
const GOOGLE_ADS_API_VERSION = 'v20';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

export function buildGoogleAdsOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_ADS_SCOPE,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function refreshGoogleAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' },
    { timeout: 10_000 }
  );
  return { accessToken: res.data.access_token as string, expiresInSeconds: Number(res.data.expires_in) || undefined };
}

export async function exchangeGoogleCode(clientId: string, clientSecret: string, redirectUri: string, code: string) {
  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    { timeout: 10_000 }
  );
  return { accessToken: res.data.access_token as string, refreshToken: res.data.refresh_token as string | undefined, expiresInSeconds: Number(res.data.expires_in) || undefined };
}

export async function listAccessibleCustomers(accessToken: string, developerToken: string): Promise<string[]> {
  const res = await axios.get(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken },
    timeout: 10_000,
  });
  return (res.data.resourceNames as string[]) ?? [];
}

export async function fetchCustomerDescriptiveName(accessToken: string, developerToken: string, customerId: string): Promise<string | null> {
  try {
    const res = await axios.post(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      { query: 'SELECT customer.descriptive_name FROM customer LIMIT 1' },
      { headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken }, timeout: 10_000 }
    );
    return res.data.results?.[0]?.customer?.descriptiveName ?? null;
  } catch {
    return null;
  }
}
