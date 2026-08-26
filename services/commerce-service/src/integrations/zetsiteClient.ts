// Talks to zetsite (a separate storefront-builder product the same operator owns) as a connected
// platform, mirroring the shopifyClient.ts/wooClient.ts convention: one file per platform, parallel
// function names, no shared interface. Much thinner than either of those — zetsite's own API
// already returns a rich, pre-shaped product/order document (see productService.ts on zetsite's
// side), so there's no cursor pagination to juggle, no image-attachment follow-up calls, and no
// weight-unit/variation-diffing complexity to replicate.
//
// Auth is a real OAuth authorization-code flow scoped to one static trusted partner rather than a
// full dynamic client registry (see zetsite's auth-service/src/controllers/integrationController.ts
// for the other side) — appropriate here since these are two products the same person owns, not a
// public app marketplace. ZETSITE_API_URL is zetsite's own public app URL (the builder's origin);
// its nginx proxies /api/v1/auth/* to zetsite's auth-service and everything else under /api/* to
// zetsite's api-service, so both integration surfaces live under this one base.
import axios from 'axios';

function apiBase(): string {
  const base = process.env.ZETSITE_API_URL;
  if (!base) throw new Error('ZETSITE_API_URL is not configured');
  return base.replace(/\/$/, '');
}

function integrationSecret(): string {
  const secret = process.env.ZETSITE_INTEGRATION_SECRET;
  if (!secret) throw new Error('ZETSITE_INTEGRATION_SECRET is not configured');
  return secret;
}

// The exact callback zetsite's OAuth flow redirects the merchant's browser back to once they
// approve the consent screen — must match zetsite's own ZETSALES_REDIRECT_URI env var exactly.
export function zetSiteRedirectUri(): string {
  return `${process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce'}/stores/zetsite/oauth/callback`;
}

// Step 1 of the OAuth flow: sends the merchant's browser to zetsite's own consent screen. Unlike
// Shopify's OAuth start (which needs a shop domain query param), zetsite's consent screen resolves
// which store is connecting from the merchant's own login cookie — so this is just a fixed URL plus
// the CSRF-style state token this app generated.
export function buildZetSiteAuthorizeUrl(state: string): string {
  const url = new URL(`${apiBase()}/oauth/authorize`);
  url.searchParams.set('redirect_uri', zetSiteRedirectUri());
  url.searchParams.set('state', state);
  return url.toString();
}

// Step 3: server-to-server exchange of the one-time code zetsite's callback handed back, gated by
// the shared secret header (proves this really is zetsales' backend, not whoever intercepted the
// code in transit).
export async function exchangeZetSiteCode(code: string): Promise<{ accessToken: string; storeId: string; storeName: string; storeSlug: string }> {
  const res = await axios.post(
    `${apiBase()}/api/v1/auth/integrations/token`,
    { code, redirectUri: zetSiteRedirectUri() },
    { headers: { 'X-Integration-Secret': integrationSecret() } }
  );
  return res.data;
}

export interface ZetSiteMedia {
  url: string;
  type: string;
}

export interface ZetSiteVariant {
  label: string;
  values: string[];
  price?: number;
  sku?: string;
  available: number;
  image?: string | null;
}

export interface ZetSiteProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  media: ZetSiteMedia[];
  category: string;
  price?: number;
  compareAtPrice?: number;
  sku: string;
  options: { name: string; values: string[] }[];
  variants: ZetSiteVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface ZetSiteOrder {
  id: string;
  productId: string | null;
  variantIndex: number | null;
  variantLabel: string | null;
  quantity: number;
  customer: { name: string; phone: string; address: string };
  shippingLabel: string;
  shippingCost: number;
  subtotal: number;
  total: number;
  status: 'new' | 'confirmed' | 'shipped' | 'cancelled';
  createdAt: string;
}

function authHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export async function fetchZetSiteProducts(accessToken: string, page = 1): Promise<{ products: ZetSiteProduct[]; total: number; hasMore: boolean }> {
  const res = await axios.get(`${apiBase()}/api/v1/integrations/products`, { headers: authHeaders(accessToken), params: { page } });
  return res.data;
}

export async function fetchZetSiteOrders(accessToken: string, page = 1): Promise<{ orders: ZetSiteOrder[]; total: number; hasMore: boolean }> {
  const res = await axios.get(`${apiBase()}/api/v1/integrations/orders`, { headers: authHeaders(accessToken), params: { page } });
  return res.data;
}

export interface ZetSiteProductWriteInput {
  title: string;
  description?: string | null;
  category?: string | null;
  images: string[];
  options: { name: string; values: string[] }[];
  variants: { sku?: string | null; price: number; compareAtPrice?: number | null; optionValues: string[]; image?: string | null }[];
}

function toZetSiteBody(input: ZetSiteProductWriteInput) {
  return {
    title: input.title,
    description: input.description || '',
    category: input.category || '',
    media: input.images.map((url) => ({ url, type: 'image' })),
    options: input.options,
    variants: input.variants.map((v) => ({
      label: v.optionValues.join(' / ') || input.title,
      values: v.optionValues,
      price: v.price,
      sku: v.sku || undefined,
      // zetsite's own checkout gates on this number (see ProductOrderPanel.tsx's stock check) —
      // but neither Shopify's nor WooCommerce's push payload carries a stock count either (see
      // toPushInput in productsController.ts), so there's nothing real to forward here yet.
      // Pushing a real number would need a dedicated inventory-sync feature of its own; until then,
      // a product created/edited from zetsales stays purchasable rather than silently reading as
      // out of stock.
      available: 999999,
      image: v.image ?? null,
    })),
  };
}

export async function createZetSiteProduct(accessToken: string, input: ZetSiteProductWriteInput): Promise<ZetSiteProduct> {
  const res = await axios.post(`${apiBase()}/api/v1/integrations/products`, toZetSiteBody(input), { headers: authHeaders(accessToken) });
  return res.data.product;
}

export async function updateZetSiteProduct(accessToken: string, externalId: string, input: ZetSiteProductWriteInput): Promise<ZetSiteProduct> {
  const res = await axios.patch(`${apiBase()}/api/v1/integrations/products/${externalId}`, toZetSiteBody(input), { headers: authHeaders(accessToken) });
  return res.data.product;
}

export async function deleteZetSiteProduct(accessToken: string, externalId: string): Promise<void> {
  await axios.delete(`${apiBase()}/api/v1/integrations/products/${externalId}`, { headers: authHeaders(accessToken) });
}

export async function updateZetSiteOrderStatus(accessToken: string, externalId: string, status: 'new' | 'confirmed' | 'shipped' | 'cancelled'): Promise<void> {
  await axios.patch(`${apiBase()}/api/v1/integrations/orders/${externalId}/status`, { status }, { headers: authHeaders(accessToken) });
}

// Tells zetsite where to deliver live product/order change events for this connection — zetsite
// dispatches one unified envelope shape ({event, storeId, data}) for every event rather than
// per-resource endpoints, so a single registration covers products and orders alike.
export async function registerZetSiteWebhook(accessToken: string, callbackUrl: string, events: string[]): Promise<void> {
  await axios.post(
    `${apiBase()}/api/v1/auth/integrations/webhooks`,
    { webhookUrl: callbackUrl, events },
    { headers: authHeaders(accessToken) }
  );
}
