import type { Response } from 'express';
import { z } from 'zod';
import { INVOICE_FONT_OPTIONS, type InvoiceFont } from '@zetsales/shared';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

interface BrandingDoc {
  tenantId: string;
  logoUrl: string | null;
  invoiceFont: InvoiceFont | null;
  updatedAt: Date;
}

function brandingCollection(db: ReturnType<typeof getDb>) {
  return db.collection<BrandingDoc>('storeBranding');
}

export async function getBranding(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const doc = await brandingCollection(db).findOne({ tenantId });
  res.json({
    success: true,
    branding: {
      logoUrl: doc?.logoUrl ?? null,
      invoiceFont: doc?.invoiceFont ?? 'Helvetica',
    },
  });
}

const updateBrandingSchema = z.object({
  invoiceFont: z.enum(INVOICE_FONT_OPTIONS),
});

export async function updateBrandingFont(req: AuthenticatedRequest, res: Response) {
  const parsed = updateBrandingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A valid invoice font is required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  await brandingCollection(db).updateOne(
    { tenantId },
    { $set: { tenantId, invoiceFont: parsed.data.invoiceFont, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ success: true });
}

export async function uploadBrandingLogo(req: AuthenticatedRequest, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ success: false, message: 'A logo image is required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const base = `${process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce'}/uploads`;
  const url = `${base}/${file.filename}`;
  await brandingCollection(db).updateOne(
    { tenantId },
    { $set: { tenantId, logoUrl: url, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ success: true, url });
}
