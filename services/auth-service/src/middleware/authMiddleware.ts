import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import { ObjectId } from 'mongodb';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    tenantId: string | null;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
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
    };

    const db = getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(payload.id) });

    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      tenantId: user.tenantId || null,
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
}
