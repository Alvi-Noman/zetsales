import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// The one setting ZetSales Order Risk Checker exposes: whether this tenant's risk checks pool
// order outcomes across every tenant on ZetSales (see attachFraudAlertFlags/computeOrderRisk in
// ordersController.ts), instead of just this store's own history. Off by default, explicit
// opt-in per tenant — never enabled implicitly.
export async function updateOrderRiskCheckerSettings(req: AuthenticatedRequest, res: Response) {
  const { crossTenantRiskEnabled } = (req.body ?? {}) as { crossTenantRiskEnabled?: boolean };
  if (typeof crossTenantRiskEnabled !== 'boolean') {
    res.status(400).json({ success: false, message: 'crossTenantRiskEnabled must be a boolean' });
    return;
  }

  const tenantId = req.user!.tenantId!;
  await getDb().collection('businesses').updateOne({ _id: new ObjectId(tenantId) }, { $set: { crossTenantRiskEnabled } });

  res.status(200).json({ success: true, crossTenantRiskEnabled });
}
