import { getDb } from './db.js';
import { normalizeBdPhone } from './phoneNormalize.js';

// The database's own permanent record of what Steadfast/Pathao have said about a phone number,
// independent of any single order or tenant — a phone number's real-world delivery history is a
// fact about that phone number, not about one order. Two purposes: (1) makes the "ZetSales
// Network" scope meaningfully richer immediately, since this is ground truth from the couriers'
// own much larger networks, not just what ZetSales' own tenants have observed; (2) if Steadfast or
// Pathao's unofficial access ever breaks, whatever's already been captured here stays usable
// indefinitely as a fallback — the system doesn't go back to zero.
//
// Deliberately NOT tenant-scoped: a phone number's delivery record with Steadfast/Pathao doesn't
// belong to any one tenant, and the whole point is for it to help even a tenant who has never
// seen this customer before.

export interface CourierFraudRecord {
  totalDelivered: number;
  totalCancelled: number;
  checkedAt: Date;
}

export async function recordCourierFraudHistory(
  phone: string | null,
  courier: 'steadfast' | 'pathao',
  result: { totalDelivered: number; totalCancelled: number }
) {
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return;
  await getDb()
    .collection('courierFraudHistory')
    .updateOne(
      { phone: normalized },
      {
        $set: { [courier]: { ...result, checkedAt: new Date() }, updatedAt: new Date() },
        $setOnInsert: { phone: normalized, createdAt: new Date() },
      },
      { upsert: true }
    );
}

export async function getCourierFraudHistory(phone: string | null): Promise<{ steadfast?: CourierFraudRecord; pathao?: CourierFraudRecord } | null> {
  const normalized = normalizeBdPhone(phone);
  if (!normalized) return null;
  const doc = await getDb().collection('courierFraudHistory').findOne({ phone: normalized });
  if (!doc) return null;
  return { steadfast: doc.steadfast, pathao: doc.pathao };
}
