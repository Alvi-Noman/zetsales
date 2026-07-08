import axios from 'axios';
import fs from 'fs';

const GOOGLE_ADS_API_VERSION = 'v20';
const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';
const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

export function buildGoogleAdsOAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_ADS_SCOPE,
    state,
    // offline + consent are both required to reliably get a refresh_token back — without them,
    // a user who has already granted this app access before gets no refresh_token on repeat
    // consent, which is exactly the value this connection needs to keep working unattended.
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(clientId: string, clientSecret: string, redirectUri: string, code: string) {
  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    { client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    { timeout: 10_000 }
  );
  return { accessToken: res.data.access_token as string, refreshToken: res.data.refresh_token as string | undefined, expiresInSeconds: Number(res.data.expires_in) || undefined };
}

// Access tokens are short-lived (~1h) and never stored — every real API call re-derives a fresh
// one from the encrypted refresh token first, same pattern as getValidShopifyAccessToken uses for
// Shopify's client-credentials auth method.
export async function refreshGoogleAccessToken(clientId: string, clientSecret: string, refreshToken: string) {
  const res = await axios.post(
    'https://oauth2.googleapis.com/token',
    { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' },
    { timeout: 10_000 }
  );
  return { accessToken: res.data.access_token as string, expiresInSeconds: Number(res.data.expires_in) || undefined };
}

// Returns "customers/<id>" resource names for every account the token can reach — no manager/
// client ID is passed in the request itself, per Google's docs.
export async function listAccessibleCustomers(accessToken: string, developerToken: string): Promise<string[]> {
  const res = await axios.get(`https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken },
    timeout: 10_000,
  });
  return (res.data.resourceNames as string[]) ?? [];
}

// Best-effort friendly name per customer via a single-row GAQL search — falls back to the bare
// customer ID on failure (e.g. a manager-account token needing login-customer-id), same defensive
// shape as tiktokAdsClient's fetchAdvertiserNames. Never allowed to block the connection itself.
export async function fetchCustomerDescriptiveName(accessToken: string, developerToken: string, customerId: string): Promise<string | null> {
  try {
    const res = await axios.post(
      `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:search`,
      { query: 'SELECT customer.descriptive_name FROM customer LIMIT 1' },
      { headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken }, timeout: 10_000 }
    );
    return res.data.results?.[0]?.customer?.descriptiveName ?? null;
  } catch {
    return null;
  }
}

// --- Performance Max campaign creation ---

// Performance Max can't optimize toward a goal that doesn't exist — this is the pre-flight check
// createCampaign runs before attempting creation, so a missing conversion action fails fast with a
// clear message instead of creating a directionless campaign that never optimizes.
export async function findPurchaseConversionAction(accessToken: string, developerToken: string, customerId: string): Promise<string | null> {
  const res = await axios.post(
    `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:search`,
    { query: "SELECT conversion_action.resource_name FROM conversion_action WHERE conversion_action.category = 'PURCHASE' AND conversion_action.status = 'ENABLED' LIMIT 1" },
    { headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken }, timeout: 10_000 }
  );
  return res.data.results?.[0]?.conversionAction?.resourceName ?? null;
}

export interface PerformanceMaxCampaignInput {
  campaignName: string;
  destinationUrl: string;
  dailyBudgetAmount: number; // account currency, standard units (e.g. 15.50), not micros
  goal: 'maximize_conversions' | 'maximize_value';
  headlines: string[]; // min 3, max 15 chars-checked by Google, not here
  longHeadline: string;
  descriptions: string[]; // min 2
  businessName: string;
  marketingImagePath: string; // local file path — landscape (>=1.91:1)
  squareImagePath: string; // local file path — 1:1
  logoPath: string; // local file path — 1:1
}

function toMicros(amount: number): number {
  return Math.round(amount * 1_000_000);
}

function readAssetBase64(localPath: string): string {
  return fs.readFileSync(localPath).toString('base64');
}

// Everything below is submitted as ONE atomic mutate — Google either creates the whole campaign
// (budget, campaign, asset group, every asset, every link) or none of it, using negative temporary
// IDs to cross-reference resources that don't have a real resource name yet within the same
// request. See googleads.googleapis.com/{version}/customers/{id}/googleAds:mutate.
//
// Deliberate simplifications for this first cut (all real API behavior, not corners cut on
// correctness): daily budget only (no lifetime/total-budget campaigns yet); no video assets —
// Performance Max only accepts YouTube-hosted videos, not raw uploaded files, so video upload is
// out of scope until a YouTube integration exists; no explicit location/language CampaignCriterion
// — rather than guess a geo-target resource name and risk silently mistargeting real spend, this
// leaves Google's account-level default in place (addable later as a real, looked-up value).
export async function createPerformanceMaxCampaign(
  accessToken: string,
  developerToken: string,
  customerId: string,
  input: PerformanceMaxCampaignInput
): Promise<{ campaignResourceName: string; assetGroupResourceName: string }> {
  const headers = { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken, 'Content-Type': 'application/json' };

  const budgetTempId = '-1';
  const campaignTempId = '-2';
  const assetGroupTempId = '-3';
  let nextAssetId = -4;
  const takeAssetId = () => String(nextAssetId--);

  const biddingStrategy = input.goal === 'maximize_value' ? { maximizeConversionValue: {} } : { maximizeConversions: {} };

  const mutateOperations: Record<string, unknown>[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: `customers/${customerId}/campaignBudgets/${budgetTempId}`,
          amountMicros: toMicros(input.dailyBudgetAmount),
          deliveryMethod: 'STANDARD',
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: `customers/${customerId}/campaigns/${campaignTempId}`,
          name: input.campaignName,
          status: 'PAUSED',
          advertisingChannelType: 'PERFORMANCE_MAX',
          campaignBudget: `customers/${customerId}/campaignBudgets/${budgetTempId}`,
          ...biddingStrategy,
        },
      },
    },
    {
      assetGroupOperation: {
        create: {
          resourceName: `customers/${customerId}/assetGroups/${assetGroupTempId}`,
          campaign: `customers/${customerId}/campaigns/${campaignTempId}`,
          name: `${input.campaignName} — Asset Group`,
          finalUrls: [input.destinationUrl],
          status: 'PAUSED',
        },
      },
    },
  ];

  const linkAsset = (tempId: string, fieldType: string) => ({
    assetGroupAssetOperation: {
      create: {
        assetGroup: `customers/${customerId}/assetGroups/${assetGroupTempId}`,
        asset: `customers/${customerId}/assets/${tempId}`,
        fieldType,
      },
    },
  });

  for (const headline of input.headlines) {
    const id = takeAssetId();
    mutateOperations.push({ assetOperation: { create: { resourceName: `customers/${customerId}/assets/${id}`, textAsset: { text: headline } } } });
    mutateOperations.push(linkAsset(id, 'HEADLINE'));
  }
  {
    const id = takeAssetId();
    mutateOperations.push({ assetOperation: { create: { resourceName: `customers/${customerId}/assets/${id}`, textAsset: { text: input.longHeadline } } } });
    mutateOperations.push(linkAsset(id, 'LONG_HEADLINE'));
  }
  for (const description of input.descriptions) {
    const id = takeAssetId();
    mutateOperations.push({ assetOperation: { create: { resourceName: `customers/${customerId}/assets/${id}`, textAsset: { text: description } } } });
    mutateOperations.push(linkAsset(id, 'DESCRIPTION'));
  }
  {
    const id = takeAssetId();
    mutateOperations.push({ assetOperation: { create: { resourceName: `customers/${customerId}/assets/${id}`, textAsset: { text: input.businessName } } } });
    mutateOperations.push(linkAsset(id, 'BUSINESS_NAME'));
  }

  const imageAsset = (localPath: string, fieldType: string) => {
    const id = takeAssetId();
    mutateOperations.push({ assetOperation: { create: { resourceName: `customers/${customerId}/assets/${id}`, imageAsset: { data: readAssetBase64(localPath) } } } });
    mutateOperations.push(linkAsset(id, fieldType));
  };
  imageAsset(input.marketingImagePath, 'MARKETING_IMAGE');
  imageAsset(input.squareImagePath, 'SQUARE_MARKETING_IMAGE');
  imageAsset(input.logoPath, 'LOGO');

  const res = await axios.post(`${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:mutate`, { mutateOperations }, { headers, timeout: 30_000 });
  const results = res.data.mutateOperationResponses as Array<Record<string, { resourceName: string }>>;
  const campaignResourceName = results.find((r) => r.campaignResult)?.campaignResult.resourceName;
  const assetGroupResourceName = results.find((r) => r.assetGroupResult)?.assetGroupResult.resourceName;
  if (!campaignResourceName || !assetGroupResourceName) {
    throw new Error('Google Ads did not return the created campaign/asset group resource names.');
  }
  return { campaignResourceName, assetGroupResourceName };
}

export async function setCampaignStatus(accessToken: string, developerToken: string, customerId: string, campaignResourceName: string, status: 'ENABLED' | 'PAUSED') {
  await axios.post(
    `${GOOGLE_ADS_BASE}/customers/${customerId}/googleAds:mutate`,
    { mutateOperations: [{ campaignOperation: { update: { resourceName: campaignResourceName, status }, updateMask: 'status' } }] },
    { headers: { Authorization: `Bearer ${accessToken}`, 'developer-token': developerToken }, timeout: 10_000 }
  );
}
