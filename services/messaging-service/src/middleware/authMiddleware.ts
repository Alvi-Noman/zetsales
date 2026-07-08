import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { ROLE_DEFINITIONS, type ModuleKey, type TeamRole } from '@zetsales/shared';

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

    const payload = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      email: string;
      tenantId: string | null;
      role?: TeamRole | null;
    };
    req.user = { id: payload.id, email: payload.email, tenantId: payload.tenantId ?? null, role: payload.role ?? null };
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
}

// Messaging accounts/conversations only exist once onboarding is complete — same guard shape as
// commerce-service's requireTenant.
export function requireTenant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user?.tenantId) {
    res.status(403).json({ success: false, message: 'Finish onboarding before connecting messaging.' });
    return;
  }
  next();
}

export function requireModule(module: ModuleKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    const definition = role ? ROLE_DEFINITIONS[role] : ROLE_DEFINITIONS.owner;
    if (!definition.modules.includes(module)) {
      res.status(403).json({ success: false, message: 'You do not have access to this section.' });
      return;
    }
    if (req.method !== 'GET' && !definition.canWrite) {
      res.status(403).json({ success: false, message: 'Your role has read-only access.' });
      return;
    }
    next();
  };
}
