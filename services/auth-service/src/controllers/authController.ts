import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { TeamRole, UserDTO } from '@zetsales/shared';

export function signToken(
  id: string,
  email: string,
  tenantId: string | null,
  role: TeamRole | null,
  expiresIn: jwt.SignOptions['expiresIn'] = '7d'
) {
  return jwt.sign({ id, email, tenantId, role }, env.JWT_SECRET, { expiresIn });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie('token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export async function toUserDto(user: {
  _id: ObjectId;
  email: string;
  isVerified?: boolean;
  tenantId?: string | null;
  isOnboarded?: boolean;
  role?: TeamRole | null;
}): Promise<UserDTO> {
  let businessName: string | null = null;
  let businessType: UserDTO['businessType'] = null;
  let installedPlugins: UserDTO['installedPlugins'] = [];
  let crossTenantRiskEnabled = false;
  if (user.tenantId) {
    const db = getDb();
    const business = await db.collection('businesses').findOne({ _id: new ObjectId(user.tenantId) });
    businessName = business?.name ?? null;
    businessType = business?.businessType ?? null;
    installedPlugins = business?.installedPlugins ?? [];
    crossTenantRiskEnabled = business?.crossTenantRiskEnabled ?? false;
  }
  return {
    id: user._id.toString(),
    email: user.email,
    isVerified: user.isVerified ?? false,
    tenantId: user.tenantId ?? null,
    isOnboarded: user.isOnboarded ?? false,
    businessName,
    businessType,
    role: user.role ?? null,
    installedPlugins,
    crossTenantRiskEnabled,
  };
}

export async function signup(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }
    if (typeof password !== 'string' || password.length < 8) {
      res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
      return;
    }

    const db = getDb();
    const existing = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(400).json({ success: false, message: 'Email is already registered' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const result = await db.collection('users').insertOne({
      email: email.toLowerCase(),
      password: hashedPassword,
      isVerified: true,
      tenantId: null,
      isOnboarded: false,
      role: null,
      createdAt: new Date(),
    });

    const token = signToken(result.insertedId.toString(), email.toLowerCase(), null, null);
    setAuthCookie(res, token);

    const userDto: UserDTO = {
      id: result.insertedId.toString(),
      email: email.toLowerCase(),
      isVerified: true,
      tenantId: null,
      isOnboarded: false,
      businessName: null,
      businessType: null,
      role: null,
      installedPlugins: [],
      crossTenantRiskEnabled: false,
    };

    res.status(201).json({ success: true, user: userDto, token });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password, longLived } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }

    const db = getDb();
    const user = await db.collection('users').findOne({ email: email.toLowerCase() });
    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      res.status(400).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // longLived is used by the browser extension's own login (not the web app's cookie session),
    // so a user doesn't have to re-authenticate the extension every week.
    const token = signToken(
      user._id.toString(),
      user.email,
      user.tenantId ? user.tenantId.toString() : null,
      (user.role as TeamRole | undefined) || null,
      longLived === true ? '60d' : ('7d' as const)
    );
    setAuthCookie(res, token);

    const userDto = await toUserDto(user as any);
    res.status(200).json({ success: true, user: userDto, token });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function logout(_req: Request, res: Response) {
  res.clearCookie('token');
  res.status(200).json({ success: true, message: 'Logged out successfully' });
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const db = getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(authUser.id) });
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const userDto = await toUserDto(user as any);
    res.status(200).json({ success: true, user: userDto });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

const onboardingSchema = z.object({
  businessName: z.string().trim().min(2, 'Business name is required'),
  businessType: z.enum(['I manufacture my own products', 'I import my products', 'I buy from local wholesalers', 'I dropship — I never hold stock']),
  phone: z.string().trim().min(6, 'Phone number is required'),
  channels: z.array(z.enum(['Facebook', 'Instagram', 'WhatsApp', 'Website', 'Physical Store'])).min(1, 'Select at least one channel'),
  monthlyOrders: z.string().trim().min(1),
  teamSize: z.string().trim().min(1),
});

export async function completeOnboarding(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid onboarding data', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const db = getDb();
    const payload = parsed.data;

    const businessResult = await db.collection('businesses').insertOne({
      ownerId: new ObjectId(authUser.id),
      name: payload.businessName,
      businessType: payload.businessType,
      phone: payload.phone,
      channels: payload.channels,
      monthlyOrders: payload.monthlyOrders,
      teamSize: payload.teamSize,
      currency: 'BDT',
      country: 'Bangladesh',
      installedPlugins: [],
      createdAt: new Date(),
    });

    const tenantId = businessResult.insertedId.toString();

    await db.collection('users').updateOne(
      { _id: new ObjectId(authUser.id) },
      { $set: { tenantId, isOnboarded: true, role: 'owner', updatedAt: new Date() } }
    );

    const token = signToken(authUser.id, authUser.email, tenantId, 'owner');
    setAuthCookie(res, token);

    const userDto: UserDTO = {
      id: authUser.id,
      email: authUser.email,
      isVerified: true,
      tenantId,
      isOnboarded: true,
      businessName: payload.businessName,
      businessType: payload.businessType,
      role: 'owner',
      installedPlugins: [],
      crossTenantRiskEnabled: false,
    };

    res.status(200).json({ success: true, user: userDto, token });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}
