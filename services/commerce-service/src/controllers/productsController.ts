import type { Response } from 'express';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { ProductCollectionDTO, ProductDTO, ProductListItemDTO, ProductPushResultDTO, StorePlatform } from '@zetsales/shared';
import {
  fetchShopifyProductCount,
  fetchShopifyProducts,
  createShopifyProduct,
  updateShopifyProduct,
  deleteShopifyProduct,
  fetchShopifyCollections,
  type ShopifyProduct,
} from '../integrations/shopifyClient.js';
import { getValidShopifyAccessToken } from '../integrations/shopifyAuth.js';
import { fetchWooProducts, createWooProduct, updateWooProduct, deleteWooProduct, fetchWooCategories } from '../integrations/wooClient.js';
import { mapShopifyProduct, mapWooProduct, type NormalizedProduct } from '../integrations/productMapper.js';
import { previewAlibabaProduct } from '../integrations/alibabaImporter.js';

// Strips protocol/www/trailing slash/query string and lowercases, so a pasted URL that differs
// from the stored one only cosmetically (https vs http, a tracking query param, a trailing slash)
// still matches on lookup. Stored on write (see upsertProduct) so findProductByUrl is a plain
// indexed equality match rather than a runtime-normalizing query.
export function normalizeProductUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\?.*$/, '')
    .replace(/\/$/, '');
}

export function uploadProductImages(req: AuthenticatedRequest, res: Response) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const base = `${process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce'}/uploads`;
  const urls = files.map((f) => `${base}/${f.filename}`);
  res.json({ success: true, urls });
}

function toProductDto(doc: any, ignoreInventory = false): ProductDTO {
  return {
    id: doc._id.toString(),
    storeId: doc.storeId,
    externalId: doc.externalId,
    title: doc.title,
    description: doc.description ?? null,
    category: doc.category ?? null,
    images: doc.images ?? (doc.image ? [doc.image] : []),
    weight: doc.weight ?? null,
    weightUnit: doc.weightUnit ?? 'kg',
    sourceUrl: doc.sourceUrl ?? null,
    sourcePlatform: doc.sourcePlatform ?? null,
    options: doc.options ?? [],
    variants: (doc.variants ?? []).map((v: any) => {
      const inventory = v.inventory == null ? null : Number(v.inventory);
      return {
        ...v,
        compareAtPrice: v.compareAtPrice ?? null,
        optionValues: v.optionValues ?? [],
        inventory: ignoreInventory || inventory == null || inventory < 0 ? null : inventory,
        continueSellingWhenOutOfStock: v.continueSellingWhenOutOfStock ?? true,
      };
    }),
    updatedAt: new Date(doc.updatedAt).toISOString(),
    groupId: doc.groupId ?? null,
  };
}

function toProductListItemDto(g: any): ProductListItemDTO {
  return {
    id: g.firstId.toString(),
    title: g.title,
    image: g.image,
    url: g.url ?? null,
    variantCount: g.variantCount,
    priceMin: g.minPrice,
    priceMax: g.maxPrice,
    totalStock: g.totalStock,
    trackedInventoryCount: g.trackedInventoryCount,
    updatedAt: new Date(g.updatedAt).toISOString(),
    groupId: g.groupId ?? null,
    storeIds: g.storeIds,
  };
}

// Finds another store's product with the same title (case-insensitive) so newly-imported
// products from different stores that are really the same item land in one groupId — which is
// what makes them show as a single row with multiple channel badges, and makes editing one edit
// all of them (same mechanism the multi-store "Add product" flow already relies on). Only run for
// brand-new products (see caller): a title changing later shouldn't silently re-group it.
async function findAutoGroupId(db: ReturnType<typeof getDb>, tenantId: string, storeId: string, title: string): Promise<string | undefined> {
  const match = await db
    .collection('products')
    .findOne({ tenantId, storeId: { $ne: storeId }, title }, { collation: { locale: 'en', strength: 2 } });
  if (!match) return undefined;
  if (match.groupId) return match.groupId as string;

  const newGroupId = randomUUID();
  await db.collection('products').updateOne({ _id: match._id }, { $set: { groupId: newGroupId } });
  return newGroupId;
}

// Every tenant's oldest warehouse is treated as their default landing spot for auto-tracked stock
// — created on the fly as "Main Warehouse" the first time a tenant has none at all, so a brand-new
// business never has to set one up before it can push its first product. Renaming it or adding a
// second warehouse and transferring stock over both already work through the normal Inventory UI.
interface WarehouseDoc {
  _id: string;
  tenantId: string;
  name: string;
  bins: string[];
  createdAt: Date;
  updatedAt: Date;
}

async function getOrCreateDefaultWarehouse(db: ReturnType<typeof getDb>, tenantId: string): Promise<{ id: string; name: string }> {
  const warehouses = db.collection<WarehouseDoc>('warehouses');
  const existing = await warehouses.findOne({ tenantId }, { sort: { createdAt: 1 } });
  if (existing) return { id: existing._id, name: existing.name };
  const now = new Date();
  const doc: WarehouseDoc = { _id: new ObjectId().toString(), tenantId, name: 'Main Warehouse', bins: [], createdAt: now, updatedAt: now };
  await warehouses.insertOne(doc);
  return { id: doc._id, name: doc.name };
}

// "Not tracked" and "tracked at 0" are deliberately treated differently everywhere else in the
// system (Stock Shortfall, the packing fulfillment gate, the per-line-item stock badge) — a
// variant with no inventoryLevels row at all silently bypasses all of them, since there's no number
// to check against. Giving every variant a real record the moment it's synced closes that gap: a
// genuinely out-of-stock item now reads as "0 free", not invisible. Only variants that aren't
// tracked *anywhere* yet get a new record — an edit to an already-tracked product never touches its
// existing stock numbers.
// Keyed by the same option-value signature reattachContinueSelling already uses to match a
// submitted variant back to its store-assigned one — a brand-new variant's real id isn't known
// until the store's create/update response comes back, so overrides can't be keyed by id yet.
type VariantQuantityOverride = { quantity: number; warehouseId?: string; bin?: string };

async function ensureVariantsTracked(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  productId: string,
  productTitle: string,
  productImage: string | null,
  variants: { id: string; sku: string | null; title: string; optionValues: string[]; inventory?: number | null }[],
  overrides?: Map<string, VariantQuantityOverride>
) {
  if (variants.length === 0) return;
  const variantIds = variants.map((v) => v.id);
  const existingLevels = await db
    .collection('inventoryLevels')
    .find({ tenantId, productId, variantId: { $in: variantIds } })
    .project({ variantId: 1 })
    .toArray();
  const tracked = new Set(existingLevels.map((l) => l.variantId));
  const untracked = variants.filter((v) => !tracked.has(v.id));
  if (untracked.length === 0) return;

  const defaultWarehouse = await getOrCreateDefaultWarehouse(db, tenantId);
  const warehouseCache = new Map<string, { id: string; name: string }>([[defaultWarehouse.id, defaultWarehouse]]);
  async function resolveWarehouse(id: string | undefined) {
    if (!id) return defaultWarehouse;
    if (warehouseCache.has(id)) return warehouseCache.get(id)!;
    const doc = await db.collection<WarehouseDoc>('warehouses').findOne({ _id: id, tenantId });
    const resolved = doc ? { id: doc._id, name: doc.name } : defaultWarehouse;
    warehouseCache.set(id, resolved);
    return resolved;
  }

  const now = new Date();
  const docs = [];
  for (const v of untracked) {
    const override = overrides?.get(v.optionValues.join('|'));
    const warehouse = await resolveWarehouse(override?.warehouseId);
    docs.push({
      tenantId,
      productId,
      variantId: v.id,
      sku: v.sku,
      productTitle,
      productImage,
      variantLabel: v.optionValues?.length ? v.optionValues.join(' / ') : v.title,
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      bin: override?.bin?.trim() || 'Unassigned',
      // Priority: an explicit quantity entered in the Add Product form, then the platform's own
      // reported count when it's actually tracking stock (Shopify with inventory managed by
      // Shopify, a WooCommerce product/variation with stock management on), then 0.
      onHand: override?.quantity ?? v.inventory ?? 0,
      reserved: 0,
      inbound: 0,
      unitCost: null,
      pendingUnitCost: null,
      reorderPoint: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  await db.collection('inventoryLevels').insertMany(docs);
}

async function upsertProduct(tenantId: string, storeId: string, p: NormalizedProduct, groupId?: string, quantityOverrides?: Map<string, VariantQuantityOverride>) {
  const db = getDb();
  const now = new Date();
  const existing = await db.collection('products').findOne({ tenantId, storeId, externalId: p.externalId });
  const resolvedGroupId = groupId ?? existing?.groupId ?? (existing ? undefined : await findAutoGroupId(db, tenantId, storeId, p.title));

  const result = await db.collection('products').findOneAndUpdate(
    { tenantId, storeId, externalId: p.externalId },
    {
      $set: {
        title: p.title,
        description: p.description,
        category: p.category,
        url: p.url,
        urlNormalized: p.url ? normalizeProductUrl(p.url) : null,
        images: p.images,
        image: p.images[0] ?? null,
        weight: p.weight ?? null,
        weightUnit: p.weightUnit ?? 'kg',
        sourceUrl: p.sourceUrl ?? null,
        sourcePlatform: p.sourcePlatform ?? null,
        storeCollections: p.storeCollections ?? [],
        options: p.options,
        variants: p.variants,
        updatedAt: now,
        ...(resolvedGroupId ? { groupId: resolvedGroupId } : {}),
      },
      $setOnInsert: { tenantId, storeId, externalId: p.externalId, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  const productId = result!._id.toString();
  await ensureVariantsTracked(db, tenantId, productId, p.title, p.images[0] ?? null, p.variants, quantityOverrides);
  return productId;
}

// Called from the Shopify products/create and products/update webhooks so newly added or edited
// products flow in automatically after the initial import, without the merchant re-clicking Import.
export async function upsertShopifyProductFromWebhook(tenantId: string, storeId: string, shopDomain: string, product: ShopifyProduct) {
  const db = getDb();
  await upsertProduct(tenantId, storeId, mapShopifyProduct(product, shopDomain));
  const productCount = await db.collection('products').countDocuments({ tenantId, storeId });
  await db.collection('stores').updateOne({ _id: new ObjectId(storeId) }, { $set: { productCount } });
}

// Called from the Shopify products/delete webhook so a product removed directly in Shopify's
// admin (outside ZetSales) doesn't linger here as a ghost record — only removes this store's own
// copy, leaving any matched copies on other stores untouched.
export async function deleteShopifyProductFromWebhook(tenantId: string, storeId: string, externalId: string) {
  const db = getDb();
  await db.collection('products').deleteOne({ tenantId, storeId, externalId: String(externalId) });
  const productCount = await db.collection('products').countDocuments({ tenantId, storeId });
  await db.collection('stores').updateOne({ _id: new ObjectId(storeId) }, { $set: { productCount } });
}

// Streams import progress live via Server-Sent Events instead of one long blocking request, so
// the UI can show a real "N of Total imported" counter (and the product currently being pulled
// in) rather than a spinner with no idea how far along it is.
export async function importStoreProductsStream(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const store = await db.collection('stores').findOne({ _id: new ObjectId(req.params.storeId), tenantId: req.user!.tenantId });
  if (!store) {
    res.status(404).json({ success: false, message: 'Store not found' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  let cancelled = false;
  req.on('close', () => {
    cancelled = true;
  });

  const storeId = store._id.toString();
  let imported = 0;

  try {
    if (store.platform === 'shopify') {
      const accessToken = await getValidShopifyAccessToken(store);
      const total = await fetchShopifyProductCount(store.shopDomain, accessToken);
      send({ type: 'start', total });

      let pageInfo: string | null | undefined;
      do {
        const { products, nextPageInfo } = await fetchShopifyProducts(store.shopDomain, accessToken, pageInfo || undefined);
        for (const p of products) {
          if (cancelled) break;
          await upsertProduct(store.tenantId, storeId, mapShopifyProduct(p, store.shopDomain));
          imported += 1;
          send({ type: 'progress', imported, total, title: p.title });
        }
        pageInfo = cancelled ? null : nextPageInfo;
      } while (pageInfo && !cancelled);
    } else {
      const consumerKey = decryptSecret(store.credentials.consumerKey);
      const consumerSecret = decryptSecret(store.credentials.consumerSecret);
      let page = 1;
      let total: number | null = null;
      let batchLength = 0;

      do {
        const result = await fetchWooProducts(store.shopDomain, consumerKey, consumerSecret, page);
        batchLength = result.products.length;
        if (total === null) {
          total = result.total;
          send({ type: 'start', total: total ?? batchLength });
        }
        for (const p of result.products) {
          if (cancelled) break;
          await upsertProduct(store.tenantId, storeId, await mapWooProduct(p, store.shopDomain, consumerKey, consumerSecret));
          imported += 1;
          send({ type: 'progress', imported, total: total ?? imported, title: p.name });
        }
        page += 1;
      } while (!cancelled && batchLength === 50 && (total === null || imported < total));
    }

    if (cancelled) return;

    const productCount = await db.collection('products').countDocuments({ tenantId: store.tenantId, storeId });
    await db.collection('stores').updateOne({ _id: store._id }, { $set: { lastSyncedAt: new Date(), productCount } });

    send({ type: 'done', imported, productCount });
  } catch (err) {
    send({ type: 'error', message: `Import failed: ${(err as Error).message}` });
  } finally {
    res.end();
  }
}

const SORT_FIELD_MAP: Record<string, string> = {
  title: 'title',
  updated: 'updatedAt',
  price: 'minPrice',
  stock: 'totalStock',
};

export async function listProducts(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const match: Record<string, unknown> = { tenantId };
  if (typeof req.query.storeId === 'string' && req.query.storeId !== 'all') match.storeId = req.query.storeId;

  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(escaped, 'i');
    match.$or = [{ title: re }, { 'variants.sku': re }];
  }

  const sortKey = typeof req.query.sortKey === 'string' && req.query.sortKey in SORT_FIELD_MAP ? req.query.sortKey : 'updated';
  const sortDir = req.query.sortDir === 'asc' ? 1 : -1;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
  const shopifyStoreIds = (
    await db.collection('stores').find({ tenantId, platform: 'shopify' }).project({ _id: 1 }).toArray()
  ).map((store) => store._id.toString());

  // Products sharing a groupId (the same item listed on several stores) collapse into one row
  // here, so the list shows it once with a channel badge per store instead of one row per store.
  const pipeline = [
    { $match: match },
    {
      $addFields: {
        minPrice: { $ifNull: [{ $min: '$variants.price' }, 0] },
        maxPrice: { $ifNull: [{ $max: '$variants.price' }, 0] },
        stock: {
          $cond: [
            { $in: ['$storeId', shopifyStoreIds] },
            0,
            {
              $sum: {
                $map: {
                  input: '$variants',
                  as: 'variant',
                  in: { $max: [{ $ifNull: ['$$variant.inventory', 0] }, 0] },
                },
              },
            },
          ],
        },
        trackedInventoryCount: {
          $cond: [
            { $in: ['$storeId', shopifyStoreIds] },
            0,
            {
              $size: {
                $filter: {
                  input: '$variants',
                  as: 'variant',
                  cond: { $gte: ['$$variant.inventory', 0] },
                },
              },
            },
          ],
        },
      },
    },
    { $sort: { updatedAt: -1 } },
    {
      $group: {
        _id: { $ifNull: ['$groupId', { $toString: '$_id' }] },
        firstId: { $first: '$_id' },
        title: { $first: '$title' },
        image: { $first: '$image' },
        url: { $first: '$url' },
        variantCount: { $sum: { $size: '$variants' } },
        minPrice: { $min: '$minPrice' },
        maxPrice: { $max: '$maxPrice' },
        totalStock: { $sum: '$stock' },
        trackedInventoryCount: { $sum: '$trackedInventoryCount' },
        updatedAt: { $max: '$updatedAt' },
        groupId: { $first: '$groupId' },
        storeIds: { $addToSet: '$storeId' },
      },
    },
    { $sort: { [SORT_FIELD_MAP[sortKey]]: sortDir } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await db.collection('products').aggregate(pipeline).toArray();
  const products = (result?.data ?? []).map(toProductListItemDto);
  const total = result?.totalCount?.[0]?.count ?? 0;

  res.json({ success: true, products, total, page, pageSize });
}

// Reverse lookup for the Ad Performance campaign wizard: given a pasted destination URL, find the
// product it belongs to (if any) so the wizard can auto-select it. Deliberately returns just
// {id, title} — the wizard's ProductPicker only needs enough to set its own selected value, not
// the full ProductListItemDTO.
export async function findProductByUrl(req: AuthenticatedRequest, res: Response) {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  if (!url.trim()) {
    res.json({ success: true, product: null });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const product = await db.collection('products').findOne({ tenantId, urlNormalized: normalizeProductUrl(url) }, { projection: { title: 1 } });
  res.json({ success: true, product: product ? { id: product._id.toString(), title: product.title } : null });
}

export async function listStoreProductCollections(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const ids = typeof req.query.storeIds === 'string' ? req.query.storeIds.split(',').map((id) => id.trim()).filter(Boolean) : [];
  const stores = await db
    .collection('stores')
    .find({ tenantId, ...(ids.length ? { _id: { $in: ids.map((id) => new ObjectId(id)) } } : {}) })
    .toArray();

  const collections: ProductCollectionDTO[] = [];
  for (const store of stores) {
    try {
      if (store.platform === 'shopify') {
        const accessToken = await getValidShopifyAccessToken(store);
        const rows = await fetchShopifyCollections(store.shopDomain, accessToken);
        collections.push(...rows.map((c) => ({ ...c, storeId: store._id.toString(), platform: 'shopify' as const })));
      } else {
        const consumerKey = decryptSecret(store.credentials.consumerKey);
        const consumerSecret = decryptSecret(store.credentials.consumerSecret);
        const rows = await fetchWooCategories(store.shopDomain, consumerKey, consumerSecret);
        collections.push(...rows.map((c) => ({ ...c, storeId: store._id.toString(), platform: 'woocommerce' as const })));
      }
    } catch (err) {
      collections.push({
        id: `__error__:${store._id.toString()}`,
        storeId: store._id.toString(),
        platform: store.platform as StorePlatform,
        name: `Could not load collections: ${(err as Error).message}`,
        handle: null,
      });
    }
  }

  res.json({ success: true, collections });
}

const alibabaPreviewSchema = z.object({ url: z.string().trim().url() });

export async function previewAlibabaImport(req: AuthenticatedRequest, res: Response) {
  const parsed = alibabaPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A valid Alibaba product URL is required' });
    return;
  }

  try {
    const draft = await previewAlibabaProduct(parsed.data.url);
    const withSkus = await fillMissingSkus(req.user!.tenantId!, { ...draft, weightUnit: draft.weightUnit ?? 'kg' });
    res.json({ success: true, draft: { ...draft, variants: withSkus.variants } });
  } catch (err) {
    res.status(400).json({ success: false, message: (err as Error).message });
  }
}

const productOptionSchema = z.object({
  name: z.string().trim().min(1),
  values: z.array(z.string().trim().min(1)).min(1),
});

const productVariantInputSchema = z.object({
  sku: z.string().trim().optional(),
  price: z.number().nonnegative(),
  compareAtPrice: z.number().nonnegative().optional(),
  optionValues: z.array(z.string()),
  continueSellingWhenOutOfStock: z.boolean().optional(),
  image: z.string().trim().url().optional().nullable(),
  // Only meaningful on create (see createProductSchema) — an explicit starting stock count entered
  // in the Add Product form, as opposed to the 0/platform-reported default every variant otherwise
  // gets (see ensureVariantsTracked).
  initialQuantity: z.number().nonnegative().optional(),
});

const productPublishTargetSchema = z.object({
  storeId: z.string().trim().min(1),
  collectionIds: z.array(z.string().trim().min(1)).optional().default([]),
});

const productBaseFields = {
  title: z.string().trim().min(1),
  description: z.string().trim().optional().or(z.literal('')),
  category: z.string().trim().optional().or(z.literal('')),
  images: z.array(z.string().trim().url()).max(10).default([]),
  weight: z.number().positive().optional(),
  weightUnit: z.enum(['kg', 'g', 'lb', 'oz']).default('kg'),
  sourceUrl: z.string().trim().url().optional(),
  sourcePlatform: z.enum(['alibaba', 'manual', 'shopify', 'woocommerce']).optional(),
  options: z.array(productOptionSchema).max(3).default([]),
  variants: z.array(productVariantInputSchema).min(1),
};

// Shared validity check (variant/option shapes must line up, no duplicate combinations) applied to
// both schemas below — a plain function rather than a generic `.refine()` helper, since a schema
// can't be `.extend()`-ed anymore once `.refine()` has been applied to it.
function variantsMatchOptions(d: { options: { values: string[] }[]; variants: { optionValues: string[] }[] }) {
  return (
    d.variants.every((v) => v.optionValues.length === d.options.length) &&
    new Set(d.variants.map((v) => v.optionValues.join(' '))).size === d.variants.length
  );
}
const variantCheckMessage = { message: 'Each variant must specify a unique value for every option' };

const productWriteSchema = z.object(productBaseFields).refine(variantsMatchOptions, variantCheckMessage);
const createProductSchema = z
  .object({
    ...productBaseFields,
    storeIds: z.array(z.string()).optional(),
    storeTargets: z.array(productPublishTargetSchema).optional(),
    // Where a variant's initialQuantity (above) actually lands. Both optional — omitting them
    // falls back to the tenant's default warehouse and bin 'Unassigned', same as auto-tracking.
    warehouseId: z.string().trim().optional(),
    bin: z.string().trim().optional(),
  })
  .refine((data) => Boolean(data.storeTargets?.length || data.storeIds?.length), { message: 'At least one store is required' })
  .refine(variantsMatchOptions, variantCheckMessage);

// Short-lived handoff used by the browser extension: it extracts a draft from the live Alibaba
// page DOM (bypassing the server-side scraper entirely, since that's what gets CAPTCHA'd) and
// hands it to the web app via this pending-draft pointer instead of duplicating the review/publish
// UI inside the extension itself.
const pendingImportDraftSchema = z
  .object({
    ...productBaseFields,
    supplierName: z.string().trim().optional().nullable(),
    rawPriceText: z.string().trim().optional().nullable(),
    confidence: z.enum(['high', 'medium', 'low']).default('low'),
    warnings: z.array(z.string()).default([]),
  })
  .refine(variantsMatchOptions, variantCheckMessage);

export async function createPendingImportDraft(req: AuthenticatedRequest, res: Response) {
  const parsed = pendingImportDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Invalid product draft' });
    return;
  }

  const tenantId = req.user!.tenantId!;
  const withSkus = await fillMissingSkus(tenantId, parsed.data);
  const db = getDb();
  const { insertedId } = await db.collection('pendingImportDrafts').insertOne({
    ...withSkus,
    supplierName: parsed.data.supplierName ?? null,
    rawPriceText: parsed.data.rawPriceText ?? null,
    confidence: parsed.data.confidence,
    warnings: parsed.data.warnings,
    tenantId,
    createdAt: new Date(),
  });
  res.json({ success: true, id: insertedId.toString() });
}

export async function getPendingImportDraft(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    res.status(404).json({ success: false, message: 'Import draft not found or expired' });
    return;
  }

  const db = getDb();
  const doc = await db.collection('pendingImportDrafts').findOneAndDelete({ _id: new ObjectId(id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Import draft not found or expired' });
    return;
  }

  const { _id, tenantId: _tenantId, createdAt, ...draft } = doc;
  res.json({ success: true, draft });
}

type ProductWriteData = z.infer<z.ZodObject<typeof productBaseFields>>;

function toPushInput(data: ProductWriteData) {
  return {
    title: data.title,
    description: data.description || null,
    category: data.category || null,
    images: data.images,
    weight: data.weight ?? null,
    weightUnit: data.weightUnit ?? 'kg',
    options: data.options,
    variants: data.variants.map((v) => ({ sku: v.sku || null, price: v.price, compareAtPrice: v.compareAtPrice ?? null, optionValues: v.optionValues, image: v.image ?? null })),
  };
}

type ProductPushInput = ReturnType<typeof toPushInput>;
type ExistingProductForPush = { externalId: string; variants: { id: string; sku: string | null; optionValues: string[] }[] };

// continueSellingWhenOutOfStock is a ZetSales-only policy — Shopify/WooCommerce don't know about
// it, so it's deliberately left out of toPushInput and never round-trips through the store's API.
// This re-attaches whatever was actually submitted onto the store's response, matched by each
// variant's option-value signature (the same uniqueness key variantsMatchOptions already uses).
function reattachContinueSelling(normalized: NormalizedProduct, submittedVariants: ProductWriteData['variants']): NormalizedProduct {
  const bySignature = new Map(submittedVariants.map((v) => [v.optionValues.join('|'), v.continueSellingWhenOutOfStock ?? true]));
  return {
    ...normalized,
    variants: normalized.variants.map((v) => ({
      ...v,
      continueSellingWhenOutOfStock: bySignature.get(v.optionValues.join('|')) ?? true,
    })),
  };
}

async function pushToStore(store: any, input: ProductPushInput, collectionIds: string[] = [], existing?: ExistingProductForPush) {
  if (store.platform === 'shopify') {
    const accessToken = await getValidShopifyAccessToken(store);
    const product = existing
      ? await updateShopifyProduct(store.shopDomain, accessToken, existing.externalId, input, existing.variants, collectionIds)
      : await createShopifyProduct(store.shopDomain, accessToken, input, collectionIds);
    return mapShopifyProduct(product, store.shopDomain);
  }

  const consumerKey = decryptSecret(store.credentials.consumerKey);
  const consumerSecret = decryptSecret(store.credentials.consumerSecret);
  const product = existing
    ? await updateWooProduct(store.shopDomain, consumerKey, consumerSecret, existing.externalId, input, collectionIds)
    : await createWooProduct(store.shopDomain, consumerKey, consumerSecret, input, collectionIds);
  return mapWooProduct(product, store.shopDomain, consumerKey, consumerSecret);
}

// axios's own error message ("Request failed with status code 400") hides the actual reason the
// store's API rejected the request. WooCommerce puts it in response.data.message (e.g. duplicate
// SKU, invalid image); Shopify puts it in response.data.errors (a string, or an object/array keyed
// by field). Fall back to the generic message only when neither shape is present.
function describeStoreError(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data) {
    const data = err.response.data as { message?: string; errors?: unknown };
    if (typeof data.message === 'string' && data.message) return data.message;
    if (data.errors) return typeof data.errors === 'string' ? data.errors : JSON.stringify(data.errors);
  }
  return (err as Error).message;
}

function skuPart(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/\s+/)
    .map((part) => part.slice(0, 4).toUpperCase())
    .filter(Boolean)
    .join('-');
}

async function fillMissingSkus(tenantId: string, data: ProductWriteData): Promise<ProductWriteData> {
  const db = getDb();
  const used = new Set<string>();
  const existing = await db.collection('products').find({ tenantId, 'variants.sku': { $nin: [null, ''] } }).project({ 'variants.sku': 1 }).toArray();
  for (const product of existing) {
    for (const variant of product.variants ?? []) {
      if (variant.sku) used.add(String(variant.sku).toUpperCase());
    }
  }

  const base = skuPart(data.title).slice(0, 18) || 'ITEM';
  let serial = 1;
  const nextSku = (optionValues: string[]) => {
    const optionPart = optionValues.map(skuPart).filter(Boolean).join('-').slice(0, 24);
    let candidate = [base, optionPart, String(serial).padStart(3, '0')].filter(Boolean).join('-');
    serial += 1;
    while (used.has(candidate.toUpperCase())) {
      candidate = [base, optionPart, String(serial).padStart(3, '0')].filter(Boolean).join('-');
      serial += 1;
    }
    used.add(candidate.toUpperCase());
    return candidate;
  };

  return {
    ...data,
    variants: data.variants.map((v) => ({ ...v, sku: v.sku?.trim() || nextSku(v.optionValues) })),
  };
}

function withSubmittedMetadata(normalized: NormalizedProduct, data: ProductWriteData, sourcePlatform?: ProductWriteData['sourcePlatform'], sourceUrl?: string, collectionIds: string[] = []): NormalizedProduct {
  return {
    ...normalized,
    weight: data.weight ?? null,
    weightUnit: data.weightUnit ?? 'kg',
    sourceUrl: sourceUrl ?? data.sourceUrl ?? normalized.sourceUrl ?? null,
    sourcePlatform: sourcePlatform ?? data.sourcePlatform ?? normalized.sourcePlatform ?? 'manual',
    storeCollections: collectionIds,
  };
}

// Creating a product from ZetSales fans it out to every selected store at once (any mix of
// Shopify/WooCommerce). Each store gets its own product document tied together by a shared
// groupId, so editing later can find and update every copy in one action. Streamed via SSE (like
// importStoreProductsStream) rather than one blocking response: each store push is several
// sequential round-trips to that store's API, so a multi-store product can take tens of seconds —
// the client needs per-store events to show real progress instead of a single opaque wait.
export async function createProduct(req: AuthenticatedRequest, res: Response) {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'title, price and at least one storeId are required' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { storeIds, storeTargets, warehouseId, bin, ...rawData } = parsed.data;
  const data = await fillMissingSkus(tenantId, rawData);
  const targets = storeTargets?.length ? storeTargets : (storeIds ?? []).map((storeId) => ({ storeId, collectionIds: [] }));
  const targetByStoreId = new Map(targets.map((target) => [target.storeId, target.collectionIds ?? []]));
  const input = toPushInput(data);
  const stores = await db.collection('stores').find({ tenantId, _id: { $in: targets.map((target) => new ObjectId(target.storeId)) } }).toArray();

  if (stores.length === 0) {
    res.status(404).json({ success: false, message: 'No matching stores found' });
    return;
  }

  // Keyed by option-value signature (see ensureVariantsTracked) so it can be matched back to
  // whichever real variant id each store assigns once the push actually completes.
  const quantityOverridesEntries = data.variants
    .filter((v) => v.initialQuantity != null)
    .map((v) => [v.optionValues.join('|'), { quantity: v.initialQuantity!, warehouseId, bin }] as const);
  const quantityOverrides = quantityOverridesEntries.length > 0 ? new Map(quantityOverridesEntries) : undefined;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  send({ type: 'start', total: stores.length });

  const groupId = randomUUID();
  const results: ProductPushResultDTO[] = [];

  for (const store of stores) {
    const storeId = store._id.toString();
    const displayName = store.displayName;
    const platform = store.platform as StorePlatform;
    send({ type: 'store:start', storeId, displayName, platform });
    try {
      const collectionIds = targetByStoreId.get(storeId) ?? [];
      const normalized = withSubmittedMetadata(reattachContinueSelling(await pushToStore(store, input, collectionIds), data.variants), data, data.sourcePlatform, data.sourceUrl, collectionIds);
      const productId = await upsertProduct(tenantId, storeId, normalized, groupId, quantityOverrides);
      const result: ProductPushResultDTO = { storeId, displayName, platform, success: true, productId };
      results.push(result);
      send({ type: 'store:done', ...result });
    } catch (err) {
      const result: ProductPushResultDTO = { storeId, displayName, platform, success: false, error: describeStoreError(err) };
      results.push(result);
      send({ type: 'store:done', ...result });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  await db.collection('stores').updateMany(
    { _id: { $in: stores.filter((s) => results.find((r) => r.storeId === s._id.toString())?.success).map((s) => s._id) } },
    { $inc: { productCount: 1 } }
  );

  send({ type: 'done', success: successCount > 0, results });
  res.end();
}

export async function getProduct(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const doc = await db.collection('products').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Product not found' });
    return;
  }

  let siblings: { storeId: string; displayName: string; platform: StorePlatform }[] = [];
  if (doc.groupId) {
    const siblingDocs = await db
      .collection('products')
      .find({ tenantId, groupId: doc.groupId, _id: { $ne: doc._id } })
      .toArray();
    const storeIds = siblingDocs.map((d) => new ObjectId(d.storeId));
    const stores = await db.collection('stores').find({ _id: { $in: storeIds } }).toArray();
    const storeMap = new Map(stores.map((s) => [s._id.toString(), s]));
    siblings = siblingDocs
      .map((d) => {
        const store = storeMap.get(d.storeId);
        return store ? { storeId: d.storeId, displayName: store.displayName, platform: store.platform as StorePlatform } : null;
      })
      .filter((s): s is { storeId: string; displayName: string; platform: StorePlatform } => Boolean(s));
  }

  const ownStoreDoc = await db.collection('stores').findOne({ _id: new ObjectId(doc.storeId) });
  const ownStore = ownStoreDoc ? { storeId: doc.storeId, displayName: ownStoreDoc.displayName, platform: ownStoreDoc.platform as StorePlatform } : null;

  res.json({ success: true, product: toProductDto(doc, ownStore?.platform === 'shopify'), ownStore, siblings });
}

// Editing a product updates every store copy sharing its groupId (created together via the
// "Add product" flow), not just the one it was opened from — that's the whole point of a
// centralized edit for a product that lives on several stores at once.
export async function updateProduct(req: AuthenticatedRequest, res: Response) {
  const parsed = productWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'title and at least one variant are required' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const data = await fillMissingSkus(tenantId, parsed.data);
  const doc = await db.collection('products').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Product not found' });
    return;
  }

  const targets = doc.groupId ? await db.collection('products').find({ tenantId, groupId: doc.groupId }).toArray() : [doc];
  const input = toPushInput(data);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
  send({ type: 'start', total: targets.length });

  const results: ProductPushResultDTO[] = [];

  for (const target of targets) {
    const store = await db.collection('stores').findOne({ _id: new ObjectId(target.storeId), tenantId });
    if (!store) {
      const result: ProductPushResultDTO = { storeId: target.storeId, displayName: 'Unknown store', platform: 'shopify', success: false, error: 'Store no longer connected' };
      results.push(result);
      send({ type: 'store:done', ...result });
      continue;
    }
    const storeId = store._id.toString();
    const displayName = store.displayName;
    const platform = store.platform as StorePlatform;
    send({ type: 'store:start', storeId, displayName, platform });
    try {
      const existing = {
        externalId: target.externalId,
        variants: (target.variants ?? []).map((v: any) => ({ id: v.id, sku: v.sku ?? null, optionValues: v.optionValues ?? [] })),
      };
      const normalized = withSubmittedMetadata(reattachContinueSelling(await pushToStore(store, input, target.storeCollections ?? [], existing), data.variants), data, data.sourcePlatform ?? target.sourcePlatform, data.sourceUrl ?? target.sourceUrl, target.storeCollections ?? []);
      await db.collection('products').updateOne(
        { _id: target._id },
        {
          $set: {
            title: normalized.title,
            description: normalized.description,
            category: normalized.category,
            images: normalized.images,
            image: normalized.images[0] ?? null,
            weight: normalized.weight ?? null,
            weightUnit: normalized.weightUnit ?? 'kg',
            sourceUrl: normalized.sourceUrl ?? null,
            sourcePlatform: normalized.sourcePlatform ?? null,
            options: normalized.options,
            variants: normalized.variants,
            updatedAt: new Date(),
          },
        }
      );
      const result: ProductPushResultDTO = { storeId, displayName, platform, success: true };
      results.push(result);
      send({ type: 'store:done', ...result });
    } catch (err) {
      const result: ProductPushResultDTO = { storeId, displayName, platform, success: false, error: describeStoreError(err) };
      results.push(result);
      send({ type: 'store:done', ...result });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  send({ type: 'done', success: successCount > 0, results });
  res.end();
}

const deleteProductSchema = z.object({ storeIds: z.array(z.string()).min(1) });

// Deletion is per-store and explicit — the caller picks which of the product's connected stores
// to remove it from (defaulting to all in the UI), rather than always nuking every copy.
export async function deleteProduct(req: AuthenticatedRequest, res: Response) {
  const parsed = deleteProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'At least one storeId is required' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const doc = await db.collection('products').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Product not found' });
    return;
  }

  const groupDocs = doc.groupId ? await db.collection('products').find({ tenantId, groupId: doc.groupId }).toArray() : [doc];
  const targets = groupDocs.filter((d) => parsed.data.storeIds.includes(d.storeId));

  if (targets.length === 0) {
    res.status(400).json({ success: false, message: 'None of the selected stores match this product' });
    return;
  }

  const results: ProductPushResultDTO[] = [];

  for (const target of targets) {
    const store = await db.collection('stores').findOne({ _id: new ObjectId(target.storeId), tenantId });
    if (!store) {
      results.push({ storeId: target.storeId, displayName: 'Unknown store', platform: 'shopify', success: false, error: 'Store no longer connected' });
      continue;
    }
    try {
      try {
        if (store.platform === 'shopify') {
          const accessToken = await getValidShopifyAccessToken(store);
          await deleteShopifyProduct(store.shopDomain, accessToken, target.externalId);
        } else {
          const consumerKey = decryptSecret(store.credentials.consumerKey);
          const consumerSecret = decryptSecret(store.credentials.consumerSecret);
          await deleteWooProduct(store.shopDomain, consumerKey, consumerSecret, target.externalId);
        }
      } catch (err) {
        // Already gone on the platform (e.g. deleted directly in the Shopify/WooCommerce admin)
        // — treat that as success so the local ghost record still gets cleaned up here, instead
        // of leaving the merchant stuck unable to remove a product ZetSales can't find upstream.
        const alreadyGone = axios.isAxiosError(err) && err.response?.status === 404;
        if (!alreadyGone) throw err;
      }
      await db.collection('products').deleteOne({ _id: target._id });
      await db.collection('stores').updateOne({ _id: store._id }, { $inc: { productCount: -1 } });
      results.push({ storeId: store._id.toString(), displayName: store.displayName, platform: store.platform as StorePlatform, success: true });
    } catch (err) {
      results.push({ storeId: store._id.toString(), displayName: store.displayName, platform: store.platform as StorePlatform, success: false, error: (err as Error).message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  res.json({ success: successCount > 0, results });
}
