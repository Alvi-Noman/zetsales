import axios from 'axios';

const BUSINESS_API_BASE = 'https://business-api.tiktok.com/open_api/v1.3';

// TikTok's authorization dialog isn't a Graph-style /dialog/oauth — it's a dedicated portal page
// that lists the app's requested permissions for the advertiser to approve.
export function buildTikTokOAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({ app_id: appId, state, redirect_uri: redirectUri });
  return `https://business-api.tiktok.com/portal/auth?${params.toString()}`;
}

export interface TikTokTokenResult {
  accessToken: string;
  advertiserIds: string[];
  scope: number[];
}

// auth_code is single-use and expires in 1 hour. The resulting access_token does not expire on its
// own — it's only invalidated if the advertiser revokes the app's access.
export async function exchangeTikTokCode(appId: string, secret: string, authCode: string): Promise<TikTokTokenResult> {
  const res = await axios.post(
    `${BUSINESS_API_BASE}/oauth2/access_token/`,
    { app_id: appId, secret, auth_code: authCode },
    { timeout: 10_000 }
  );
  const data = res.data.data as { access_token: string; advertiser_ids: string[]; scope: number[] };
  return { accessToken: data.access_token, advertiserIds: data.advertiser_ids, scope: data.scope };
}

// Best-effort display-name lookup — never allowed to block the connection itself, so callers fall
// back to the raw advertiser ID on any failure (same defensive shape as messaging-service's
// metaClient.ts fetchParticipantProfile).
export async function fetchAdvertiserNames(accessToken: string, advertiserIds: string[]): Promise<Map<string, string>> {
  try {
    const res = await axios.get(`${BUSINESS_API_BASE}/advertiser/info/`, {
      params: { advertiser_ids: JSON.stringify(advertiserIds) },
      headers: { 'Access-Token': accessToken },
      timeout: 10_000,
    });
    const list = res.data.data?.list as Array<{ advertiser_id: string; name: string }> | undefined;
    return new Map((list ?? []).map((a) => [a.advertiser_id, a.name]));
  } catch {
    return new Map();
  }
}
