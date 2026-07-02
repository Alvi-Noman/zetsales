import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenantId: string | null;
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

    const payload = jwt.verify(token, env.JWT_SECRET) as { id: string; email: string; tenantId: string | null };
    req.user = { id: payload.id, email: payload.email, tenantId: payload.tenantId ?? null };
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
