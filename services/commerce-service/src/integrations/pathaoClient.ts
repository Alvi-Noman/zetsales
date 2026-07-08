import logger from '../utils/logger.js';

const SANDBOX_BASE = 'https://courier-api-sandbox.pathao.com';
const LIVE_BASE = 'https://api-hermes.pathao.com';

function baseUrl(): string {
  return process.env.PATHAO_SANDBOX === 'false' ? LIVE_BASE : SANDBOX_BASE;
}

export interface PathaoCredentials {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  storeId: string;
}

// Pathao uses OAuth2 password-grant rather than a static API key — tokens are cached in memory per
// credential set (keyed by clientId+username, since different tenants each connect their own
// Pathao merchant account) and re-issued a minute before they actually expire.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken(creds: PathaoCredentials): Promise<string> {
  const cacheKey = `${creds.clientId}:${creds.username}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetch(`${baseUrl()}/aladdin/api/v1/issue-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      username: creds.username,
      password: creds.password,
      grant_type: 'password',
    }),
  });
  const body: any = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) {
    logger.warn(`[pathao] issue-token failed (status ${res.status}): ${JSON.stringify(body)}`);
    throw new Error(body?.message || 'Pathao authentication failed. Check the Client ID, Client Secret, username and password.');
  }
  const token = { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in ?? 3600) - 60) * 1000 };
  tokenCache.set(cacheKey, token);
  return token.token;
}

// Confirms the credentials work and that the given Store ID actually belongs to this merchant
// account, before we save any of it — a mistyped Store ID would otherwise only surface much later,
// as every consignment created against it silently failing.
export async function verifyPathaoCredentials(creds: PathaoCredentials): Promise<{ storeName: string }> {
  const token = await getAccessToken(creds);
  const res = await fetch(`${baseUrl()}/aladdin/api/v1/stores`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body: any = await res.json().catch(() => null);
  const stores: any[] = body?.data?.data ?? [];
  const match = stores.find((s) => String(s.store_id) === String(creds.storeId));
  if (!res.ok || !match) {
    logger.warn(`[pathao] store verification failed for store_id ${creds.storeId} (status ${res.status})`);
    throw new Error('Could not find this Store ID under your Pathao merchant account.');
  }
  return { storeName: match.store_name || 'Pathao store' };
}

interface CreateOrderInput {
  invoice: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  codAmount: number;
}

interface CreateOrderResult {
  consignmentId: string;
}

// Hands a Shipped order to Pathao for delivery, using the credentials the merchant connected under
// Integrations → Courier Integration (see couriersController.ts). Field names (delivery_type,
// item_type, weight) follow Pathao's published API docs, not a verified live payload — recommended
// defaults for a generic COD parcel, worth revisiting once live.
export async function createPathaoOrder(creds: PathaoCredentials, input: CreateOrderInput): Promise<CreateOrderResult> {
  const token = await getAccessToken(creds);
  const res = await fetch(`${baseUrl()}/aladdin/api/v1/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      store_id: Number(creds.storeId),
      merchant_order_id: input.invoice,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      recipient_address: input.recipientAddress,
      amount_to_collect: input.codAmount,
      item_quantity: 1,
      item_weight: 0.5,
      delivery_type: 48,
      item_type: 2,
    }),
  });
  const body: any = await res.json().catch(() => null);
  if (!res.ok || !body?.data?.consignment_id) {
    logger.warn(`[pathao] createOrder failed (status ${res.status}): ${JSON.stringify(body)}`);
    throw new Error(body?.message || 'Pathao rejected the order request');
  }
  return { consignmentId: String(body.data.consignment_id) };
}
