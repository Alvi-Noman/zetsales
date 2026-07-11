export interface ExtractedVariant {
  optionValues: string[];
  image: string | null;
}

export interface ExtractedDraft {
  title: string;
  description: string;
  images: string[];
  price: number | null;
  rawPriceText: string | null;
  supplierName: string | null;
  sourceUrl: string;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  options: { name: string; values: string[] }[];
  variants: ExtractedVariant[];
}

function meta(name: string): string | null {
  const el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
  return el ? el.getAttribute('content') : null;
}

// Alibaba embeds Product JSON-LD when it's rendered in a real browser (it only withholds this —
// along with everything else — behind the CAPTCHA wall it shows to scripted requests).
function jsonLdProducts(): Record<string, unknown>[] {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  const products: Record<string, unknown>[] = [];
  scripts.forEach((script) => {
    try {
      const parsed = JSON.parse(script.textContent || '');
      const entries = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      entries.forEach((entry: Record<string, unknown>) => {
        if (String(entry?.['@type'] ?? '').toLowerCase().includes('product')) products.push(entry);
      });
    } catch {
      // Some pages ship non-standard JSON-LD payloads; skip the ones that don't parse.
    }
  });
  return products;
}

function imagesFromJsonLd(product: Record<string, unknown>): string[] {
  const raw = product.image;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return arr.filter((v): v is string => typeof v === 'string' && /^https?:\/\//i.test(v));
}

// A blind `document.querySelectorAll('img')` also picks up nav icons, country-selector flags,
// reviewer avatars, and ad banners scattered around the page — none of which are product photos.
// Real product gallery images are rendered large; those aren't, so a rendered-size floor filters
// most of the noise out. This only runs as a fallback when the curated JSON-LD/og:image fields
// (below) don't already provide enough images.
function imagesFromDom(): string[] {
  const urls = new Set<string>();

  document.querySelectorAll('img').forEach((img) => {
    const el = img as HTMLImageElement;
    const src = el.currentSrc || el.src;
    if (!src || !/^https?:\/\//i.test(src)) return;
    if (!/\.(jpe?g|png|webp)(\?|$)/i.test(src)) return;
    if (/sprite|logo|avatar|favicon|flag|icon/i.test(src)) return;
    if (el.naturalWidth > 0 && el.naturalWidth < 200) return;
    if (el.naturalHeight > 0 && el.naturalHeight < 200) return;
    urls.add(src);
  });

  return [...urls].slice(0, 10);
}

// Alibaba B2B listings show price as a tiered range ("$12.50 - $15.00"), a single quote-request
// value, or nothing at all ("Get Latest Price" / RFQ-only). Prefer text inside elements whose
// class/data-attrs mention "price" over a blind whole-page scan, and take the low end of a range.
const PRICE_HINT_SELECTOR = '[class*="price" i], [data-testid*="price" i]';

function priceFromDom(): { price: number | null; rawPriceText: string | null } {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(PRICE_HINT_SELECTOR))
    .map((el) => el.innerText?.trim())
    .filter((text): text is string => Boolean(text) && text.length > 0 && text.length < 80);

  for (const text of candidates) {
    const rangeMatch = text.match(/\$\s?([0-9]+(?:\.[0-9]{1,2})?)\s*[-~]\s*\$?\s?([0-9]+(?:\.[0-9]{1,2})?)/);
    if (rangeMatch) return { price: Number(rangeMatch[1]), rawPriceText: text };

    const singleMatch = text.match(/\$\s?([0-9]+(?:\.[0-9]{1,2})?)/);
    if (singleMatch) return { price: Number(singleMatch[1]), rawPriceText: text };
  }

  const bodyText = document.body.innerText || '';
  const bodyMatches = [...bodyText.matchAll(/\$\s?([0-9]+(?:\.[0-9]{1,2})?)/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0 && n < 100000)
    .sort((a, b) => a - b);

  return { price: bodyMatches[0] ?? null, rawPriceText: null };
}

function supplierName(): string | null {
  const fromMeta = meta('og:site_name');
  if (fromMeta && !/alibaba/i.test(fromMeta)) return fromMeta;
  return null;
}

interface SwatchGroup {
  name: string;
  values: { value: string; image: string | null }[];
}

// Confirmed against a live listing's real markup: Alibaba's current product template wraps each
// option group ("Color", "Size", ...) as a direct child of `.module_sku .id-space-y-3`, labels it
// with an <h4>, and marks each selectable swatch with `data-testid="double-bordered-box"` — a
// value's name lives in its swatch image's `alt` text. Still best-effort like everything else
// here: a future Alibaba template change could shift this, in which case it simply yields nothing
// and falls back to a single default variant rather than guessing at something that might be wrong.
function extractSwatchGroups(): SwatchGroup[] {
  // Alibaba renders this same swatch selector more than once on a page (e.g. an above-the-fold
  // copy plus another inside a full specifications table) — scoping to the first `.module_sku`
  // instead of querying the whole document avoids treating the same option as two separate ones.
  const module = document.querySelector('.module_sku');
  if (!module) return [];

  const groupEls = module.querySelectorAll<HTMLElement>('.id-space-y-3 > div');
  const groups: SwatchGroup[] = [];
  const seenNames = new Set<string>();

  groupEls.forEach((groupEl) => {
    const nameEl = groupEl.querySelector('h4');
    const name = nameEl?.textContent?.replace(/[:：].*$/, '').trim();
    if (!name || seenNames.has(name)) return;

    const itemEls = groupEl.querySelectorAll<HTMLElement>('[data-testid="double-bordered-box"]');
    const values: { value: string; image: string | null }[] = [];
    const seenValues = new Set<string>();

    itemEls.forEach((itemEl) => {
      const img = itemEl.querySelector('img') as HTMLImageElement | null;
      const value = img?.getAttribute('alt') || itemEl.getAttribute('title') || itemEl.textContent?.trim();
      if (!value || value.length > 40 || seenValues.has(value)) return;
      seenValues.add(value);
      const rawSrc = img?.getAttribute('src') || null;
      values.push({ value, image: rawSrc ? (rawSrc.startsWith('//') ? `https:${rawSrc}` : rawSrc) : null });
    });

    if (values.length >= 2) {
      seenNames.add(name);
      groups.push({ name, values });
    }
  });

  return groups.slice(0, 3);
}

function cartesianProduct<T>(arrays: T[][]): T[][] {
  return arrays.reduce<T[][]>((acc, curr) => acc.flatMap((combo) => curr.map((v) => [...combo, v])), [[]]);
}

function extractOptionsAndVariants(): { options: { name: string; values: string[] }[]; variants: ExtractedVariant[] } {
  const groups = extractSwatchGroups();
  if (groups.length === 0) {
    return { options: [], variants: [{ optionValues: [], image: null }] };
  }

  const options = groups.map((g) => ({ name: g.name, values: g.values.map((v) => v.value) }));
  const combos = cartesianProduct(groups.map((g) => g.values));

  // Only assign an image when exactly one option group actually carries photos (Color, typically)
  // — if more than one group has images there's no reliable way to know which one is the variant's
  // true photo, so leave it unset rather than guess wrong.
  const groupsWithImages = groups.filter((g) => g.values.some((v) => v.image));
  const imageGroupIndex = groupsWithImages.length === 1 ? groups.indexOf(groupsWithImages[0]) : -1;

  const variants: ExtractedVariant[] = combos.map((combo) => ({
    optionValues: combo.map((v) => v.value),
    image: imageGroupIndex >= 0 ? combo[imageGroupIndex].image : null,
  }));

  return { options, variants };
}

export function extractDraft(): ExtractedDraft {
  const products = jsonLdProducts();
  const product = products[0] ?? {};
  const title = String(product.name ?? meta('og:title') ?? document.title ?? 'Imported Alibaba product');
  const description = String(product.description ?? meta('description') ?? meta('og:description') ?? '');

  const ogImage = meta('og:image');
  const curatedImages = [...(ogImage ? [ogImage] : []), ...imagesFromJsonLd(product)];
  const images = [...new Set(curatedImages.length > 0 ? curatedImages : imagesFromDom())].slice(0, 10);

  const { price, rawPriceText } = priceFromDom();
  const { options, variants } = extractOptionsAndVariants();

  const warnings: string[] = [
    'Review supplier images/description before publishing. Use only content you have rights to reuse.',
  ];
  if (price == null) warnings.push('No reliable product price was detected; set selling prices before publishing.');
  if (images.length === 0) warnings.push('No product images were detected; upload or paste image URLs before publishing.');
  if (description.length < 30) warnings.push('Description looks sparse; enrich it before publishing.');
  if (variants.length > 1) warnings.push(`Detected ${variants.length} variants (${options.map((o) => o.name).join(', ')}) — review option values and images before publishing.`);

  return {
    title,
    description,
    images,
    price,
    rawPriceText,
    supplierName: supplierName(),
    sourceUrl: location.href,
    confidence: images.length > 0 && title !== 'Imported Alibaba product' ? (price != null ? 'high' : 'medium') : 'low',
    warnings,
    options,
    variants,
  };
}
