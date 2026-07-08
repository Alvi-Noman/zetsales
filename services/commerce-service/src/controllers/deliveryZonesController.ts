import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// A tenant-defined list of area names (e.g. "Mirpur-10", "Uttara", "Savar") used purely for the
// Delivery Zones analytics breakdown — see analyticsController.ts's getDeliveryZones. Orders store
// the zone as a plain name string, not a reference to this collection's _id, so renaming or deleting
// an entry here never touches historical orders; it only changes what shows up as a suggestion going
// forward. The case-insensitive unique index is what actually prevents the "Mirpur" vs "mirpur" vs
// "Mirpur-10" drift that made the analytics breakdown unreliable before this existed.
function zoneDto(doc: any) {
  return { id: doc._id.toString(), name: doc.name, createdAt: new Date(doc.createdAt).toISOString() };
}

export async function listDeliveryZones(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const docs = await db.collection('deliveryZones').find({ tenantId }).sort({ name: 1 }).toArray();
  res.json({ success: true, zones: docs.map(zoneDto) });
}

const zoneNameSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function createDeliveryZone(req: AuthenticatedRequest, res: Response) {
  const parsed = zoneNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A zone name is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;

  const existing = await db
    .collection('deliveryZones')
    .findOne({ tenantId, name: parsed.data.name }, { collation: { locale: 'en', strength: 2 } });
  if (existing) {
    res.json({ success: true, zone: zoneDto(existing) });
    return;
  }

  const doc = { _id: new ObjectId(), tenantId, name: parsed.data.name, createdAt: new Date() };
  await db.collection('deliveryZones').insertOne(doc);
  res.json({ success: true, zone: zoneDto(doc) });
}

export async function deleteDeliveryZone(req: AuthenticatedRequest, res: Response) {
  if (!ObjectId.isValid(req.params.id)) {
    res.status(400).json({ success: false, message: 'Invalid zone.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await db.collection('deliveryZones').deleteOne({ _id: new ObjectId(req.params.id), tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Zone not found.' });
    return;
  }
  res.json({ success: true });
}
