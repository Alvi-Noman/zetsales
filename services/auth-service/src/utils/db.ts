import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import logger from './logger.js';

export const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');

export async function connectDb() {
  logger.info('Connecting to MongoDB...');
  await client.connect();
  logger.info('Connected to MongoDB!');
  const db = client.db();
  
  // Ensure basic user index on email
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ tenantId: 1 });
  await db.collection('teamInvites').createIndex({ token: 1 }, { unique: true });
  await db.collection('teamInvites').createIndex({ tenantId: 1, email: 1 });
  logger.info('Indexes ensured on MongoDB.');
}

export function getDb() {
  return client.db();
}
