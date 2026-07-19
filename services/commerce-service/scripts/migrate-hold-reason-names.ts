// One-time migration for the pre-confirm hold-reason rename.
//
// Three HoldReason values were relabeled for clarity:
//   'Payment verification pending'  -> 'Payment needs verification'
//   'Customer requested reschedule' -> 'Customer rescheduled call'
//   'Awaiting customer response'    -> "Customer didn't respond"
//
// Existing orders already have the old strings stored in `holdReason` and, for orders that were
// ever put on hold for one of these reasons, in `history[].detail` (buildOrderUpdate writes the
// hold reason as the detail's prefix, optionally followed by ` — <note>`). Both need rewriting so
// old and new orders stay consistent and analytics regexes that key off the detail prefix
// (e.g. getRescheduleEffectiveness) keep matching historical entries too.
//
// Usage:
//   npx tsx scripts/migrate-hold-reason-names.ts --dry-run
//   npx tsx scripts/migrate-hold-reason-names.ts --apply

import { MongoClient } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';

const RENAMES: [string, string][] = [
  ['Payment verification pending', 'Payment needs verification'],
  ['Customer requested reschedule', 'Customer rescheduled call'],
  ['Awaiting customer response', "Customer didn't respond"],
];

async function main() {
  const apply = process.argv.includes('--apply');
  const client = new MongoClient(env.MONGODB_URI || 'mongodb://localhost:27017/zetsales');
  await client.connect();
  const db = client.db();

  try {
    for (const [oldValue, newValue] of RENAMES) {
      const holdReasonCount = await db.collection('orders').countDocuments({ holdReason: oldValue });
      const historyCount = await db.collection('orders').countDocuments({
        history: { $elemMatch: { detail: { $regex: `^${escapeRegex(oldValue)}` } } },
      });
      console.log(`"${oldValue}" -> "${newValue}": ${holdReasonCount} order(s) by holdReason, ${historyCount} order(s) with a matching history entry`);

      if (!apply) continue;

      const holdReasonResult = await db.collection('orders').updateMany(
        { holdReason: oldValue },
        { $set: { holdReason: newValue } }
      );
      console.log(`  Updated holdReason on ${holdReasonResult.modifiedCount} orders.`);

      // detail is either exactly the old reason, or "<old reason> — <note>" — replace only the
      // matching prefix so any trailing note text survives untouched.
      const affected = await db.collection('orders')
        .find({ history: { $elemMatch: { detail: { $regex: `^${escapeRegex(oldValue)}` } } } })
        .project({ history: 1 })
        .toArray();
      let historyModified = 0;
      for (const order of affected) {
        const history = (order.history ?? []).map((h: any) =>
          typeof h.detail === 'string' && h.detail.startsWith(oldValue)
            ? { ...h, detail: newValue + h.detail.slice(oldValue.length) }
            : h
        );
        await db.collection('orders').updateOne({ _id: order._id }, { $set: { history } });
        historyModified += 1;
      }
      console.log(`  Updated history entries on ${historyModified} orders.`);
    }

    if (!apply) {
      console.log('Dry run only — pass --apply to actually migrate. No changes made.');
      return;
    }
    console.log('Migration complete.');
  } finally {
    await client.close();
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
