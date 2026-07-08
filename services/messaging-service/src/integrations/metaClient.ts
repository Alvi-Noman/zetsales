import axios from 'axios';
import crypto from 'crypto';

// Bump when Meta deprecates this version — check developers.facebook.com/docs/graph-api/changelog.
export const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Advanced Access permissions — only usable against Pages the app's own Admins/Developers/Testers
// manage until Meta's App Review approves them for general use (see plan doc).
export const FACEBOOK_OAUTH_SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  // Needed to read a Page's instagram_business_account field — without it, linked Instagram
  // account discovery 400s even though the Page itself connects fine.
  'pages_read_engagement',
  'instagram_basic',
  'instagram_manage_messages',
  'business_management',
];

export function buildFacebookOAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: FACEBOOK_OAUTH_SCOPES.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;
}

export async function exchangeCodeForUserToken(appId: string, appSecret: string, redirectUri: string, code: string) {
  const res = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
    params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
    timeout: 10_000,
  });
  return res.data.access_token as string;
}

// Short-lived user tokens (~1-2h) are exchanged for a long-lived one (~60 days) right away — Page
// tokens minted from a long-lived user token inherit that longer lifetime.
export async function exchangeForLongLivedUserToken(appId: string, appSecret: string, shortLivedToken: string) {
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

export interface ManagedPage {
  id: string;
  name: string;
  accessToken: string;
  picture: string | null;
}

export async function fetchManagedPages(userAccessToken: string): Promise<ManagedPage[]> {
  const res = await axios.get(`${GRAPH_BASE}/me/accounts`, {
    params: { fields: 'id,name,access_token,picture', access_token: userAccessToken },
    timeout: 10_000,
  });
  const data = res.data.data as Array<{ id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }>;
  return data.map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token, picture: p.picture?.data?.url ?? null }));
}

export interface LinkedInstagramAccount {
  id: string;
  username: string;
  profilePicture: string | null;
}

export async function fetchLinkedInstagramAccount(pageId: string, pageAccessToken: string): Promise<LinkedInstagramAccount | null> {
  const res = await axios.get(`${GRAPH_BASE}/${pageId}`, {
    params: { fields: 'instagram_business_account{id,username,profile_picture_url}', access_token: pageAccessToken },
    timeout: 10_000,
  });
  const ig = res.data.instagram_business_account as { id: string; username: string; profile_picture_url?: string } | undefined;
  if (!ig) return null;
  return { id: ig.id, username: ig.username, profilePicture: ig.profile_picture_url ?? null };
}

// Makes Meta actually call our webhook for this Page's Messenger events — creating the route
// alone does nothing, same idea as Shopify's registerShopifyWebhook.
export async function subscribePageWebhook(pageId: string, pageAccessToken: string) {
  await axios.post(
    `${GRAPH_BASE}/${pageId}/subscribed_apps`,
    null,
    { params: { subscribed_fields: 'messages,messaging_postbacks,message_reads', access_token: pageAccessToken }, timeout: 10_000 }
  );
}

export async function unsubscribePageWebhook(pageId: string, pageAccessToken: string) {
  await axios.delete(`${GRAPH_BASE}/${pageId}/subscribed_apps`, {
    params: { access_token: pageAccessToken },
    timeout: 10_000,
  });
}

export type OutboundMessagePayload = { text: string } | { imageUrl: string };

// Send API — same endpoint shape for a Messenger PSID and a page-linked Instagram IGSID; which
// platform the recipient belongs to is implied by which account's access token is used. A
// message object holds either text or a single attachment, never both, so callers send two
// separate messages if they want to deliver both.
export async function sendMessage(accountExternalId: string, accessToken: string, recipientId: string, payload: OutboundMessagePayload) {
  const message =
    'imageUrl' in payload
      ? { attachment: { type: 'image', payload: { url: payload.imageUrl, is_reusable: true } } }
      : { text: payload.text };

  const res = await axios.post(
    `${GRAPH_BASE}/${accountExternalId}/messages`,
    { recipient: { id: recipientId }, message },
    { params: { access_token: accessToken }, timeout: 10_000 }
  );
  return res.data.message_id as string;
}

// Best-effort profile lookup so the inbox can show a name/avatar instead of a raw PSID/IGSID.
// Meta has progressively restricted what profile data is returned here for privacy reasons, so a
// failure (or an empty response) is expected sometimes and must never block message ingestion.
export async function fetchParticipantProfile(
  participantId: string,
  accessToken: string
): Promise<{ name: string | null; avatar: string | null }> {
  try {
    const res = await axios.get(`${GRAPH_BASE}/${participantId}`, {
      params: { fields: 'name,profile_pic', access_token: accessToken },
      timeout: 8_000,
    });
    return { name: res.data.name ?? null, avatar: res.data.profile_pic ?? null };
  } catch {
    return { name: null, avatar: null };
  }
}

export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const provided = signatureHeader.slice('sha256='.length);
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
}
