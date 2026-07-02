import type { ShopifyProduct } from './shopifyClient.js';
import type { WooProduct } from './wooClient.js';

export interface NormalizedProduct {
  externalId: string;
  title: string;
  image: string | null;
  variants: { id: string; sku: string | null; title: string; price: number; inventory: number | null }[];
}

export function mapShopifyProduct(p: ShopifyProduct): NormalizedProduct {
  return {
    externalId: String(p.id),
    title: p.title,
    image: p.image?.src ?? null,
    variants: p.variants.map((v) => ({
      id: String(v.id),
      sku: v.sku || null,
      title: v.title,
      price: Number(v.price) || 0,
      inventory: v.inventory_quantity ?? null,
    })),
  };
}

export function mapWooProduct(p: WooProduct): NormalizedProduct {
  return {
    externalId: String(p.id),
    title: p.name,
    image: p.images?.[0]?.src ?? null,
    variants: [
      {
        id: String(p.id),
        sku: p.sku || null,
        title: p.name,
        price: Number(p.price) || 0,
        inventory: p.stock_quantity,
      },
    ],
  };
}
