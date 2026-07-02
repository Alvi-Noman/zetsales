import axios from 'axios';
import type { ShopifyOrderWebhook } from './orderStatusMapper.js';

export const SHOPIFY_API_VERSION = '2026-04';
export const SHOPIFY_SCOPES = ['read_products', 'write_products', 'read_orders', 'read_inventory', 'write_inventory', 'read_locations', 'read_customers'];

export interface ProductWriteInput {
  title: string;
  image?: string | null;
  price: number;
  sku?: string | null;
  inventory?: number | null;
}

export function normalizeShopDomain(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  return trimmed.includes('.') ? trimmed : `${trimmed}.myshopify.com`;
}

function adminUrl(shopDomain: string, path: string) {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}${path}`;
}

export async function verifyShopifyToken(shopDomain: string, accessToken: string) {
  const res = await axios.get(adminUrl(shopDomain, '/shop.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    timeout: 10_000,
  });
  return res.data.shop as { name: string; email: string; domain: string };
}

export async function fetchShopifyProductCount(shopDomain: string, accessToken: string) {
  const res = await axios.get(adminUrl(shopDomain, '/products/count.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    timeout: 10_000,
  });
  return res.data.count as number;
}

export async function fetchShopifyProducts(shopDomain: string, accessToken: string, pageInfo?: string) {
  const res = await axios.get(adminUrl(shopDomain, '/products.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    params: { limit: 50, ...(pageInfo ? { page_info: pageInfo } : {}) },
    timeout: 15_000,
  });

  const linkHeader = res.headers['link'] as string | undefined;
  const nextMatch = linkHeader?.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);

  return {
    products: res.data.products as ShopifyProduct[],
    nextPageInfo: nextMatch?.[1] ?? null,
  };
}

export async function fetchShopifyOrderCount(shopDomain: string, accessToken: string) {
  const res = await axios.get(adminUrl(shopDomain, '/orders/count.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    params: { status: 'any' },
    timeout: 10_000,
  });
  return res.data.count as number;
}

export async function fetchShopifyOrders(shopDomain: string, accessToken: string, pageInfo?: string) {
  // Shopify's cursor pagination is picky: once a page_info cursor is present, no other filter
  // params (like status) are allowed on the request — including it unconditionally causes a 400
  // on every page after the first.
  const res = await axios.get(adminUrl(shopDomain, '/orders.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    params: pageInfo ? { limit: 50, page_info: pageInfo } : { status: 'any', limit: 50 },
    timeout: 15_000,
  });

  const linkHeader = res.headers['link'] as string | undefined;
  const nextMatch = linkHeader?.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);

  return {
    orders: res.data.orders as ShopifyOrderWebhook[],
    nextPageInfo: nextMatch?.[1] ?? null,
  };
}

export async function createShopifyProduct(shopDomain: string, accessToken: string, input: ProductWriteInput) {
  const res = await axios.post(
    adminUrl(shopDomain, '/products.json'),
    {
      product: {
        title: input.title,
        images: input.image ? [{ src: input.image }] : [],
        variants: [
          {
            price: input.price,
            sku: input.sku || undefined,
            inventory_quantity: input.inventory ?? 0,
            inventory_management: 'shopify',
          },
        ],
      },
    },
    { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 15_000 }
  );
  return res.data.product as ShopifyProduct;
}

// Shopify stopped honoring inventory_quantity on a plain variant PUT once location-based
// inventory tracking became standard — stock changes after creation have to go through the
// InventoryLevel API instead, targeting a specific location. Stores can have several locations
// (including fulfillment-service locations registered by other apps, e.g. dropshipping tools),
// so we resolve the shop's actual primary location via shop.json rather than guessing the first
// entry in /locations.json. Cached per shop domain, since different stores have different ones.
const primaryLocationCache = new Map<string, number>();

async function fetchShopifyPrimaryLocationId(shopDomain: string, accessToken: string): Promise<number> {
  const cached = primaryLocationCache.get(shopDomain);
  if (cached) return cached;

  const shopRes = await axios.get(adminUrl(shopDomain, '/shop.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    timeout: 10_000,
  });
  const primaryLocationId = shopRes.data.shop?.primary_location_id as number | undefined;
  if (!primaryLocationId) throw new Error('No primary inventory location found on this store');

  primaryLocationCache.set(shopDomain, primaryLocationId);
  return primaryLocationId;
}

async function setShopifyInventoryLevel(shopDomain: string, accessToken: string, inventoryItemId: number, available: number) {
  const locationId = await fetchShopifyPrimaryLocationId(shopDomain, accessToken);
  await axios.post(
    adminUrl(shopDomain, '/inventory_levels/set.json'),
    { location_id: locationId, inventory_item_id: inventoryItemId, available },
    { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 15_000 }
  );
}

export async function updateShopifyProduct(shopDomain: string, accessToken: string, externalId: string, variantId: string, input: ProductWriteInput) {
  const res = await axios.put(
    adminUrl(shopDomain, `/products/${externalId}.json`),
    {
      product: {
        id: Number(externalId),
        title: input.title,
        images: input.image ? [{ src: input.image }] : [],
        variants: [
          {
            id: Number(variantId),
            price: input.price,
            sku: input.sku || undefined,
          },
        ],
      },
    },
    { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 15_000 }
  );
  const product = res.data.product as ShopifyProduct;

  if (input.inventory != null) {
    const variant = product.variants.find((v) => v.id === Number(variantId));
    if (variant) {
      await setShopifyInventoryLevel(shopDomain, accessToken, variant.inventory_item_id, input.inventory);
      variant.inventory_quantity = input.inventory;
    }
  }

  return product;
}

export async function deleteShopifyProduct(shopDomain: string, accessToken: string, externalId: string) {
  await axios.delete(adminUrl(shopDomain, `/products/${externalId}.json`), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    timeout: 15_000,
  });
}

export function buildShopifyOAuthUrl(shopDomain: string, clientId: string, redirectUri: string, state: string) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SHOPIFY_SCOPES.join(','),
    redirect_uri: redirectUri,
    state,
  });
  return `https://${shopDomain}/admin/oauth/authorize?${params.toString()}`;
}

export async function exchangeShopifyCode(shopDomain: string, clientId: string, clientSecret: string, code: string) {
  const res = await axios.post(`https://${shopDomain}/admin/oauth/access_token`, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });
  return res.data.access_token as string;
}

// Dev Dashboard custom apps (created after Jan 2026) authenticate via the OAuth 2.0 client
// credentials grant instead of handing out a static token — the resulting access token expires
// after ~24h, so callers need to re-request one rather than treat it as permanent.
export async function exchangeShopifyClientCredentials(shopDomain: string, clientId: string, clientSecret: string) {
  const res = await axios.post(
    `https://${shopDomain}/admin/oauth/access_token`,
    new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10_000 }
  );
  return { accessToken: res.data.access_token as string, expiresInSeconds: Number(res.data.expires_in) || 86_000 };
}

export interface ShopifyProduct {
  id: number;
  title: string;
  image: { src: string } | null;
  variants: { id: number; sku: string | null; price: string; inventory_quantity: number | null; inventory_item_id: number; title: string }[];
}
