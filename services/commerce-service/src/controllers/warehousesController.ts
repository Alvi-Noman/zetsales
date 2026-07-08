import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

// _id is a plain string, not the driver's default ObjectId — the three original warehouses
// (dhk-main, ctg-fast, rma) predate this collection and are referenced by those exact string ids
// all over inventoryLevels and orders, so migrating them to ObjectIds would mean rewriting every
// existing record. New warehouses just use a fresh ObjectId's string form for uniqueness.
interface WarehouseDoc {
  _id: string;
  tenantId: string;
  name: string;
  bins: string[];
  createdAt: Date;
  updatedAt: Date;
}

function warehouses(db: ReturnType<typeof getDb>) {
  return db.collection<WarehouseDoc>('warehouses');
}

function warehouseDto(doc: any, systemBins: string[] = []) {
  const predefined: string[] = doc.bins ?? [];
  return {
    id: doc._id,
    name: doc.name,
    bins: predefined,
    // Bins that are genuinely in use (a real count, shipment, or return-holding location) but were
    // never manually added here — e.g. the QC holding bin Returns to process creates on its own.
    // Surfaced read-only so nothing real stays invisible on this screen, without pretending they're
    // deletable the same way a predefined bin is.
    systemBins: systemBins.filter((b) => !predefined.includes(b)),
    createdAt: new Date(doc.createdAt).toISOString(),
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

export async function listWarehouses(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const docs = await warehouses(db).find({ tenantId }).sort({ createdAt: 1 }).toArray();

  // One pass across all warehouses at once (not N+1) — "Unassigned" is the silent default created
  // automatically on first count/shipment, so it's excluded here the same way hasRealBins on the
  // frontend excludes it from flipping bin-tracking on.
  const [levelBinsAgg, returnBinsAgg, partialBinsAgg] = await Promise.all([
    db
      .collection('inventoryLevels')
      .aggregate([
        { $match: { tenantId, bin: { $exists: true, $nin: [null, 'Unassigned'] } } },
        { $group: { _id: '$warehouseId', bins: { $addToSet: '$bin' } } },
      ])
      .toArray(),
    db
      .collection('orders')
      .aggregate([
        { $match: { tenantId, 'returnLocation.bin': { $exists: true, $ne: null } } },
        { $group: { _id: '$returnLocation.warehouseId', bins: { $addToSet: '$returnLocation.bin' } } },
      ])
      .toArray(),
    db
      .collection('orders')
      .aggregate([
        { $match: { tenantId, 'partialReturn.returnLocation.bin': { $exists: true, $ne: null } } },
        { $group: { _id: '$partialReturn.returnLocation.warehouseId', bins: { $addToSet: '$partialReturn.returnLocation.bin' } } },
      ])
      .toArray(),
  ]);

  const systemBinsByWarehouse = new Map<string, Set<string>>();
  for (const agg of [levelBinsAgg, returnBinsAgg, partialBinsAgg] as { _id: string | null; bins: string[] }[][]) {
    for (const row of agg) {
      if (!row._id) continue;
      const set = systemBinsByWarehouse.get(row._id) ?? new Set<string>();
      row.bins.forEach((b) => b && set.add(b));
      systemBinsByWarehouse.set(row._id, set);
    }
  }

  res.json({
    success: true,
    warehouses: docs.map((doc) => warehouseDto(doc, Array.from(systemBinsByWarehouse.get(doc._id) ?? []))),
  });
}

const warehouseNameSchema = z.object({ name: z.string().trim().min(1).max(80) });

export async function createWarehouse(req: AuthenticatedRequest, res: Response) {
  const parsed = warehouseNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A warehouse name is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const now = new Date();
  const doc = { _id: new ObjectId().toString(), tenantId, name: parsed.data.name, bins: [] as string[], createdAt: now, updatedAt: now };
  await warehouses(db).insertOne(doc);
  res.json({ success: true, warehouse: warehouseDto(doc) });
}

export async function renameWarehouse(req: AuthenticatedRequest, res: Response) {
  const parsed = warehouseNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A warehouse name is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await warehouses(db).findOneAndUpdate(
    { _id: req.params.id, tenantId },
    { $set: { name: parsed.data.name, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Warehouse not found.' });
    return;
  }
  res.json({ success: true, warehouse: warehouseDto(result) });
}

// Refuses to delete a warehouse that's still actually holding something — stock, a pending return,
// or a QC-pending package all reference a warehouse by this exact id, and silently orphaning that
// would leave real data pointing at a warehouse that no longer exists anywhere in the UI.
export async function deleteWarehouse(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const warehouseId = req.params.id;

  const [levelCount, returnCount, partialReturnCount] = await Promise.all([
    db.collection('inventoryLevels').countDocuments({ tenantId, warehouseId, onHand: { $gt: 0 } }),
    db.collection('orders').countDocuments({ tenantId, 'returnLocation.warehouseId': warehouseId }),
    db.collection('orders').countDocuments({ tenantId, 'partialReturn.returnLocation.warehouseId': warehouseId, 'partialReturn.status': { $ne: 'Returned' } }),
  ]);
  if (levelCount > 0 || returnCount > 0 || partialReturnCount > 0) {
    res.status(400).json({ success: false, message: 'This warehouse still has stock or pending returns tied to it — move or clear those first.' });
    return;
  }

  const result = await warehouses(db).deleteOne({ _id: warehouseId, tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Warehouse not found.' });
    return;
  }
  res.json({ success: true });
}

const binNameSchema = z.object({ name: z.string().trim().min(1).max(40) });

// Pre-defining a bin here is purely a convenience for businesses that want to plan their layout
// ahead of time — it just seeds the suggestion list (see listBins), it's never required. Nothing
// else in the system treats this list as the only valid bins; free text always still works.
export async function addWarehouseBin(req: AuthenticatedRequest, res: Response) {
  const parsed = binNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A bin name is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await warehouses(db).findOneAndUpdate(
    { _id: req.params.id, tenantId },
    { $addToSet: { bins: parsed.data.name }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Warehouse not found.' });
    return;
  }
  res.json({ success: true, warehouse: warehouseDto(result) });
}

export async function removeWarehouseBin(req: AuthenticatedRequest, res: Response) {
  const parsed = binNameSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A bin name is required.' });
    return;
  }

  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await warehouses(db).findOneAndUpdate(
    { _id: req.params.id, tenantId },
    { $pull: { bins: parsed.data.name }, $set: { updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Warehouse not found.' });
    return;
  }
  res.json({ success: true, warehouse: warehouseDto(result) });
}
