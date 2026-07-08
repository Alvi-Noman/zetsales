import type { Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { signToken, setAuthCookie, toUserDto } from './authController.js';
import type { TeamRole, TeamMemberDTO, TeamInviteDTO, AcceptInvitePreviewDTO } from '@zetsales/shared';

const INVITABLE_ROLES: TeamRole[] = ['admin', 'manager', 'agent', 'viewer'];
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function buildInviteLink(token: string): string {
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';
  return `${base}/invite/${token}`;
}

function toMemberDto(user: any, viewerId: string): TeamMemberDTO {
  return {
    id: user._id.toString(),
    email: user.email,
    role: (user.role as TeamRole) || 'viewer',
    status: 'active',
    isYou: user._id.toString() === viewerId,
    invitedAt: new Date(user.createdAt ?? Date.now()).toISOString(),
    joinedAt: new Date(user.createdAt ?? Date.now()).toISOString(),
  };
}

function toInviteDto(invite: any): TeamInviteDTO {
  return {
    id: invite._id.toString(),
    email: invite.email,
    role: invite.role,
    status: invite.status,
    invitedByEmail: invite.invitedByEmail,
    createdAt: new Date(invite.createdAt).toISOString(),
    expiresAt: new Date(invite.expiresAt).toISOString(),
    expired: invite.status === 'pending' && new Date(invite.expiresAt).getTime() < Date.now(),
    inviteLink: buildInviteLink(invite.token),
  };
}

export async function listMembers(req: AuthenticatedRequest, res: Response) {
  try {
    const db = getDb();
    const tenantId = req.user!.tenantId!;
    const members = await db.collection('users').find({ tenantId }).sort({ createdAt: 1 }).toArray();
    res.json({ success: true, members: members.map((m) => toMemberDto(m, req.user!.id)) });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function listInvites(req: AuthenticatedRequest, res: Response) {
  try {
    const db = getDb();
    const tenantId = req.user!.tenantId!;
    const invites = await db
      .collection('teamInvites')
      .find({ tenantId, status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, invites: invites.map(toInviteDto) });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  role: z.enum(['admin', 'manager', 'agent', 'viewer']),
});

export async function inviteMember(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid invite data', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    const { role } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    const actorRole = req.user!.role;
    const tenantId = req.user!.tenantId!;

    if (!INVITABLE_ROLES.includes(role)) {
      res.status(400).json({ success: false, message: 'Invalid role' });
      return;
    }
    if (role === 'admin' && actorRole !== 'owner') {
      res.status(403).json({ success: false, message: 'Only the owner can grant Admin access.' });
      return;
    }

    const db = getDb();
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      res.status(400).json({ success: false, message: 'That email already has an account.' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);

    const existingInvite = await db.collection('teamInvites').findOne({ tenantId, email, status: 'pending' });
    let inviteDoc;
    if (existingInvite) {
      await db
        .collection('teamInvites')
        .updateOne({ _id: existingInvite._id }, { $set: { role, token, expiresAt, invitedBy: req.user!.id, invitedByEmail: req.user!.email } });
      inviteDoc = { ...existingInvite, role, token, expiresAt, invitedByEmail: req.user!.email };
    } else {
      const result = await db.collection('teamInvites').insertOne({
        tenantId,
        email,
        role,
        token,
        status: 'pending',
        invitedBy: req.user!.id,
        invitedByEmail: req.user!.email,
        createdAt: now,
        expiresAt,
      });
      inviteDoc = { _id: result.insertedId, tenantId, email, role, token, status: 'pending', invitedByEmail: req.user!.email, createdAt: now, expiresAt };
    }

    res.status(201).json({ success: true, invite: toInviteDto(inviteDoc) });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function resendInvite(req: AuthenticatedRequest, res: Response) {
  try {
    const db = getDb();
    const tenantId = req.user!.tenantId!;
    const invite = await db.collection('teamInvites').findOne({ _id: new ObjectId(req.params.id), tenantId });
    if (!invite) {
      res.status(404).json({ success: false, message: 'Invite not found' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await db
      .collection('teamInvites')
      .updateOne({ _id: invite._id }, { $set: { token, expiresAt, status: 'pending' } });
    res.json({ success: true, invite: toInviteDto({ ...invite, token, expiresAt, status: 'pending' }) });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function revokeInvite(req: AuthenticatedRequest, res: Response) {
  try {
    const db = getDb();
    const tenantId = req.user!.tenantId!;
    const result = await db
      .collection('teamInvites')
      .updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: { status: 'revoked' } });
    if (result.matchedCount === 0) {
      res.status(404).json({ success: false, message: 'Invite not found' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function getInvitePreview(req: AuthenticatedRequest, res: Response) {
  try {
    const db = getDb();
    const invite = await db.collection('teamInvites').findOne({ token: req.params.token });
    if (!invite) {
      res.json({ success: true, preview: { valid: false, reason: 'This invite link is not valid.' } as AcceptInvitePreviewDTO });
      return;
    }
    if (invite.status !== 'pending') {
      res.json({ success: true, preview: { valid: false, reason: 'This invite has already been used or was revoked.' } as AcceptInvitePreviewDTO });
      return;
    }
    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      res.json({ success: true, preview: { valid: false, reason: 'This invite has expired. Ask for a new one.' } as AcceptInvitePreviewDTO });
      return;
    }
    const business = await db.collection('businesses').findOne({ _id: new ObjectId(invite.tenantId) });
    const preview: AcceptInvitePreviewDTO = {
      valid: true,
      email: invite.email,
      role: invite.role,
      businessName: business?.name ?? 'your team',
    };
    res.json({ success: true, preview });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

const acceptSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function acceptInvite(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = acceptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid data', errors: parsed.error.flatten().fieldErrors });
      return;
    }

    const db = getDb();
    const invite = await db.collection('teamInvites').findOne({ token: req.params.token });
    if (!invite || invite.status !== 'pending' || new Date(invite.expiresAt).getTime() < Date.now()) {
      res.status(400).json({ success: false, message: 'This invite link is no longer valid.' });
      return;
    }

    const existingUser = await db.collection('users').findOne({ email: invite.email });
    if (existingUser) {
      res.status(400).json({ success: false, message: 'That email already has an account.' });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(parsed.data.password, salt);

    const result = await db.collection('users').insertOne({
      email: invite.email,
      password: hashedPassword,
      isVerified: true,
      tenantId: invite.tenantId,
      isOnboarded: true,
      role: invite.role,
      createdAt: new Date(),
    });

    await db.collection('teamInvites').updateOne({ _id: invite._id }, { $set: { status: 'accepted' } });

    const token = signToken(result.insertedId.toString(), invite.email, invite.tenantId, invite.role);
    setAuthCookie(res, token);

    const userDto = await toUserDto({
      _id: result.insertedId,
      email: invite.email,
      isVerified: true,
      tenantId: invite.tenantId,
      isOnboarded: true,
      role: invite.role,
    });

    res.status(201).json({ success: true, user: userDto });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

const roleUpdateSchema = z.object({
  role: z.enum(['admin', 'manager', 'agent', 'viewer']),
});

export async function updateMemberRole(req: AuthenticatedRequest, res: Response) {
  try {
    const parsed = roleUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, message: 'Invalid role' });
      return;
    }

    const tenantId = req.user!.tenantId!;
    const actorRole = req.user!.role;
    const targetId = req.params.id;

    if (targetId === req.user!.id) {
      res.status(403).json({ success: false, message: "You can't change your own role." });
      return;
    }

    const db = getDb();
    const target = await db.collection('users').findOne({ _id: new ObjectId(targetId), tenantId });
    if (!target) {
      res.status(404).json({ success: false, message: 'Team member not found' });
      return;
    }
    if (target.role === 'owner') {
      res.status(403).json({ success: false, message: "The owner's role can't be changed." });
      return;
    }
    if (actorRole === 'admin' && (target.role === 'admin' || parsed.data.role === 'admin')) {
      res.status(403).json({ success: false, message: 'Only the owner can manage Admin access.' });
      return;
    }

    await db.collection('users').updateOne({ _id: target._id }, { $set: { role: parsed.data.role, updatedAt: new Date() } });
    res.json({ success: true, member: toMemberDto({ ...target, role: parsed.data.role }, req.user!.id) });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}

export async function removeMember(req: AuthenticatedRequest, res: Response) {
  try {
    const tenantId = req.user!.tenantId!;
    const actorRole = req.user!.role;
    const targetId = req.params.id;

    if (targetId === req.user!.id) {
      res.status(403).json({ success: false, message: "You can't remove yourself from the team." });
      return;
    }

    const db = getDb();
    const target = await db.collection('users').findOne({ _id: new ObjectId(targetId), tenantId });
    if (!target) {
      res.status(404).json({ success: false, message: 'Team member not found' });
      return;
    }
    if (target.role === 'owner') {
      res.status(403).json({ success: false, message: 'The owner cannot be removed.' });
      return;
    }
    if (actorRole === 'admin' && target.role === 'admin') {
      res.status(403).json({ success: false, message: 'Only the owner can remove another Admin.' });
      return;
    }

    await db.collection('users').deleteOne({ _id: target._id });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
}
