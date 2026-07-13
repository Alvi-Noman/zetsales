import axios from 'axios';

// Ported from commerce-service's integrations/metaAdsClient.ts — same Graph API version and
// scopes, verbatim.
const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export const META_ADS_SCOPES = ['ads_read', 'business_management'];

export function buildMetaAdsOAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: META_ADS_SCOPES.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeMetaAdsCode(appId: string, appSecret: string, redirectUri: string, code: string) {
  const res = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
    timeout: 10_000,
  });
  return res.data.access_token as string;
}

export async function exchangeForLongLivedToken(appId: string, appSecret: string, shortLivedToken: string) {
  const res = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    },
    timeout: 10_000,
  });
  return { accessToken: res.data.access_token as string, expiresInSeconds: Number(res.data.expires_in) || undefined };
}

export interface MetaAdAccount {
  id: string;
  name: string;
}

export async function fetchAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
  const res = await axios.get(`${GRAPH_BASE}/me/adaccounts`, {
    params: { fields: 'name,account_id', access_token: accessToken },
    timeout: 10_000,
  });
  const data = res.data.data as Array<{ id: string; name: string }>;
  return data.map((a) => ({ id: a.id, name: a.name }));
}
