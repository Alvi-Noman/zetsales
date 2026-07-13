import type { Response } from 'express';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// The merchant-set reorder target per SKU (their supplier's MOQ, or whatever quantity makes a
// bulk order worth placing) — kept in its own tiny collection rather than on inventoryLevels
// since a target is set once per product/variant, not per warehouse location.
export async function getPreOrderTargets(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const docs = await db.collection('preOrderTargets').find({ tenantId }).toArray();
  res.json({
    success: true,
    targets: docs.map((doc) => ({
      productId: doc.productId,
      variantId: doc.variantId,
      targetQuantity: doc.targetQuantity,
      updatedAt: doc.updatedAt,
    })),
  });
}

const setTargetSchema = z.object({ targetQuantity: z.number().int().positive() });

export async function setPreOrderTarget(req: AuthenticatedRequest, res: Response) {
  const parsed = setTargetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'targetQuantity must be a positive whole number.' });
    return;
  }
  const { productId, variantId } = req.params;
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const updatedAt = new Date();
  await db
    .collection('preOrderTargets')
    .updateOne({ tenantId, productId, variantId }, { $set: { targetQuantity: parsed.data.targetQuantity, updatedAt } }, { upsert: true });
  res.json({ success: true, target: { productId, variantId, targetQuantity: parsed.data.targetQuantity, updatedAt } });
}

export async function deletePreOrderTarget(req: AuthenticatedRequest, res: Response) {
  const { productId, variantId } = req.params;
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  await db.collection('preOrderTargets').deleteOne({ tenantId, productId, variantId });
  res.json({ success: true });
}
