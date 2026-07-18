import type { Request, Response, NextFunction } from 'express';
import { getDb } from '../utils/db.js';
import { workspaceSlugFromHost } from '../utils/workspaceDomain.js';

export interface PublicTenantRequest extends Request {
  tenant?: { id: string; name: string };
}

// Gates the public HRM punch routes — these have no login wall, so the tenant is resolved from
// the subdomain (vintek.zetsales.com) instead of a JWT, same slug lookup auth-service already
// does for its own subdomain-based workspace resolution. Also enforces the same install gate
// requireModule('hrm')/requirePlugin('hrm') give the authenticated routes, since a tenant that
// never installed HRM shouldn't expose a working punch page just by guessing its subdomain.
export async function resolvePublicTenant(req: PublicTenantRequest, res: Response, next: NextFunction) {
  const hostHeader = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host;
  const slug = workspaceSlugFromHost(hostHeader);
  if (!slug) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  const business = await getDb()
    .collection('businesses')
    .findOne({ slug }, { projection: { name: 1, installedPlugins: 1 } });
  if (!business || !business.installedPlugins?.includes('hrm')) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  req.tenant = { id: business._id.toString(), name: business.name };
  next();
}
