import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import logger from './logger.js';

export const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');

export async function connectDb() {
  logger.info('Connecting to MongoDB...');
  await client.connect();
  logger.info('Connected to MongoDB!');
  const db = client.db();

  await db.collection('stores').createIndex({ tenantId: 1 });
  await db.collection('stores').createIndex({ tenantId: 1, platform: 1, shopDomain: 1 }, { unique: true, sparse: true });
  await db.collection('products').createIndex({ tenantId: 1, storeId: 1 });
  await db.collection('products').createIndex({ tenantId: 1, storeId: 1, externalId: 1 }, { unique: true, sparse: true });
  await db.collection('orders').createIndex({ tenantId: 1, storeId: 1 });
  await db.collection('orders').createIndex({ tenantId: 1, storeId: 1, externalId: 1 }, { unique: true, sparse: true });
  // Inventory is keyed by productId+variantId, not sku — confirmed against live data that most
  // multi-variant products (664 of 666) have two or more variants sharing an identical SKU, so raw
  // SKU can't be trusted as a unique key. sku is still stored and searched, just not unique.
  // Drop indexes from earlier iterations of this schema rather than leaving them dangling.
  await db.collection('inventoryLevels').dropIndex('tenantId_1_productId_1').catch(() => {});
  await db.collection('inventoryLevels').dropIndex('tenantId_1_productId_1_warehouseId_1_bin_1').catch(() => {});
  await db.collection('inventoryLevels').dropIndex('tenantId_1_sku_1').catch(() => {});
  await db.collection('inventoryLevels').dropIndex('tenantId_1_sku_1_warehouseId_1_bin_1').catch(() => {});
  await db.collection('inventoryLevels').createIndex({ tenantId: 1, productId: 1, variantId: 1 });
  await db.collection('inventoryLevels').createIndex({ tenantId: 1, productId: 1, variantId: 1, warehouseId: 1, bin: 1 }, { unique: true });
  await db.collection('inventoryLevels').createIndex({ tenantId: 1, sku: 1 });
  await db.collection('inventoryMovements').createIndex({ tenantId: 1, createdAt: -1 });
  await db.collection('inventoryMovements').createIndex({ tenantId: 1, variantId: 1 });
  await db.collection('inventoryMovements').createIndex({ tenantId: 1, supplierId: 1 });
  await db.collection('suppliers').createIndex({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  await db.collection('warehouses').createIndex({ tenantId: 1 });
  await db.collection('deliveryZones').createIndex({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  await db.collection('inventorySettings').createIndex({ tenantId: 1 }, { unique: true });
  await db.collection('expenses').createIndex({ tenantId: 1, date: -1 });
  // The FIFO lookup allocateAgainstOpenShipments runs on every receive/write-off — one open
  // shipment resolved oldest-first per exact product+variant+warehouse+bin.
  await db.collection('shipments').createIndex({ tenantId: 1, productId: 1, variantId: 1, warehouseId: 1, bin: 1, status: 1, createdAt: 1 });
  await db.collection('shipments').createIndex({ tenantId: 1, supplierId: 1, createdAt: -1 });
  await db.collection('woo_auth_sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 30 });
  await db.collection('analyticsLayouts').createIndex({ tenantId: 1, userId: 1 }, { unique: true });
  await db.collection('courierSettlements').createIndex({ tenantId: 1, courierId: 1, settledAt: -1 });
  await db.collection('courierHandovers').createIndex({ tenantId: 1, courierId: 1, handoverDate: -1 });
  // Short-lived handoff from the browser extension to the web import modal — single-use, so a
  // stale/abandoned one should disappear rather than linger.
  await db.collection('pendingImportDrafts').createIndex({ tenantId: 1 });
  await db.collection('pendingImportDrafts').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });
  // Not tenant-scoped — a phone number's Steadfast/Pathao delivery history is a fact about the
  // phone number itself, shared across every tenant that ever checks it.
  await db.collection('courierFraudHistory').createIndex({ phone: 1 }, { unique: true });
  logger.info('Indexes ensured on MongoDB.');
}

export function getDb() {
  return client.db();
}
