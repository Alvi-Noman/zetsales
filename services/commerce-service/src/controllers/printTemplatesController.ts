import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';

interface PrintTemplateDoc {
  _id: ObjectId;
  tenantId: string;
  name: string;
  logoUrl: string | null;
  businessNameOverride: string | null;
  address: string | null;
  phone: string | null;
  paperSize: 'A4' | 'A5';
  showItemImages: boolean;
  showSkuVariant: boolean;
  showCustomerAddress: boolean;
  showPaymentBox: boolean;
  showDeliveryBox: boolean;
  showBarcode: boolean;
  showCodCallout: boolean;
  footerNote: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function templates(db: ReturnType<typeof getDb>) {
  return db.collection<PrintTemplateDoc>('printTemplates');
}

function toDto(doc: PrintTemplateDoc) {
  return {
    id: doc._id.toString(),
    name: doc.name,
    logoUrl: doc.logoUrl ?? null,
    businessNameOverride: doc.businessNameOverride ?? null,
    address: doc.address ?? null,
    phone: doc.phone ?? null,
    paperSize: doc.paperSize ?? 'A4',
    showItemImages: doc.showItemImages ?? true,
    showSkuVariant: doc.showSkuVariant ?? true,
    showCustomerAddress: doc.showCustomerAddress ?? true,
    showPaymentBox: doc.showPaymentBox ?? true,
    showDeliveryBox: doc.showDeliveryBox ?? true,
    showBarcode: doc.showBarcode ?? true,
    showCodCallout: doc.showCodCallout ?? true,
    footerNote: doc.footerNote ?? 'Thank you for your order.',
    isDefault: doc.isDefault ?? false,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listPrintTemplates(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const docs = await templates(db).find({ tenantId }).sort({ createdAt: 1 }).toArray();
  res.json({ success: true, templates: docs.map(toDto) });
}

const templateFieldsSchema = z.object({
  name: z.string().trim().min(1).max(80),
  businessNameOverride: z.string().trim().max(120).optional().or(z.literal('')),
  address: z.string().trim().max(240).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  paperSize: z.enum(['A4', 'A5']).default('A4'),
  showItemImages: z.boolean().default(true),
  showSkuVariant: z.boolean().default(true),
  showCustomerAddress: z.boolean().default(true),
  showPaymentBox: z.boolean().default(true),
  showDeliveryBox: z.boolean().default(true),
  showBarcode: z.boolean().default(true),
  showCodCallout: z.boolean().default(true),
  footerNote: z.string().trim().max(160).default('Thank you for your order.'),
  logoUrl: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function createPrintTemplate(req: AuthenticatedRequest, res: Response) {
  const parsed = templateFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A template name is required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;

  // A tenant's very first template becomes the default automatically — there'd otherwise be no
  // default at all until someone remembers to set one, and every print flow that reads "the
  // default template" needs one to exist from the first template onward.
  const existingCount = await templates(db).countDocuments({ tenantId });
  const now = new Date();
  const doc: PrintTemplateDoc = {
    _id: new ObjectId(),
    tenantId,
    name: parsed.data.name,
    logoUrl: parsed.data.logoUrl?.trim() || null,
    businessNameOverride: parsed.data.businessNameOverride?.trim() || null,
    address: parsed.data.address?.trim() || null,
    phone: parsed.data.phone?.trim() || null,
    paperSize: parsed.data.paperSize,
    showItemImages: parsed.data.showItemImages,
    showSkuVariant: parsed.data.showSkuVariant,
    showCustomerAddress: parsed.data.showCustomerAddress,
    showPaymentBox: parsed.data.showPaymentBox,
    showDeliveryBox: parsed.data.showDeliveryBox,
    showBarcode: parsed.data.showBarcode,
    showCodCallout: parsed.data.showCodCallout,
    footerNote: parsed.data.footerNote,
    isDefault: existingCount === 0,
    createdAt: now,
    updatedAt: now,
  };
  await templates(db).insertOne(doc);
  res.json({ success: true, template: toDto(doc) });
}

export async function updatePrintTemplate(req: AuthenticatedRequest, res: Response) {
  const parsed = templateFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: 'A template name is required.' });
    return;
  }
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const result = await templates(db).findOneAndUpdate(
    { _id: new ObjectId(req.params.id), tenantId },
    {
      $set: {
        name: parsed.data.name,
        logoUrl: parsed.data.logoUrl?.trim() || null,
        businessNameOverride: parsed.data.businessNameOverride?.trim() || null,
        address: parsed.data.address?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        paperSize: parsed.data.paperSize,
        showItemImages: parsed.data.showItemImages,
        showSkuVariant: parsed.data.showSkuVariant,
        showCustomerAddress: parsed.data.showCustomerAddress,
        showPaymentBox: parsed.data.showPaymentBox,
        showDeliveryBox: parsed.data.showDeliveryBox,
        showBarcode: parsed.data.showBarcode,
        showCodCallout: parsed.data.showCodCallout,
        footerNote: parsed.data.footerNote,
        updatedAt: new Date(),
      },
    },
    { returnDocument: 'after' }
  );
  if (!result) {
    res.status(404).json({ success: false, message: 'Template not found.' });
    return;
  }
  res.json({ success: true, template: toDto(result) });
}

export async function deletePrintTemplate(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const id = req.params.id;
  const doc = await templates(db).findOne({ _id: new ObjectId(id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Template not found.' });
    return;
  }
  await templates(db).deleteOne({ _id: new ObjectId(id), tenantId });
  // Deleting the default template hands the default over to whichever one is oldest, so there's
  // never a gap where a print flow reads "the default template" and finds nothing.
  if (doc.isDefault) {
    const next = await templates(db).find({ tenantId }).sort({ createdAt: 1 }).limit(1).toArray();
    if (next[0]) await templates(db).updateOne({ _id: next[0]._id }, { $set: { isDefault: true, updatedAt: new Date() } });
  }
  res.json({ success: true });
}

export async function setDefaultPrintTemplate(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const id = req.params.id;
  const doc = await templates(db).findOne({ _id: new ObjectId(id), tenantId });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Template not found.' });
    return;
  }
  await templates(db).updateMany({ tenantId }, { $set: { isDefault: false } });
  await templates(db).updateOne({ _id: new ObjectId(id) }, { $set: { isDefault: true, updatedAt: new Date() } });
  res.json({ success: true });
}

export function uploadPrintTemplateLogo(req: AuthenticatedRequest, res: Response) {
  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ success: false, message: 'A logo image is required.' });
    return;
  }
  const base = `${process.env.PUBLIC_COMMERCE_URL || 'http://localhost:8081/api/v1/commerce'}/uploads`;
  res.json({ success: true, url: `${base}/${file.filename}` });
}
