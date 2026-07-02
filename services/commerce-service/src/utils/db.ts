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
  await db.collection('woo_auth_sessions').createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 * 30 });
  logger.info('Indexes ensured on MongoDB.');
}

export function getDb() {
  return client.db();
}
