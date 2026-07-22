import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { env } from '@zetsales/config/validateEnv';
import { ROLE_DEFINITIONS, canWriteModule, type ModuleKey, type TeamRole } from '@zetsales/shared';
import { getDb } from '../utils/db.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenantId: string | null;
    role: TeamRole | null;
  };
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    let token = req.cookies?.token;
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
      return;
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as { id: string };

    // Re-resolve tenantId/role from the DB on every request rather than trusting the JWT's
    // embedded claims — otherwise a role change or tenant removal wouldn't take effect until
    // the (long-lived) access token naturally expires. Mirrors auth-service's own requireAuth.
    const user = await getDb().collection('users').findOne({ _id: new ObjectId(payload.id) });
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      tenantId: user.tenantId ?? null,
      role: (user.role as TeamRole | undefined) ?? null,
    };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
}

// Most commerce operations (stores, products, orders) are scoped to a business, which only
// exists once onboarding is complete — this guards routes that need a real tenantId.
export function requireTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.tenantId) {
    res.status(403).json({ success: false, message: 'Finish onboarding before managing integrations.' });
    return;
  }
  next();
}

// Gates a route behind a sidebar module the team member's role must include; a null/legacy role
// (accounts created before roles existed) fails open as owner-equivalent access.
export function requireModule(module: ModuleKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    const definition = role ? ROLE_DEFINITIONS[role] : ROLE_DEFINITIONS.owner;
    if (!definition.modules.includes(module)) {
      res.status(403).json({ success: false, message: 'You do not have access to this section.' });
      return;
    }
    if (req.method !== 'GET' && !canWriteModule(role, module)) {
      res.status(403).json({ success: false, message: 'Your role has read-only access.' });
      return;
    }
    next();
  };
}

// Gates a route behind tenant-level plugin install state — independent of and in addition to
// requireModule's role check. A tenant must explicitly install a plugin module (see
// appsController) before any role can use it.
export function requirePlugin(module: ModuleKey) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const business = await getDb()
      .collection('businesses')
      .findOne({ _id: new ObjectId(req.user!.tenantId!) }, { projection: { installedPlugins: 1 } });
    if (!business?.installedPlugins?.includes(module)) {
      res.status(403).json({
        success: false,
        message: "This feature isn't installed. Ask an owner or admin to enable it in Settings → Plugins.",
      });
      return;
    }
    next();
  };
}
