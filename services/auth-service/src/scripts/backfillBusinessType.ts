import { client, connectDb } from '../utils/db.js';

// The 'businesses' collection previously stored product-category values (e.g. 'Fashion & Apparel')
// for businessType. That field now represents sourcing model instead, so every pre-existing store
// gets defaulted to 'I import my products' — none of the old category values map to a sourcing model.
async function backfillBusinessType() {
  await connectDb();
  const db = client.db();
  const result = await db.collection('businesses').updateMany({}, { $set: { businessType: 'I import my products' } });
  console.log(`Updated ${result.modifiedCount} of ${result.matchedCount} businesses.`);
  await client.close();
}

backfillBusinessType().catch((err) => {
  console.error(err);
  process.exit(1);
});
