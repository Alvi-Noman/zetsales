import axios from 'axios';
import type { WooOrderWebhook } from './orderStatusMapper.js';

export interface ProductWriteInput {
  title: string;
  image?: string | null;
  price: number;
  sku?: string | null;
  inventory?: number | null;
}

export async function createWooProduct(siteUrl: string, consumerKey: string, consumerSecret: string, input: ProductWriteInput) {
  const res = await axios.post(
    `${siteUrl}/wp-json/wc/v3/products`,
    {
      name: input.title,
      regular_price: String(input.price),
      sku: input.sku || undefined,
      manage_stock: input.inventory != null,
      stock_quantity: input.inventory ?? undefined,
      images: input.image ? [{ src: input.image }] : [],
    },
    { auth: { username: consumerKey, password: consumerSecret }, timeout: 15_000 }
  );
  return res.data as WooProduct;
}

export async function updateWooProduct(siteUrl: string, consumerKey: string, consumerSecret: string, externalId: string, input: ProductWriteInput) {
  const res = await axios.put(
    `${siteUrl}/wp-json/wc/v3/products/${externalId}`,
    {
      name: input.title,
      regular_price: String(input.price),
      sku: input.sku || undefined,
      manage_stock: input.inventory != null,
      stock_quantity: input.inventory ?? undefined,
      images: input.image ? [{ src: input.image }] : [],
    },
    { auth: { username: consumerKey, password: consumerSecret }, timeout: 15_000 }
  );
  return res.data as WooProduct;
}

export async function deleteWooProduct(siteUrl: string, consumerKey: string, consumerSecret: string, externalId: string) {
  await axios.delete(`${siteUrl}/wp-json/wc/v3/products/${externalId}`, {
    params: { force: true },
    auth: { username: consumerKey, password: consumerSecret },
    timeout: 15_000,
  });
}

export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim().replace(/\/$/, '');
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export async function verifyWooKeys(siteUrl: string, consumerKey: string, consumerSecret: string) {
  const res = await axios.get(`${siteUrl}/wp-json/wc/v3/products`, {
    params: { per_page: 1 },
    auth: { username: consumerKey, password: consumerSecret },
    timeout: 10_000,
  });
  return Array.isArray(res.data);
}

export async function fetchWooProducts(siteUrl: string, consumerKey: string, consumerSecret: string, page: number) {
  const res = await axios.get(`${siteUrl}/wp-json/wc/v3/products`, {
    params: { per_page: 50, page },
    auth: { username: consumerKey, password: consumerSecret },
    timeout: 15_000,
  });
  const total = Number(res.headers['x-wp-total']);
  return { products: res.data as WooProduct[], total: Number.isFinite(total) ? total : null };
}

export async function fetchWooOrders(siteUrl: string, consumerKey: string, consumerSecret: string, page: number) {
  const res = await axios.get(`${siteUrl}/wp-json/wc/v3/orders`, {
    params: { per_page: 50, page },
    auth: { username: consumerKey, password: consumerSecret },
    timeout: 15_000,
  });
  const total = Number(res.headers['x-wp-total']);
  return { orders: res.data as WooOrderWebhook[], total: Number.isFinite(total) ? total : null };
}

// WooCommerce's built-in "Application Authentication" flow — no developer account needed,
// works against any live WooCommerce store. Callback must be HTTPS (WooCommerce requirement).
export function buildWooAuthUrl(siteUrl: string, appName: string, userId: string, returnUrl: string, callbackUrl: string) {
  const params = new URLSearchParams({
    app_name: appName,
    scope: 'read',
    user_id: userId,
    return_url: returnUrl,
    callback_url: callbackUrl,
  });
  return `${siteUrl}/wc-auth/v1/authorize?${params.toString()}`;
}

export interface WooProduct {
  id: number;
  name: string;
  sku: string;
  price: string;
  stock_quantity: number | null;
  images: { src: string }[];
  variations: number[];
}
