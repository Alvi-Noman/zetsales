import axios from 'axios';
import fs from 'fs';
import path from 'path';
import type { ShopifyOrderWebhook } from './orderStatusMapper.js';
import { UPLOAD_DIR } from '../middleware/upload.js';
import logger from '../utils/logger.js';

export const SHOPIFY_API_VERSION = '2026-04';
export const SHOPIFY_SCOPES = ['read_products', 'write_products', 'read_orders', 'read_customers'];

export interface ProductWriteVariantInput {
  sku: string | null;
  price: number;
  compareAtPrice: number | null;
  optionValues: string[];
  image: string | null;
}

export interface ProductWriteInput {
  title: string;
  description: string | null;
  category: string | null;
  images: string[];
  weight: number | null;
  weightUnit: 'kg' | 'g' | 'lb' | 'oz';
  options: { name: string; values: string[] }[];
  variants: ProductWriteVariantInput[];
}

export interface ExistingShopifyVariant {
  id: string;
  sku: string | null;
  optionValues: string[];
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

// Locally-uploaded images aren't reachable by Shopify's servers without a public tunnel, so those
// get embedded as raw base64 (`attachment`) instead of a fetchable `src` URL — anything else
// (external URLs, or images already hosted on Shopify's own CDN from a prior sync) passes through
// as `src` unchanged. WooCommerce has no attachment equivalent, so this trick is Shopify-only.
function uploadsBaseUrl(): string {
  return `${process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce'}/uploads/`;
}

function shopifyImageEntry(url: string): { src: string } | { attachment: string } {
  const base = uploadsBaseUrl();
  if (!url.startsWith(base)) return { src: url };
  const filePath = path.join(UPLOAD_DIR, url.slice(base.length));
  return { attachment: fs.readFileSync(filePath).toString('base64') };
}

function shopifyVariantPayload(v: ProductWriteVariantInput, hasOptions: boolean, id?: string) {
  return {
    ...(id ? { id: Number(id) } : {}),
    price: v.price,
    compare_at_price: v.compareAtPrice ?? undefined,
    sku: v.sku || undefined,
    ...(hasOptions ? { option1: v.optionValues[0], option2: v.optionValues[1], option3: v.optionValues[2] } : {}),
  };
}

function shopifyWeightFields(input: ProductWriteInput) {
  if (input.weight == null || !(input.weight > 0)) return {};
  return { weight: input.weight, weight_unit: input.weightUnit };
}

// A variant's image may not already be part of the product's own gallery (e.g. an imported
// swatch photo distinct from the main product photos) — union it in here, not in the shared
// toPushInput, so WooCommerce and the UI's product-level gallery aren't polluted with variant-only
// images that were never meant to appear there.
function shopifyProductImages(input: ProductWriteInput) {
  const urls = [...input.images, ...input.variants.map((v) => v.image).filter((v): v is string => Boolean(v))];
  return [...new Set(urls)].map(shopifyImageEntry);
}

// Shopify's REST API requires a variant's image_id to reference an image id that already exists on
// the product — for brand-new images that id isn't known until the create/update response comes
// back, so images are assigned in a follow-up pass rather than in the same request. Pre-request id
// maps (used to match submitted variants to existing ones) aren't reusable here since they map old
// ids, not the ids in this response — variants are matched to the response by their option-value
// signature instead, the only stable identity a brand-new variant has. Only variants whose target
// image actually differs from what the response already shows are returned, so a typical push with
// no variant images touches zero extra API calls.
function matchVariantImages(responseVariants: ShopifyProduct['variants'], inputVariants: ProductWriteVariantInput[], responseImages: ShopifyProduct['images']) {
  const imageIdBySrc = new Map<string, number>();
  for (const img of responseImages) {
    if (!imageIdBySrc.has(img.src)) imageIdBySrc.set(img.src, img.id);
  }

  const matchKey = (values: (string | null)[]) => values.filter((v) => v != null).join(' ');
  const inputByKey = new Map(inputVariants.map((v) => [matchKey(v.optionValues), v]));

  return responseVariants
    .map((rv) => {
      const input = inputByKey.get(matchKey([rv.option1, rv.option2, rv.option3]));
      const targetImageId = input?.image ? (imageIdBySrc.get(input.image) ?? null) : null;
      return { variantId: rv.id, targetImageId, currentImageId: rv.image_id ?? null };
    })
    .filter((v) => v.currentImageId !== v.targetImageId);
}

// A failed attach shouldn't roll back or fail an otherwise-successful product push — the base
// product/variant data already landed. Sequential, not batched: parallel PUTs risk tripping
// Shopify's REST rate limit, worse than one slower pass for what's normally very few calls.
async function attachShopifyVariantImages(shopDomain: string, accessToken: string, assignments: { variantId: number; targetImageId: number | null }[]) {
  for (const { variantId, targetImageId } of assignments) {
    try {
      await axios.put(
        adminUrl(shopDomain, `/variants/${variantId}.json`),
        { variant: { id: variantId, image_id: targetImageId } },
        { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 15_000 }
      );
    } catch (err) {
      logger.warn(`Failed to attach image to Shopify variant ${variantId}: ${(err as Error).message}`);
    }
  }
}

async function syncShopifyCollections(shopDomain: string, accessToken: string, productId: number, collectionIds: string[] = []) {
  const uniqueIds = [...new Set(collectionIds.filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const existingRes = await axios.get(adminUrl(shopDomain, '/collects.json'), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    params: { product_id: productId, limit: 250 },
    timeout: 10_000,
  });
  const existing = new Set((existingRes.data.collects as { collection_id: number }[]).map((c) => String(c.collection_id)));

  for (const collectionId of uniqueIds) {
    if (existing.has(collectionId)) continue;
    await axios.post(
      adminUrl(shopDomain, '/collects.json'),
      { collect: { product_id: productId, collection_id: Number(collectionId) } },
      { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 10_000 }
    );
  }
}

export async function fetchShopifyCollections(shopDomain: string, accessToken: string) {
  const headers = { 'X-Shopify-Access-Token': accessToken };
  const [customRes, smartRes] = await Promise.all([
    axios.get(adminUrl(shopDomain, '/custom_collections.json'), { headers, params: { limit: 250 }, timeout: 10_000 }),
    axios.get(adminUrl(shopDomain, '/smart_collections.json'), { headers, params: { limit: 250 }, timeout: 10_000 }),
  ]);

  return [
    ...(customRes.data.custom_collections as { id: number; title: string; handle?: string }[]).map((c) => ({ id: String(c.id), name: c.title, handle: c.handle ?? null })),
    ...(smartRes.data.smart_collections as { id: number; title: string; handle?: string }[]).map((c) => ({ id: String(c.id), name: c.title, handle: c.handle ?? null })),
  ].sort((a, b) => a.name.localeCompare(b.name));
}

export async function createShopifyProduct(shopDomain: string, accessToken: string, input: ProductWriteInput, collectionIds: string[] = []) {
  const hasOptions = input.options.length > 0;
  const res = await axios.post(
    adminUrl(shopDomain, '/products.json'),
    {
      product: {
        title: input.title,
        body_html: input.description || undefined,
        product_type: input.category || undefined,
        images: shopifyProductImages(input),
        ...(hasOptions ? { options: input.options.map((o) => ({ name: o.name, values: o.values })) } : {}),
        variants: input.variants.map((v) => ({ ...shopifyVariantPayload(v, hasOptions), ...shopifyWeightFields(input) })),
      },
    },
    { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 20_000 }
  );
  const product = res.data.product as ShopifyProduct;
  await syncShopifyCollections(shopDomain, accessToken, product.id, collectionIds);

  const assignments = matchVariantImages(product.variants, input.variants, product.images);
  if (assignments.length > 0) {
    await attachShopifyVariantImages(shopDomain, accessToken, assignments);
    // The response above predates the attach calls, so patch it locally with what was just set —
    // otherwise the immediate mapShopifyProduct() call right after this returns shows the pre-attach
    // (unset) image, and the caller only sees the real state on the next unrelated fetch.
    const targetById = new Map(assignments.map((a) => [a.variantId, a.targetImageId]));
    product.variants = product.variants.map((v) => (targetById.has(v.id) ? { ...v, image_id: targetById.get(v.id)! } : v));
  }

  return product;
}

// Shopify's PUT replaces the whole variant set: entries with an `id` update in place, id-less
// entries get created, and any existing variant left out gets deleted — that's the mechanism that
// lets adding/removing an option combination through the edit form actually add/remove it here.
// Existing variants are matched to submitted ones by their option combination first (the stable
// identity across an edit), falling back to a shared SKU — response array order isn't a documented
// guarantee, so neither match relies on position.
export async function updateShopifyProduct(
  shopDomain: string,
  accessToken: string,
  externalId: string,
  input: ProductWriteInput,
  existingVariants: ExistingShopifyVariant[],
  collectionIds: string[] = []
) {
  const hasOptions = input.options.length > 0;
  const matchKey = (optionValues: string[]) => optionValues.join(' ');
  const byOptionValues = new Map(existingVariants.map((v) => [matchKey(v.optionValues), v.id]));
  const bySku = new Map(existingVariants.filter((v): v is ExistingShopifyVariant & { sku: string } => Boolean(v.sku)).map((v) => [v.sku, v.id]));
  const usedIds = new Set<string>();

  const variants = input.variants.map((v) => {
    const candidateId = byOptionValues.get(matchKey(v.optionValues)) ?? (v.sku ? bySku.get(v.sku) : undefined);
    const id = candidateId && !usedIds.has(candidateId) ? candidateId : undefined;
    if (id) usedIds.add(id);
    return { ...shopifyVariantPayload(v, hasOptions, id), ...shopifyWeightFields(input) };
  });

  const res = await axios.put(
    adminUrl(shopDomain, `/products/${externalId}.json`),
    {
      product: {
        id: Number(externalId),
        title: input.title,
        body_html: input.description || undefined,
        product_type: input.category || undefined,
        images: shopifyProductImages(input),
        ...(hasOptions ? { options: input.options.map((o) => ({ name: o.name, values: o.values })) } : {}),
        variants,
      },
    },
    { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 20_000 }
  );
  const product = res.data.product as ShopifyProduct;
  await syncShopifyCollections(shopDomain, accessToken, product.id, collectionIds);

  const assignments = matchVariantImages(product.variants, input.variants, product.images);
  if (assignments.length > 0) {
    await attachShopifyVariantImages(shopDomain, accessToken, assignments);
    const targetById = new Map(assignments.map((a) => [a.variantId, a.targetImageId]));
    product.variants = product.variants.map((v) => (targetById.has(v.id) ? { ...v, image_id: targetById.get(v.id)! } : v));
  }

  return product;
}

export async function deleteShopifyProduct(shopDomain: string, accessToken: string, externalId: string) {
  await axios.delete(adminUrl(shopDomain, `/products/${externalId}.json`), {
    headers: { 'X-Shopify-Access-Token': accessToken },
    timeout: 15_000,
  });
}

// Registering a webhook is what actually makes Shopify call our webhook receivers — creating the
// route alone does nothing. Failing silently on a duplicate (already registered for this
// address) keeps reconnects idempotent instead of erroring out.
export async function registerShopifyWebhook(shopDomain: string, accessToken: string, topic: string, address: string) {
  try {
    await axios.post(
      adminUrl(shopDomain, '/webhooks.json'),
      { webhook: { topic, address, format: 'json' } },
      { headers: { 'X-Shopify-Access-Token': accessToken }, timeout: 10_000 }
    );
  } catch (err) {
    const addressErrors = axios.isAxiosError(err) && err.response?.status === 422 ? err.response.data?.errors?.address : undefined;
    const isDuplicate = Array.isArray(addressErrors) && addressErrors.some((m: string) => /already been taken/i.test(m));
    if (!isDuplicate) throw err;
  }
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
  handle: string;
  body_html: string | null;
  product_type: string | null;
  image: { src: string } | null;
  images: { id: number; src: string }[];
  options: { name: string; position: number; values: string[] }[];
  variants: {
    id: number;
    sku: string | null;
    price: string;
    compare_at_price: string | null;
    option1: string | null;
    option2: string | null;
    option3: string | null;
    inventory_quantity: number | null;
    // Only 'shopify' means Shopify itself is tracking this variant's stock — anything else (a
    // third-party fulfillment service, or not managed at all) means inventory_quantity isn't a
    // real count and shouldn't be trusted as one.
    inventory_management: string | null;
    inventory_item_id: number;
    weight?: number | null;
    weight_unit?: 'kg' | 'g' | 'lb' | 'oz' | null;
    title: string;
    image_id: number | null;
  }[];
}
