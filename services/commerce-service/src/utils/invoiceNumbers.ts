import { ObjectId } from 'mongodb';
import { getDb } from './db.js';

const FALLBACK_PREFIX = 'BILL';

export function buildStoreBillPrefix(name: string | null | undefined): string {
  const words = (name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return FALLBACK_PREFIX;

  let prefix: string;
  if (words.length === 1) {
    prefix = words[0].slice(0, 3);
  } else if (words.length === 2) {
    prefix = `${words[0].slice(0, 2)}${words[1][0] ?? ''}`;
  } else {
    prefix = words.slice(0, 3).map((word) => word[0]).join('');
  }

  return prefix.padEnd(3, 'X').slice(0, 3) || FALLBACK_PREFIX;
}

export async function resolveStoreBillPrefix(tenantId: string, storeId: string | null | undefined): Promise<string> {
  if (!storeId) return FALLBACK_PREFIX;

  const db = getDb();
  const idFilter: any = ObjectId.isValid(storeId) ? { _id: new ObjectId(storeId) } : { _id: storeId };
  const store = await db.collection('stores').findOne(
    { ...idFilter, tenantId },
    { projection: { displayName: 1, name: 1, shopDomain: 1 } }
  );

  return buildStoreBillPrefix(store?.displayName ?? store?.name ?? store?.shopDomain);
}

export async function nextInvoiceNumberForStore(tenantId: string, storeId: string | null | undefined): Promise<string> {
  const db = getDb();
  const prefix = await resolveStoreBillPrefix(tenantId, storeId);
  const result = await db
    .collection('counters')
    .findOneAndUpdate({ _id: `${tenantId}:invoice:${prefix}` } as any, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  const seq = (result as any)?.seq ?? 1;
  return `${prefix}-${String(seq).padStart(6, '0')}`;
}
