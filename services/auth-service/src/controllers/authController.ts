import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { env } from '@zetsales/config/validateEnv';
import { getDb } from '../utils/db.js';
import { sendPasswordResetEmail } from '../utils/mailer.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { BusinessProfileDTO, NotificationDTO, SessionDTO, TeamRole, UserDTO } from '@zetsales/shared';
import {
  isReservedSubdomain,
  slugifyBusinessName,
  workspaceSlugFromHost,
  workspaceUrlForSlug,
} from '../utils/workspaceDomain.js';

export function signToken(
  id: string,
  email: string,
  tenantId: string | null,
  role: TeamRole | null,
  expiresIn: jwt.SignOptions['expiresIn'] = '15m'
) {
  return jwt.sign({ id, email, tenantId, role }, env.JWT_SECRET, { expiresIn });
}

export function setAuthCookie(res: Response, token: string) {
  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  res.cookie('token', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

export function clearAuthCookie(res: Response) {
  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  res.clearCookie('token', {
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 5;

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Refresh tokens are only ever persisted as a hash (see hashToken above) alongside session
// metadata, never in raw form — a DB leak alone can't be used to impersonate a session.
function signRefreshToken(id: string): { token: string; tokenId: string } {
  const tokenId = crypto.randomUUID();
  const token = jwt.sign({ id, tokenId }, env.JWT_SECRET, { expiresIn: '30d' });
  return { token, tokenId };
}

export function setRefreshCookie(res: Response, token: string) {
  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    // Scoped to /api/v1/auth so this cookie is never sent to commerce-service or other routes.
    path: '/api/v1/auth',
    maxAge: REFRESH_TOKEN_TTL_MS,
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

export function clearRefreshCookie(res: Response) {
  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();
  res.clearCookie('refreshToken', {
    path: '/api/v1/auth',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  });
}

// Issues a new refresh token, stores its hash + session metadata on the user doc (capped at
// MAX_SESSIONS_PER_USER, oldest evicted), and sets the refresh cookie. Used on login/signup and
// on every /refresh rotation. Skipped for the browser extension's `longLived` bearer-token login,
// which intentionally stays a single non-rotating token (no refresh cookie, no session tracking).
async function issueRefreshSession(res: Response, userId: string, req: Request): Promise<void> {
  const db = getDb();
  const { token, tokenId } = signRefreshToken(userId);
  const entry = {
    tokenId,
    tokenHash: hashToken(token),
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    userAgent: req.headers['user-agent'] ?? null,
    ip: getClientIp(req),
  };

  await db.collection('users').updateOne({ _id: new ObjectId(userId) }, [
    {
      $set: {
        refreshTokens: {
          $slice: [{ $concatArrays: [{ $ifNull: ['$refreshTokens', []] }, [entry]] }, -MAX_SESSIONS_PER_USER],
        },
      },
    },
  ]);

  setRefreshCookie(res, token);
}

function getClientIp(req: Request): string | null {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.ip || req.socket.remoteAddress || null;
}

// Flags a login as coming from a device with no matching User-Agent among the user's existing
// sessions and records a notification for it. Exact UA matching means a browser auto-update can
// occasionally cause a false "new device" flag — an acceptable v1 tradeoff over real device
// fingerprinting. Skipped entirely on a user's very first-ever session (nothing to compare yet).
async function notifyIfNewDevice(
  user: { _id: ObjectId; refreshTokens?: Array<{ userAgent: string | null }> },
  req: Request
): Promise<void> {
  const existingSessions = user.refreshTokens ?? [];
  if (existingSessions.length === 0) return;

  const userAgent = req.headers['user-agent'] ?? null;
  const isKnownDevice = existingSessions.some((s) => s.userAgent === userAgent);
  if (isKnownDevice) return;

  const ip = getClientIp(req);
  const { browser, os } = parseUserAgent(userAgent);
  await getDb()
    .collection('notifications')
    .insertOne({
      userId: user._id,
      type: 'new_device_login',
      title: 'New sign-in to your account',
      body: `A new sign-in from ${browser} on ${os}${ip ? ` (${ip})` : ''}.`,
      read: false,
      createdAt: new Date(),
      meta: { userAgent, ip },
    });
}

// Minimal, dependency-free UA parsing — only needs to be good enough for a human-readable
// notification/session label, not full device/version fingerprinting.
function parseUserAgent(ua: string | null): { browser: string; os: string } {
  if (!ua) return { browser: 'Unknown browser', os: 'Unknown OS' };

  let browser = 'Unknown browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/safari/i.test(ua)) browser = 'Safari';

  let os = 'Unknown OS';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ios/i.test(ua)) os = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  return { browser, os };
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
  let businessSlug: string | null = null;
  let businessUrl: string | null = null;
  let businessType: UserDTO['businessType'] = null;
  let installedPlugins: UserDTO['installedPlugins'] = [];
  if (user.tenantId) {
    const db = getDb();
    const business = await db.collection('businesses').findOne({ _id: new ObjectId(user.tenantId) });
    businessName = business?.name ?? null;
    businessSlug = business?.slug ?? null;
    businessUrl = businessSlug ? workspaceUrlForSlug(businessSlug) : null;
    businessType = business?.businessType ?? null;
    installedPlugins = business?.installedPlugins ?? [];
  }
  return {
    id: user._id.toString(),
    email: user.email,
    isVerified: user.isVerified ?? false,
    tenantId: user.tenantId ?? null,
    isOnboarded: user.isOnboarded ?? false,
    businessName,
    businessSlug,
    businessUrl,
    businessType,
    role: user.role ?? null,
    installedPlugins,
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
    await issueRefreshSession(res, result.insertedId.toString(), req);

    const userDto: UserDTO = {
      id: result.insertedId.toString(),
      email: email.toLowerCase(),
      isVerified: true,
      tenantId: null,
      isOnboarded: false,
      businessName: null,
      businessSlug: null,
      businessUrl: null,
      businessType: null,
      role: null,
      installedPlugins: [],
    };

    res.status(201).json({ success: true, user: userDto, token });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password, longLived } = req.body;
    const requestedWorkspace = workspaceSlugFromHost(req.headers['x-forwarded-host'] ?? req.headers.host);

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

    if (requestedWorkspace) {
      if (!user.tenantId) {
        res.status(403).json({ success: false, message: 'This account is not part of this workspace.' });
        return;
      }
      const business = await db.collection('businesses').findOne(
        { _id: new ObjectId(user.tenantId) },
        { projection: { slug: 1, name: 1 } }
      );
      if (!business?.slug || business.slug !== requestedWorkspace) {
        res.status(403).json({ success: false, message: 'Use app.zetsales.com for your business to login.' });
        return;
      }
    }

    // Only the web app's cookie-session login participates in device tracking/notifications —
    // the extension's longLived bearer token never gets a refreshTokens session entry (see
    // issueRefreshSession), so there's nothing to compare it against anyway.
    if (longLived !== true) {
      await notifyIfNewDevice(user, req);
    }

    // longLived is used by the browser extension's own login (not the web app's cookie session),
    // so a user doesn't have to re-authenticate the extension every week.
    const token = signToken(
      user._id.toString(),
      user.email,
      user.tenantId ? user.tenantId.toString() : null,
      (user.role as TeamRole | undefined) || null,
      longLived === true ? '60d' : ('15m' as const)
    );
    setAuthCookie(res, token);
    // longLived (extension) sessions stay a single non-rotating bearer token — no refresh cookie.
    if (longLived !== true) {
      await issueRefreshSession(res, user._id.toString(), req);
    }

    const userDto = await toUserDto(user as any);
    res.status(200).json({ success: true, user: userDto, token });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function logout(req: Request, res: Response) {
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, env.JWT_SECRET) as { id: string };
      await getDb()
        .collection('users')
        .updateOne({ _id: new ObjectId(payload.id) }, { $pull: { refreshTokens: { tokenHash: hashToken(refreshToken) } } as any });
    } catch {
      // Invalid/expired refresh token — nothing to revoke server-side, just clear cookies below.
    }
  }
  clearAuthCookie(res);
  clearRefreshCookie(res);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
}

export async function refresh(req: Request, res: Response) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      res.status(401).json({ success: false, message: 'No refresh token provided' });
      return;
    }

    let payload: { id: string; tokenId: string };
    try {
      payload = jwt.verify(refreshToken, env.JWT_SECRET) as { id: string; tokenId: string };
    } catch {
      res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
      return;
    }

    const db = getDb();
    const tokenHash = hashToken(refreshToken);
    const user = await db.collection('users').findOne({ _id: new ObjectId(payload.id) });
    const matched = user?.refreshTokens?.find((t: { tokenHash: string }) => t.tokenHash === tokenHash);

    if (!user || !matched) {
      // Token not found among the user's known sessions — either expired/pruned, already
      // rotated (reuse), or revoked. Reject; there's nothing more specific to distinguish safely.
      clearRefreshCookie(res);
      res.status(401).json({ success: false, message: 'Refresh token not recognized' });
      return;
    }

    // Rotate: remove the used token, issue a fresh access + refresh token pair.
    await db.collection('users').updateOne({ _id: user._id }, { $pull: { refreshTokens: { tokenId: matched.tokenId } } as any });

    const accessToken = signToken(
      user._id.toString(),
      user.email,
      user.tenantId ? user.tenantId.toString() : null,
      (user.role as TeamRole | undefined) || null
    );
    setAuthCookie(res, accessToken);
    await issueRefreshSession(res, user._id.toString(), req);

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function listSessions(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const currentHash = req.cookies?.refreshToken ? hashToken(req.cookies.refreshToken) : null;
    const user = await getDb().collection('users').findOne({ _id: new ObjectId(authUser.id) });
    const sessions: SessionDTO[] = (user?.refreshTokens ?? []).map(
      (t: { tokenId: string; tokenHash: string; userAgent: string | null; ip: string | null; createdAt: Date }) => ({
        tokenId: t.tokenId,
        userAgent: t.userAgent ?? null,
        ip: t.ip ?? null,
        createdAt: t.createdAt.toISOString(),
        current: t.tokenHash === currentHash,
      })
    );

    res.status(200).json({ success: true, sessions });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function revokeSession(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { tokenId } = req.params;
    await getDb()
      .collection('users')
      .updateOne({ _id: new ObjectId(authUser.id) }, { $pull: { refreshTokens: { tokenId } } as any });

    res.status(200).json({ success: true, message: 'Session revoked' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function revokeAllSessions(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const currentHash = req.cookies?.refreshToken ? hashToken(req.cookies.refreshToken) : null;
    const db = getDb();
    if (currentHash) {
      // Keep the caller's own session alive — "log out everywhere else", not a self-lockout.
      await db
        .collection('users')
        .updateOne({ _id: new ObjectId(authUser.id) }, { $pull: { refreshTokens: { tokenHash: { $ne: currentHash } } } as any });
    } else {
      await db.collection('users').updateOne({ _id: new ObjectId(authUser.id) }, { $set: { refreshTokens: [] } });
    }

    res.status(200).json({ success: true, message: 'All other sessions revoked' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function listNotifications(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const db = getDb();
    const docs = await db
      .collection('notifications')
      .find({ userId: new ObjectId(authUser.id) })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    const notifications: NotificationDTO[] = docs.map((d) => ({
      id: d._id.toString(),
      type: d.type,
      title: d.title,
      body: d.body,
      read: d.read,
      createdAt: d.createdAt.toISOString(),
      meta: d.meta ?? { userAgent: null, ip: null },
    }));
    const unreadCount = notifications.filter((n) => !n.read).length;

    res.status(200).json({ success: true, notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function markAllNotificationsRead(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    await getDb()
      .collection('notifications')
      .updateMany({ userId: new ObjectId(authUser.id), read: false }, { $set: { read: true } });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
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

// Every field optional (a PATCH can touch just one), but at least one must actually be present —
// enforced with .refine below rather than in the route, so the "nothing to update" case gets a
// real validation message instead of silently no-op'ing.
const updateBusinessSchema = z
  .object({
    name: z.string().trim().min(2, 'Store name is required').max(80).optional(),
    businessType: z
      .enum(['I manufacture my own products', 'I import my products', 'I buy from local wholesalers', 'I dropship — I never hold stock'])
      .optional(),
    phone: z.string().trim().min(6, 'Enter a valid phone number').optional(),
    channels: z.array(z.enum(['Facebook', 'Instagram', 'WhatsApp', 'Website', 'Physical Store'])).min(1, 'Select at least one channel').optional(),
    monthlyOrders: z.string().trim().min(1).optional(),
    teamSize: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export async function updateBusiness(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser?.tenantId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = updateBusinessSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Invalid update' });
      return;
    }

    const db = getDb();
    await db.collection('businesses').updateOne(
      { _id: new ObjectId(authUser.tenantId) },
      { $set: { ...parsed.data, updatedAt: new Date() } }
    );

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

export async function getBusinessProfile(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser?.tenantId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const business = await getDb().collection('businesses').findOne({ _id: new ObjectId(authUser.tenantId) });
    if (!business) {
      res.status(404).json({ success: false, message: 'Business not found' });
      return;
    }

    const profile: BusinessProfileDTO = {
      id: business._id.toString(),
      name: business.name,
      businessType: business.businessType ?? null,
      phone: business.phone ?? null,
      channels: business.channels ?? [],
      monthlyOrders: business.monthlyOrders ?? null,
      teamSize: business.teamSize ?? null,
      currency: business.currency ?? 'BDT',
      businessSlug: business.slug ?? null,
      businessUrl: business.slug ? workspaceUrlForSlug(business.slug) : null,
    };
    res.status(200).json({ success: true, profile });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function changePassword(req: AuthenticatedRequest, res: Response) {
  try {
    const authUser = req.user;
    if (!authUser) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Invalid password' });
      return;
    }

    const db = getDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(authUser.id) });
    if (!user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const match = await bcrypt.compare(parsed.data.currentPassword, user.password);
    if (!match) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(parsed.data.newPassword, salt);
    await db.collection('users').updateOne({ _id: user._id }, { $set: { password: hashedPassword, updatedAt: new Date() } });

    res.status(200).json({ success: true, message: 'Password updated.' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

// Always responds success regardless of whether the email matches an account — otherwise the
// response itself would let a caller enumerate which emails have ZetSales accounts.
export async function requestPasswordReset(req: Request, res: Response) {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Invalid email' });
      return;
    }

    const db = getDb();
    const email = parsed.data.email.toLowerCase();
    const user = await db.collection('users').findOne({ email });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await db.collection('passwordResets').insertOne({
        userId: user._id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        used: false,
        createdAt: new Date(),
      });

      const business = user.tenantId ? await db.collection('businesses').findOne({ _id: new ObjectId(user.tenantId) }) : null;
      const base = business?.slug ? workspaceUrlForSlug(business.slug) : process.env.FRONTEND_URL || 'http://localhost:3000';
      const resetUrl = `${base}/reset-password?token=${token}`;

      try {
        await sendPasswordResetEmail(email, resetUrl);
      } catch (error) {
        // Delivery failure shouldn't surface to the caller (would reveal the email exists) —
        // logged here so it's still visible in server logs for debugging.
        console.error('[requestPasswordReset] failed to send email:', (error as Error).message);
      }
    }

    res.status(200).json({ success: true, message: 'If that email has an account, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

export async function resetPassword(req: Request, res: Response) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: parsed.error.issues[0]?.message ?? 'Invalid request' });
      return;
    }

    const db = getDb();
    const tokenHash = hashToken(parsed.data.token);
    const reset = await db.collection('passwordResets').findOne({ tokenHash, used: false });

    if (!reset || new Date(reset.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ success: false, message: 'This reset link is invalid or has expired.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(parsed.data.newPassword, salt);
    await db.collection('users').updateOne({ _id: reset.userId }, { $set: { password: hashedPassword, updatedAt: new Date() } });
    await db.collection('passwordResets').updateOne({ _id: reset._id }, { $set: { used: true } });

    res.status(200).json({ success: true, message: 'Password updated. You can now sign in.' });
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

async function createUniqueBusinessSlug(name: string): Promise<string> {
  const db = getDb();
  const rawBase = slugifyBusinessName(name);
  const base = isReservedSubdomain(rawBase) ? `${rawBase}store` : rawBase;
  let slug = base;
  let suffix = 2;

  while (await db.collection('businesses').findOne({ slug }, { projection: { _id: 1 } })) {
    slug = `${base}${suffix}`;
    suffix += 1;
  }

  return slug;
}

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
    const slug = await createUniqueBusinessSlug(payload.businessName);

    const businessResult = await db.collection('businesses').insertOne({
      ownerId: new ObjectId(authUser.id),
      name: payload.businessName,
      slug,
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
    await issueRefreshSession(res, authUser.id, req);

    const userDto: UserDTO = {
      id: authUser.id,
      email: authUser.email,
      isVerified: true,
      tenantId,
      isOnboarded: true,
      businessName: payload.businessName,
      businessSlug: slug,
      businessUrl: workspaceUrlForSlug(slug),
      businessType: payload.businessType,
      role: 'owner',
      installedPlugins: [],
    };

    res.status(200).json({ success: true, user: userDto, token });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function allowSubdomain(req: Request, res: Response) {
  try {
    const domain = typeof req.query.domain === 'string' ? req.query.domain : '';
    const slug = workspaceSlugFromHost(domain);
    if (!slug) {
      res.status(404).send('not allowed');
      return;
    }

    const db = getDb();
    const business = await db.collection('businesses').findOne({ slug }, { projection: { _id: 1 } });
    if (!business) {
      res.status(404).send('not allowed');
      return;
    }

    res.status(200).send('ok');
  } catch {
    res.status(500).send('error');
  }
}
