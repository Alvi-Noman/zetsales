import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import logger from './logger.js';

export const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');

export async function connectDb() {
  logger.info('Connecting to MongoDB...');
  await client.connect();
  logger.info('Connected to MongoDB!');
  const db = client.db();

  await db.collection('social_accounts').createIndex({ tenantId: 1 });
  await db.collection('social_accounts').createIndex({ provider: 1, externalId: 1 }, { unique: true });
  await db.collection('conversations').createIndex({ tenantId: 1, lastMessageAt: -1 });
  await db.collection('conversations').createIndex({ accountId: 1, participantId: 1 }, { unique: true });
  await db.collection('messages').createIndex({ tenantId: 1, conversationId: 1, sentAt: 1 });
  await db.collection('messages').createIndex({ providerMessageId: 1 }, { unique: true, sparse: true });

  logger.info('Indexes ensured on MongoDB.');
}

export function getDb() {
  return client.db();
}
