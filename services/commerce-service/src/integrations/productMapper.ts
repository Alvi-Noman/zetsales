import type { ShopifyProduct } from './shopifyClient.js';
import type { WooProduct } from './wooClient.js';
import { fetchWooProductVariations } from './wooClient.js';
import type { ZetSiteProduct } from './zetsiteClient.js';

export interface NormalizedProduct {
  externalId: string;
  title: string;
  description: string | null;
  category: string | null;
  url: string | null;
  images: string[];
  weight?: number | null;
  weightUnit?: 'kg' | 'g' | 'lb' | 'oz';
  sourceUrl?: string | null;
  sourcePlatform?: 'alibaba' | 'manual' | 'shopify' | 'woocommerce' | 'zetsite' | null;
  storeCollections?: string[];
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    sku: string | null;
    title: string;
    price: number;
    compareAtPrice: number | null;
    inventory: number | null;
    optionValues: string[];
    // Not knowable from the store's own API response (Shopify/Woo have no such concept) — left
    // unset by both mappers below; the products controller attaches it after the push, matched
    // back from what was actually submitted in the write form.
    continueSellingWhenOutOfStock?: boolean;
    image?: string | null;
  }[];
}

// `shopDomain` isn't part of Shopify's product payload itself — the caller (productsController.ts)
// passes it through from the store record so the real storefront link can be built.
export function mapShopifyProduct(p: ShopifyProduct, shopDomain: string): NormalizedProduct {
  const options = (p.options ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((o) => ({ name: o.name, values: o.values }));
  const images = p.images?.length ? p.images.map((i) => i.src) : p.image ? [p.image.src] : [];
  const imageSrcById = new Map((p.images ?? []).map((i) => [i.id, i.src]));

  return {
    externalId: String(p.id),
    title: p.title,
    description: p.body_html || null,
    category: p.product_type || null,
    url: p.handle ? `https://${shopDomain}/products/${p.handle}` : null,
    images,
    weight: p.variants.find((v) => v.weight != null)?.weight ?? null,
    weightUnit: p.variants.find((v) => v.weight_unit)?.weight_unit ?? 'kg',
    sourcePlatform: 'shopify',
    options,
    variants: p.variants.map((v) => ({
      id: String(v.id),
      sku: v.sku || null,
      title: v.title,
      price: Number(v.price) || 0,
      compareAtPrice: v.compare_at_price ? Number(v.compare_at_price) : null,
      inventory: v.inventory_management === 'shopify' ? v.inventory_quantity : null,
      optionValues: [v.option1, v.option2, v.option3].filter((x): x is string => x != null),
      image: v.image_id != null ? (imageSrcById.get(v.image_id) ?? null) : null,
    })),
  };
}

// Woo's variable products only expose variation *ids* on the parent product — has to fetch them
// to know real prices/attributes, hence this being async (unlike the Shopify mapper, which gets
// everything inline in one response).
export async function mapWooProduct(p: WooProduct, siteUrl: string, consumerKey: string, consumerSecret: string): Promise<NormalizedProduct> {
  const category = p.categories?.[0]?.name ?? null;
  const description = p.description || null;
  const images = p.images?.map((i) => i.src) ?? [];

  if (p.type === 'variable' && p.attributes?.some((a) => a.variation)) {
    const options = p.attributes.filter((a) => a.variation).map((a) => ({ name: a.name, values: a.options }));
    const variations = await fetchWooProductVariations(siteUrl, consumerKey, consumerSecret, p.id);

    return {
      externalId: String(p.id),
      title: p.name,
      description,
      category,
      url: p.permalink || null,
    images,
    weight: p.weight ? Number(p.weight) || null : null,
    weightUnit: 'kg',
    sourcePlatform: 'woocommerce',
    options,
      variants: variations.map((v) => {
        const attrByName = new Map(v.attributes.map((a) => [a.name, a.option]));
        const optionValues = options.map((o) => attrByName.get(o.name) ?? '');
        const price = Number(v.sale_price || v.regular_price) || 0;
        const compareAtPrice = v.sale_price && v.regular_price && Number(v.regular_price) > Number(v.sale_price) ? Number(v.regular_price) : null;
        return {
          id: String(v.id),
          sku: v.sku || null,
          title: optionValues.filter(Boolean).join(' / ') || p.name,
          price,
          compareAtPrice,
          inventory: v.stock_quantity ?? null,
          optionValues,
          image: v.image?.src ?? null,
        };
      }),
    };
  }

  const price = Number(p.sale_price || p.price || p.regular_price) || 0;
  const compareAtPrice = p.sale_price && p.regular_price && Number(p.regular_price) > Number(p.sale_price) ? Number(p.regular_price) : null;

  return {
    externalId: String(p.id),
    title: p.name,
    description,
    category,
    url: p.permalink || null,
    images,
    weight: p.weight ? Number(p.weight) || null : null,
    weightUnit: 'kg',
    sourcePlatform: 'woocommerce',
    options: [],
    variants: [
      {
        id: String(p.id),
        sku: p.sku || null,
        title: p.name,
        price,
        compareAtPrice,
        inventory: p.stock_quantity,
        optionValues: [],
      },
    ],
  };
}

// zetsite variants carry no id of their own (see ZetSiteVariant) — its own storefront/order pipeline
// addresses a variant purely by its position in the array (see storefrontRoutes.ts's variantIndex),
// so the stringified index doubles as this mapper's stable id, exactly matching what zetsite itself
// already treats as the variant's identity. `storeUrl`, when known, is the connected store's own
// zetsite storefront origin (e.g. its *.zetsite.com subdomain or connected custom domain) — used only
// to build a real product link; omit it to leave `url` null.
export function mapZetSiteProduct(p: ZetSiteProduct, storeUrl?: string | null): NormalizedProduct {
  const images = p.media?.map((m) => m.url) ?? [];

  return {
    externalId: p.id,
    title: p.title,
    description: p.description || null,
    category: p.category || null,
    url: storeUrl && p.handle ? `${storeUrl.replace(/\/$/, '')}/products/${p.handle}` : null,
    images,
    sourcePlatform: 'zetsite',
    options: p.options ?? [],
    variants: (p.variants ?? []).map((v, index) => ({
      id: String(index),
      sku: v.sku || null,
      title: v.label,
      price: v.price ?? p.price ?? 0,
      compareAtPrice: p.compareAtPrice ?? null,
      inventory: v.available ?? null,
      optionValues: v.values ?? [],
      image: v.image ?? null,
    })),
  };
}
