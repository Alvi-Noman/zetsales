import { ObjectId } from 'mongodb';
import { getDb } from './db.js';

async function isFraudCheckerInstalled(tenantId: string): Promise<boolean> {
  const business = await getDb().collection('businesses').findOne({ _id: new ObjectId(tenantId) }, { projection: { installedPlugins: 1 } });
  return !!business?.installedPlugins?.includes('fraudChecker');
}

// Flags are system-detected, not manually picked — a human reviews and clears them (via the
// normal "Clear flag & confirm" action), rather than raising them by hand. Reuses the same
// prior-order lookup as risk scoring, so it costs one extra query per newly-created order, not a
// collection-wide scan. Moved here from ordersController.ts so every order-creation path shares
// one implementation, gated behind the Fraud Checker app's install state.
async function computeAutoFlagReason(tenantId: string, customerPhone: string | null, total: number): Promise<string | null> {
  if (!customerPhone) return null;

  const db = getDb();
  const priorOrders = await db.collection('orders').find({ tenantId, customerPhone }).project({ stage: 1, total: 1 }).toArray();

  if (priorOrders.length === 0) {
    return total > 20_000 ? 'Unusually large order from a first-time customer' : null;
  }

  const deliveredCount = priorOrders.filter((o) => o.stage === 'Delivered' || o.stage === 'Partial Delivered').length;
  const cancelledOrReturnedCount = priorOrders.filter((o) => o.stage === 'Cancelled' || o.stage === 'Returned').length;
  const resolvedCount = deliveredCount + cancelledOrReturnedCount;
  if (resolvedCount >= 2 && deliveredCount / resolvedCount < 0.4) {
    return 'Customer has a low delivery success rate';
  }

  const avgTotal = priorOrders.reduce((sum, o) => sum + (o.total || 0), 0) / priorOrders.length;
  if (avgTotal > 0 && total > avgTotal * 3) {
    return 'Unusually large order compared to this customer’s history';
  }

  return null;
}

// The single choke point every order-creation path (Shopify sync, WooCommerce sync, manual
// create) now calls uniformly — previously `computeAutoFlagReason` only ran on synced orders,
// leaving manually-created orders never auto-flagged. Gated on the Fraud Checker app being
// installed; when it isn't, this always returns null, same behavior as before the app platform
// existed. `isCustomerBlocked` (still in ordersController.ts) is deliberately NOT gated here —
// blocking a customer is core moderation, not a Fraud Checker feature.
export async function maybeAutoFlagForFraud(tenantId: string, customerPhone: string | null, total: number): Promise<string | null> {
  if (!(await isFraudCheckerInstalled(tenantId))) return null;
  return computeAutoFlagReason(tenantId, customerPhone, total);
}
