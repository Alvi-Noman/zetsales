import type { Request, Response, NextFunction } from 'express';

// Separate from the regular tenant JWT auth (requireAuth) on purpose — admin routes read across
// every tenant, so a normal tenant session token (scoped to one tenantId) must never satisfy
// this check. A single shared secret is a deliberately minimal MVP: adminapp is an internal,
// unlinked console (not indexed/discoverable), matching the same risk level as its hardcoded
// login. Move to per-admin-user credentials before this is ever exposed more broadly.
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_API_TOKEN;
  const provided = req.headers['x-admin-token'];

  if (!expected) {
    res.status(503).json({ success: false, message: 'Admin API is not configured' });
    return;
  }

  if (provided !== expected) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  next();
}
