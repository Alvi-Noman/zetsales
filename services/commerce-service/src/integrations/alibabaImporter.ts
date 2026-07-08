import axios from 'axios';
import type { SupplierProductDraftDTO } from '@zetsales/shared';

function decodeHtml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value: string) {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' '));
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1];
    if (match) return decodeHtml(match);
  }
  return null;
}

function pageTitle(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  if (!title) return null;
  return stripTags(title).replace(/\s*[-|]\s*Alibaba\.com.*$/i, '').trim();
}

function jsonLdProducts(html: string) {
  const products: any[] = [];
  const scripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const script of scripts) {
    const body = script.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '').trim();
    try {
      const parsed = JSON.parse(body);
      const entries = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      products.push(...entries.filter((entry: any) => String(entry?.['@type'] ?? '').toLowerCase().includes('product')));
    } catch {
      // Alibaba pages often contain non-standard script payloads; ignore the invalid ones.
    }
  }
  return products;
}

function imageCandidates(html: string, jsonProducts: any[]) {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const clean = decodeHtml(value).replace(/^\/\//, 'https://');
    if (!/^https?:\/\//i.test(clean)) return;
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(clean)) return;
    urls.add(clean);
  };

  add(meta(html, 'og:image'));
  for (const product of jsonProducts) {
    if (Array.isArray(product.image)) product.image.forEach(add);
    else add(product.image);
  }

  const imageMatches = html.match(/https?:\\?\/\\?\/[^"'\\\s]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\\s]*)?/gi) ?? [];
  imageMatches.forEach((raw) => add(raw.replace(/\\\//g, '/')));

  return [...urls].filter((url) => !/sprite|logo|avatar|favicon/i.test(url)).slice(0, 10);
}

function priceFromJson(product: any) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const price = Number(offers?.price ?? offers?.lowPrice ?? product?.price);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function priceFromHtml(html: string) {
  const text = stripTags(html);
  const matches = [...text.matchAll(/\$ ?([0-9]+(?:\.[0-9]{1,2})?)(?:\s*[-~]\s*\$? ?([0-9]+(?:\.[0-9]{1,2})?))?/g)];
  const prices = matches
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100000)
    .sort((a, b) => a - b);
  return prices[0] ?? null;
}

function supplierName(html: string) {
  const fromMeta = meta(html, 'og:site_name');
  if (fromMeta && !/alibaba/i.test(fromMeta)) return fromMeta;
  const match = html.match(/"companyName"\s*:\s*"([^"]+)"/i)?.[1] ?? html.match(/"supplierName"\s*:\s*"([^"]+)"/i)?.[1];
  return match ? decodeHtml(match) : null;
}

function normalizeAlibabaUrl(input: string) {
  const url = new URL(input);
  const host = url.hostname.toLowerCase();
  if (!host.endsWith('alibaba.com')) throw new Error('Only Alibaba.com product URLs are supported for this importer.');
  return url.toString();
}

export async function previewAlibabaProduct(inputUrl: string): Promise<SupplierProductDraftDTO> {
  const sourceUrl = normalizeAlibabaUrl(inputUrl);
  const res = await axios.get(sourceUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ZetSalesImporter/1.0; +https://zetsales.local)',
      Accept: 'text/html,application/xhtml+xml',
    },
    timeout: 20_000,
    maxRedirects: 5,
  });

  const html = String(res.data ?? '');
  const products = jsonLdProducts(html);
  const product = products[0] ?? {};
  const title = decodeHtml(String(product.name ?? meta(html, 'og:title') ?? pageTitle(html) ?? 'Imported Alibaba product')).replace(/\s*\|\s*Alibaba\.com.*$/i, '');
  const description = decodeHtml(String(product.description ?? meta(html, 'description') ?? meta(html, 'og:description') ?? ''));
  const images = imageCandidates(html, products);
  const price = priceFromJson(product) ?? priceFromHtml(html) ?? 0;
  const rawPriceText = price > 0 ? `$${price}` : null;
  const warnings: string[] = [
    'Review supplier images/descriptions before publishing. Use only content you have rights to reuse.',
  ];
  if (price <= 0) warnings.push('No reliable product price was detected; set selling prices before publishing.');
  if (images.length === 0) warnings.push('No product images were detected; upload or paste image URLs before publishing.');
  if (description.length < 30) warnings.push('Description looks sparse; enrich it before publishing.');

  return {
    title,
    description,
    category: '',
    images,
    weight: undefined,
    weightUnit: 'kg',
    sourcePlatform: 'alibaba',
    sourceUrl,
    supplierName: supplierName(html),
    rawPriceText,
    confidence: images.length > 0 && title !== 'Imported Alibaba product' ? 'medium' : 'low',
    warnings,
    options: [],
    variants: [
      {
        sku: undefined,
        price,
        compareAtPrice: undefined,
        optionValues: [],
        continueSellingWhenOutOfStock: true,
      },
    ],
  };
}
