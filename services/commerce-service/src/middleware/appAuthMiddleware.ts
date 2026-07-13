import type { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from './authMiddleware.js';

export interface AppAuthenticatedRequest extends AuthenticatedRequest {
  installedApp?: { tenantId: string; appKey: string };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Gates a route behind an installed app's OAuth access token (Authorization: Bearer <token>) —
// this is how a standalone service (Phase 2's Call Center/Ad Performance/Messages, or any future
// 3rd party) calls back into ZetSales after installing, distinct from requireAuth's cookie/JWT
// session for the merchant's own browser.
export async function requireAppToken(req: AppAuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: 'Unauthorized: No access token provided' });
    return;
  }
  const token = header.slice('Bearer '.length);
  const installedApp = await getDb()
    .collection('installed_apps')
    .findOne({ accessTokenHash: hashToken(token), status: 'installed' });
  if (!installedApp) {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid access token' });
    return;
  }
  req.installedApp = { tenantId: installedApp.tenantId, appKey: installedApp.appKey };
  next();
}

export { hashToken };
