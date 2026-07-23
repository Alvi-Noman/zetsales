import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import logger from './logger.js';

export const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');

async function ensureInvoiceNoIndex(db: ReturnType<typeof client.db>) {
  const orders = db.collection('orders');
  const indexName = 'tenantId_1_invoiceNo_1';
  const existing = await orders.indexes();
  const invoiceIndex = existing.find((index) => index.name === indexName);
  const hasPartialStringFilter =
    invoiceIndex?.partialFilterExpression &&
    JSON.stringify(invoiceIndex.partialFilterExpression) === JSON.stringify({ invoiceNo: { $type: 'string' } });

  if (hasPartialStringFilter) return;
  if (invoiceIndex) await orders.dropIndex(indexName);

  await orders.createIndex(
    { tenantId: 1, invoiceNo: 1 },
    { unique: true, partialFilterExpression: { invoiceNo: { $type: 'string' } } }
  );
}

export async function connectDb() {
  logger.info('Connecting to MongoDB...');
  await client.connect();
  logger.info('Connected to MongoDB!');
  const db = client.db();
  void ensureIndexes(db).catch((error) =>
    logger.error('Failed to ensure indexes on MongoDB', { message: (error as Error).message, stack: (error as Error).stack })
  );
}

async function ensureIndexes(db: ReturnType<typeof client.db>) {

  await db.collection('stores').createIndex({ tenantId: 1 });
  await db.collection('stores').createIndex({ tenantId: 1, platform: 1, shopDomain: 1 }, { unique: true, sparse: true });
  await db.collection('products').createIndex({ tenantId: 1, storeId: 1 });
  await db.collection('products').createIndex({ tenantId: 1, storeId: 1, externalId: 1 }, { unique: true, sparse: true });
  await db.collection('orders').createIndex({ tenantId: 1, storeId: 1 });
  await db.collection('orders').createIndex({ tenantId: 1, storeId: 1, externalId: 1 }, { unique: true, sparse: true });
  // getOrderStats (Home page KPI cards) runs ~25 aggregations per load, nearly all filtered by
  // stage and/or a createdAt window rather than storeId — without these, every one of them was a
  // full collection scan of the tenant's order history, invisible in dev but severe in production.
  await db.collection('orders').createIndex({ tenantId: 1, createdAt: -1 });
  await db.collection('orders').createIndex({ tenantId: 1, stage: 1, createdAt: -1 });
  // attachReturningFlags (tenant-scoped) and attachRiskLabels' cross-tenant fraud-history fallback
  // (deliberately no tenantId — pools network-wide signal) both filter orders by customerPhone on
  // every Orders page load; neither had an index to use, so both were full collection scans.
  await db.collection('orders').createIndex({ tenantId: 1, customerPhone: 1 });
  await db.collection('orders').createIndex({ customerPhone: 1 });
  // findPossibleDuplicates (same phone, same Dhaka calendar day) filters customerPhone then ranges
  // on createdAt — the index above covers customerPhone alone, leaving the createdAt range unindexed.
  await db.collection('orders').createIndex({ tenantId: 1, customerPhone: 1, createdAt: 1 });
  // Call Center, Accounting, and Reports all filter on the SAME array's two subfields via
  // `history: { $elemMatch: { label, at } }` (a compound index on both fields of one array
  // supports $elemMatch — this isn't the "two different array paths" case Mongo disallows).
  // storeId is left out of this index (rather than sandwiched in the middle) since most of these
  // callers pass tenantId alone; Mongo still applies storeId as a cheap residual filter when present.
  await db.collection('orders').createIndex({ tenantId: 1, 'history.label': 1, 'history.at': 1 });
  // getSaleProfitReport filters by invoiceIssuedAt, which had no index at all (only createdAt did).
  await db.collection('orders').createIndex({ tenantId: 1, storeId: 1, invoiceIssuedAt: 1 });
  await db.collection('abandonedCheckouts').createIndex({ tenantId: 1, storeId: 1 });
  await db.collection('abandonedCheckouts').createIndex({ tenantId: 1, storeId: 1, externalId: 1 }, { unique: true, sparse: true });
  void ensureInvoiceNoIndex(db)
    .then(() => logger.info('Invoice number index ensured on MongoDB.'))
    .catch((error) => logger.error('Failed to ensure invoice number index', { message: (error as Error).message, stack: (error as Error).stack }));
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
  await db.collection('courierHandovers').createIndex({ tenantId: 1, manifestNo: 1 }, { unique: true, sparse: true });
  // Short-lived handoff from the browser extension to the web import modal — single-use, so a
  // stale/abandoned one should disappear rather than linger.
  await db.collection('pendingImportDrafts').createIndex({ tenantId: 1 });
  await db.collection('pendingImportDrafts').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });
  // Holds a parsed CSV between the upload step and the preview/commit steps of order import, so
  // the browser doesn't re-upload the whole file on every mapping tweak. Single-use/short-lived
  // like pendingImportDrafts above, not a permanent record.
  await db.collection('csvImportDrafts').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 });
  // Not tenant-scoped — a phone number's Steadfast/Pathao delivery history is a fact about the
  // phone number itself, shared across every tenant that ever checks it.
  await db.collection('courierFraudHistory').createIndex({ phone: 1 }, { unique: true });
  await db.collection('hrmDepartments').createIndex({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  await db.collection('hrmShifts').createIndex({ tenantId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
  await db.collection('hrmEmployees').createIndex({ tenantId: 1, status: 1 });
  await db.collection('hrmEmployees').createIndex({ tenantId: 1, employeeCode: 1 }, { unique: true });
  await db.collection('hrmAttendance').createIndex({ tenantId: 1, employeeId: 1, date: 1 }, { unique: true });
  await db.collection('hrmAttendance').createIndex({ tenantId: 1, date: 1 });
  await db.collection('hrmLeaveRequests').createIndex({ tenantId: 1, employeeId: 1, status: 1 });
  await db.collection('hrmPayroll').createIndex({ tenantId: 1, employeeId: 1, month: 1 }, { unique: true });
  await db.collection('hrmSettings').createIndex({ tenantId: 1 }, { unique: true });
  logger.info('Indexes ensured on MongoDB.');
}

export function getDb() {
  return client.db();
}
