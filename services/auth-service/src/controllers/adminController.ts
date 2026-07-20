import type { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import { workspaceUrlForSlug } from '../utils/workspaceDomain.js';
import logger from '../utils/logger.js';

// Only fields that actually exist on a business/user document today are surfaced here — there is
// no billing/plan/MRR/GMV data model yet (see adminapp's mockData.ts for the fabricated version
// of those), so this deliberately does not invent numbers to fill that gap.
export async function listTenants(_req: Request, res: Response): Promise<void> {
  try {
    const db = getDb();
    const businesses = await db.collection('businesses').find({}).sort({ createdAt: -1 }).toArray();

    const counts = await db
      .collection('users')
      .aggregate<{ _id: string; count: number }>([
        { $match: { tenantId: { $exists: true, $ne: null } } },
        { $group: { _id: '$tenantId', count: { $sum: 1 } } },
      ])
      .toArray();
    const teamSizeByTenant = new Map(counts.map((c) => [c._id, c.count]));

    const tenants = businesses.map((b) => {
      const id = b._id.toString();
      return {
        id,
        name: b.name as string,
        slug: (b.slug as string | undefined) ?? null,
        domain: b.slug ? workspaceUrlForSlug(b.slug as string) : null,
        businessType: (b.businessType as string | undefined) ?? null,
        country: (b.country as string | undefined) ?? null,
        currency: (b.currency as string | undefined) ?? null,
        installedPlugins: (b.installedPlugins as string[] | undefined) ?? [],
        teamSize: teamSizeByTenant.get(id) ?? 0,
        monthlyOrdersEstimate: (b.monthlyOrders as string | undefined) ?? null,
        createdAt: b.createdAt as Date | undefined,
      };
    });

    res.status(200).json({ success: true, tenants });
  } catch (err) {
    logger.error(`Failed to list tenants: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Failed to load tenants' });
  }
}

export async function getTenant(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ success: false, message: 'Invalid tenant id' });
    return;
  }

  try {
    const db = getDb();
    const business = await db.collection('businesses').findOne({ _id: new ObjectId(id) });
    if (!business) {
      res.status(404).json({ success: false, message: 'Tenant not found' });
      return;
    }

    const members = await db
      .collection('users')
      .find({ tenantId: id }, { projection: { email: 1, role: 1, createdAt: 1 } })
      .toArray();

    res.status(200).json({
      success: true,
      tenant: {
        id: business._id.toString(),
        name: business.name as string,
        slug: (business.slug as string | undefined) ?? null,
        domain: business.slug ? workspaceUrlForSlug(business.slug as string) : null,
        businessType: (business.businessType as string | undefined) ?? null,
        country: (business.country as string | undefined) ?? null,
        currency: (business.currency as string | undefined) ?? null,
        phone: (business.phone as string | undefined) ?? null,
        installedPlugins: (business.installedPlugins as string[] | undefined) ?? [],
        monthlyOrdersEstimate: (business.monthlyOrders as string | undefined) ?? null,
        createdAt: business.createdAt as Date | undefined,
        members: members.map((m) => ({
          id: m._id.toString(),
          email: m.email as string,
          role: (m.role as string | undefined) ?? null,
          createdAt: m.createdAt as Date | undefined,
        })),
      },
    });
  } catch (err) {
    logger.error(`Failed to get tenant ${id}: ${(err as Error).message}`);
    res.status(500).json({ success: false, message: 'Failed to load tenant' });
  }
}
