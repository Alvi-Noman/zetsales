import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import logger from './logger.js';
import { isReservedSubdomain, slugifyBusinessName } from './workspaceDomain.js';

export const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');

async function ensureBusinessSlugs() {
  const db = client.db();
  const businesses = db.collection('businesses');
  const cursor = businesses.find(
    { $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] },
    { projection: { _id: 1, name: 1 } }
  );
  let updated = 0;

  for await (const business of cursor) {
    const rawBase = slugifyBusinessName(typeof business.name === 'string' ? business.name : 'business');
    const base = isReservedSubdomain(rawBase) ? `${rawBase}store` : rawBase;
    let slug = base;
    let suffix = 2;

    while (await businesses.findOne({ _id: { $ne: business._id }, slug }, { projection: { _id: 1 } })) {
      slug = `${base}${suffix}`;
      suffix += 1;
    }

    const result = await businesses.updateOne(
      { _id: business._id, $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }] },
      { $set: { slug, updatedAt: new Date() } }
    );
    if (result.modifiedCount > 0) updated += 1;
  }

  if (updated > 0) logger.info(`Backfilled slugs for ${updated} businesses.`);
}

export async function connectDb() {
  logger.info('Connecting to MongoDB...');
  await client.connect();
  logger.info('Connected to MongoDB!');
  const db = client.db();
  
  // Ensure basic user index on email
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('users').createIndex({ tenantId: 1 });
  await ensureBusinessSlugs();
  await db.collection('businesses').createIndex({ slug: 1 }, { unique: true, sparse: true });
  await db.collection('teamInvites').createIndex({ token: 1 }, { unique: true });
  await db.collection('teamInvites').createIndex({ tenantId: 1, email: 1 });
  logger.info('Indexes ensured on MongoDB.');
}

export function getDb() {
  return client.db();
}
