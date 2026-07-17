// One-time migration for the "Ready for Pickup" stage split.
//
// Before this change, `stage: 'Shipped'` meant "packed, consignment created, waiting for the
// courier to physically collect it." That meaning now belongs to a new stage, 'Ready for Pickup'.
// `stage: 'Shipped'` now means "the courier has actually taken the parcel" instead.
//
// Any order already sitting in `stage: 'Shipped'` in the database predates this split and was
// never actually handed to a courier under the new definition — it needs to move to
// 'Ready for Pickup' so it shows up correctly in Dispatch / the courier handover manifest again.
// This is a pure label fix: the consignment/tracking code these orders already have stays as-is,
// nothing is re-dispatched.
//
// Also rewrites the matching `history` entries so historical labels ('Shipped' at the time this
// order was packed) read correctly and analytics (time-to-ship, SLA breach, employee activity)
// keep measuring the same real-world event they always did.
//
// Usage:
//   npx tsx scripts/migrate-shipped-stage.ts --dry-run
//   npx tsx scripts/migrate-shipped-stage.ts --apply

import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';

async function main() {
  const apply = process.argv.includes('--apply');
  const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');
  await client.connect();
  const db = client.db();

  try {
    const ordersToMigrate = await db.collection('orders').countDocuments({ stage: 'Shipped' });
    console.log(`Orders currently in stage 'Shipped' (pre-split meaning): ${ordersToMigrate}`);

    if (!apply) {
      console.log('Dry run only — pass --apply to actually migrate. No changes made.');
      return;
    }

    const stageResult = await db.collection('orders').updateMany(
      { stage: 'Shipped' },
      { $set: { stage: 'Ready for Pickup' } }
    );
    console.log(`Updated stage on ${stageResult.modifiedCount} orders.`);

    // Every order's own history log may also contain a 'Shipped' entry logged before this split —
    // relabel those too so time-to-ship/SLA/employee-activity analytics (which read history
    // labels) keep referring to the same real event ("packed and staged for pickup").
    const historyResult = await db.collection('orders').updateMany(
      { 'history.label': 'Shipped' },
      { $set: { 'history.$[elem].label': 'Ready for Pickup' } },
      { arrayFilters: [{ 'elem.label': 'Shipped' }] }
    );
    console.log(`Updated history entries on ${historyResult.modifiedCount} orders.`);

    console.log('Migration complete.');
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
