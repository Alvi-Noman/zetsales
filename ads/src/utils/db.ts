import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import logger from './logger.js';

// Deliberately the SAME Mongo instance/database every other ZetSales service connects to — the
// ad-account connection flow this service owns writes to the shared `adAccounts` collection so
// commerce-service's campaign-creation flow (adCampaignsController.ts, CampaignWizard.tsx) keeps
// working unchanged. `ads_installs` below is this service's own collection, not shared.
export const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');

export async function connectDb() {
  logger.info('Connecting to MongoDB...');
  await client.connect();
  logger.info('Connected to MongoDB!');
  const db = client.db();

  await db.collection('ads_installs').createIndex({ tenantId: 1 }, { unique: true });
  await db.collection('adAccounts').createIndex({ tenantId: 1 });
  await db.collection('adAccounts').createIndex({ tenantId: 1, platform: 1, externalAccountId: 1 }, { unique: true });

  logger.info('Indexes ensured on MongoDB.');
}

export function getDb() {
  return client.db();
}
