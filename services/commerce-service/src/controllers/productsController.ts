import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import { decryptSecret } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { ProductDTO, ProductPushResultDTO, StorePlatform } from '@zetsales/shared';
import { fetchShopifyProductCount, fetchShopifyProducts, createShopifyProduct, updateShopifyProduct, deleteShopifyProduct } from '../integrations/shopifyClient.js';
import { getValidShopifyAccessToken } from '../integrations/shopifyAuth.js';
import { fetchWooProducts, createWooProduct, updateWooProduct, deleteWooProduct } from '../integrations/wooClient.js';
import { mapShopifyProduct, mapWooProduct, type NormalizedProduct } from '../integrations/productMapper.js';

function toProductDto(doc: any): ProductDTO {
  return {
    id: doc._id.toString(),
    storeId: doc.storeId,
    externalId: doc.externalId,
    title: doc.title,
    image: doc.image,
    variants: doc.variants,
    updatedAt: new Date(doc.updatedAt).toISOString(),
    groupId: doc.groupId ?? null,
  };
}

async function upsertProduct(tenantId: string, storeId: string, p: NormalizedProduct, groupId?: string) {
  const db = getDb();
  const now = new Date();
  const result = await db.collection('products').findOneAndUpdate(
    { tenantId, storeId, externalId: p.externalId },
    {
      $set: { title: p.title, image: p.image, variants: p.variants, updatedAt: now, ...(groupId ? { groupId } : {}) },
      $setOnInsert: { tenantId, storeId, externalId: p.externalId, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' }
  );
  return result!._id.toString();
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
          await upsertProduct(store.tenantId, storeId, mapShopifyProduct(p));
          imported += 1;
          send({ type: 'progress', imported, total, title: p.title });
        }
        pageInfo = cancelled ? null : nextPageInfo;
      } while (pageInfo && imported < 1000);
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
          await upsertProduct(store.tenantId, storeId, mapWooProduct(p));
          imported += 1;
          send({ type: 'progress', imported, total: total ?? imported, title: p.name });
        }
        page += 1;
      } while (!cancelled && batchLength === 50 && imported < 1000);
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

  const pipeline = [
    { $match: match },
    { $addFields: { minPrice: { $min: '$variants.price' }, totalStock: { $sum: '$variants.inventory' } } },
    { $sort: { [SORT_FIELD_MAP[sortKey]]: sortDir } },
    {
      $facet: {
        data: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await db.collection('products').aggregate(pipeline).toArray();
  const products = (result?.data ?? []).map(toProductDto);
  const total = result?.totalCount?.[0]?.count ?? 0;

  res.json({ success: true, products, total, page, pageSize });
}

const productWriteSchema = z.object({
  title: z.string().trim().min(1),
  image: z.string().trim().url().optional().or(z.literal('')),
  price: z.number().nonnegative(),
  sku: z.string().trim().optional().or(z.literal('')),
  inventory: z.number().int().nonnegative().optional(),
});

const createProductSchema = productWriteSchema.extend({
  storeIds: z.array(z.string()).min(1),
});

async function pushToStore(store: any, input: { title: string; image?: string | null; price: number; sku?: string | null; inventory?: number | null }, existingExternalId?: string, existingVariantId?: string) {
  if (store.platform === 'shopify') {
    const accessToken = await getValidShopifyAccessToken(store);
    const product = existingExternalId
      ? await updateShopifyProduct(store.shopDomain, accessToken, existingExternalId, existingVariantId!, input)
      : await createShopifyProduct(store.shopDomain, accessToken, input);
    return mapShopifyProduct(product);
  }

  const consumerKey = decryptSecret(store.credentials.consumerKey);
  const consumerSecret = decryptSecret(store.credentials.consumerSecret);
  const product = existingExternalId
    ? await updateWooProduct(store.shopDomain, consumerKey, consumerSecret, existingExternalId, input)
    : await createWooProduct(store.shopDomain, consumerKey, consumerSecret, input);
  return mapWooProduct(product);
}

// Creating a product from ZetSales fans it out to every selected store at once (any mix of
// Shopify/WooCommerce). Each store gets its own product document tied together by a shared
// groupId, so editing later can find and update every copy in one action.
export async function createProduct(req: AuthenticatedRequest, res: Response) {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'title, price and at least one storeId are required' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { storeIds, ...input } = parsed.data;
  const stores = await db.collection('stores').find({ tenantId, _id: { $in: storeIds.map((id) => new ObjectId(id)) } }).toArray();

  if (stores.length === 0) {
    res.status(404).json({ success: false, message: 'No matching stores found' });
    return;
  }

  const groupId = randomUUID();
  const results: ProductPushResultDTO[] = [];

  for (const store of stores) {
    try {
      const normalized = await pushToStore(store, { ...input, image: input.image || null, sku: input.sku || null, inventory: input.inventory ?? null });
      const productId = await upsertProduct(tenantId, store._id.toString(), normalized, groupId);
      results.push({ storeId: store._id.toString(), displayName: store.displayName, platform: store.platform as StorePlatform, success: true, productId });
    } catch (err) {
      results.push({
        storeId: store._id.toString(),
        displayName: store.displayName,
        platform: store.platform as StorePlatform,
        success: false,
        error: (err as Error).message,
      });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  await db.collection('stores').updateMany(
    { _id: { $in: stores.filter((s) => results.find((r) => r.storeId === s._id.toString())?.success).map((s) => s._id) } },
    { $inc: { productCount: 1 } }
  );

  res.json({ success: successCount > 0, results });
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

  res.json({ success: true, product: toProductDto(doc), ownStore, siblings });
}

// Editing a product updates every store copy sharing its groupId (created together via the
// "Add product" flow), not just the one it was opened from — that's the whole point of a
// centralized edit for a product that lives on several stores at once.
export async function updateProduct(req: AuthenticatedRequest, res: Response) {
  const parsed = productWriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'title and price are required' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const doc = await db.collection('products').findOne({ _id: new ObjectId(req.params.id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Product not found' });
    return;
  }

  const targets = doc.groupId ? await db.collection('products').find({ tenantId, groupId: doc.groupId }).toArray() : [doc];
  const input = { ...parsed.data, image: parsed.data.image || null, sku: parsed.data.sku || null, inventory: parsed.data.inventory ?? null };
  const results: ProductPushResultDTO[] = [];

  for (const target of targets) {
    const store = await db.collection('stores').findOne({ _id: new ObjectId(target.storeId), tenantId });
    if (!store) {
      results.push({ storeId: target.storeId, displayName: 'Unknown store', platform: 'shopify', success: false, error: 'Store no longer connected' });
      continue;
    }
    try {
      const variantId = target.variants?.[0]?.id;
      const normalized = await pushToStore(store, input, target.externalId, variantId);
      await db.collection('products').updateOne(
        { _id: target._id },
        { $set: { title: normalized.title, image: normalized.image, variants: normalized.variants, updatedAt: new Date() } }
      );
      results.push({ storeId: store._id.toString(), displayName: store.displayName, platform: store.platform as StorePlatform, success: true });
    } catch (err) {
      results.push({ storeId: store._id.toString(), displayName: store.displayName, platform: store.platform as StorePlatform, success: false, error: (err as Error).message });
    }
  }

  const successCount = results.filter((r) => r.success).length;
  res.json({ success: successCount > 0, results });
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
      if (store.platform === 'shopify') {
        const accessToken = await getValidShopifyAccessToken(store);
        await deleteShopifyProduct(store.shopDomain, accessToken, target.externalId);
      } else {
        const consumerKey = decryptSecret(store.credentials.consumerKey);
        const consumerSecret = decryptSecret(store.credentials.consumerSecret);
        await deleteWooProduct(store.shopDomain, consumerKey, consumerSecret, target.externalId);
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
