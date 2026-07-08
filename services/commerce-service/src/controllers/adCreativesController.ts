import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import type { AdCreativeAssetDTO } from '@zetsales/shared';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

function creativeDto(doc: any): AdCreativeAssetDTO {
  return {
    id: doc._id.toString(),
    type: doc.type,
    url: doc.url,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    width: doc.width ?? null,
    height: doc.height ?? null,
    durationSeconds: doc.durationSeconds ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

export async function uploadAdCreatives(req: AuthenticatedRequest, res: Response) {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) {
    res.status(400).json({ success: false, message: 'No files uploaded.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const base = `${process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce'}/uploads/ad-creatives`;
  const now = new Date();

  const docs = files.map((f) => ({
    tenantId,
    type: f.mimetype.startsWith('video/') ? ('video' as const) : ('image' as const),
    url: `${base}/${f.filename}`,
    // Not exposed in AdCreativeAssetDTO — kept so per-platform campaign creation (e.g. Google's
    // image asset upload, which needs raw base64 bytes, not a fetchable URL) can read the file
    // straight off disk instead of an HTTP round-trip back to ourselves.
    localPath: f.path,
    fileName: f.originalname,
    mimeType: f.mimetype,
    width: null,
    height: null,
    durationSeconds: null,
    createdAt: now,
  }));

  const result = await db.collection('adCreativeAssets').insertMany(docs);
  const assets = docs.map((doc, i) => creativeDto({ ...doc, _id: result.insertedIds[i] }));
  res.json({ success: true, assets });
}

export async function listAdCreatives(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const assets = await db.collection('adCreativeAssets').find({ tenantId: req.user!.tenantId }).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, assets: assets.map(creativeDto) });
}

export async function deleteAdCreative(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const result = await db.collection('adCreativeAssets').deleteOne({ _id: new ObjectId(req.params.id), tenantId: req.user!.tenantId });
  if (result.deletedCount === 0) {
    res.status(404).json({ success: false, message: 'Asset not found.' });
    return;
  }
  res.json({ success: true });
}
