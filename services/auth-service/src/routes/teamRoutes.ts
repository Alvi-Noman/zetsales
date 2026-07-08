import { Router } from 'express';
import {
  listMembers,
  listInvites,
  inviteMember,
  resendInvite,
  revokeInvite,
  getInvitePreview,
  acceptInvite,
  updateMemberRole,
  removeMember,
} from '../controllers/teamController.js';
import { requireAuth, requireTenant, requireRole } from '../middleware/authMiddleware.js';

const router: Router = Router();

// Public — the invitee isn't authenticated yet.
router.get('/invites/token/:token/preview', getInvitePreview);
router.post('/invites/token/:token/accept', acceptInvite);

router.get('/members', requireAuth, requireTenant, listMembers);
router.patch('/members/:id', requireAuth, requireTenant, requireRole('owner', 'admin'), updateMemberRole);
router.delete('/members/:id', requireAuth, requireTenant, requireRole('owner', 'admin'), removeMember);

router.get('/invites', requireAuth, requireTenant, requireRole('owner', 'admin'), listInvites);
router.post('/invites', requireAuth, requireTenant, requireRole('owner', 'admin'), inviteMember);
router.post('/invites/:id/resend', requireAuth, requireTenant, requireRole('owner', 'admin'), resendInvite);
router.delete('/invites/:id', requireAuth, requireTenant, requireRole('owner', 'admin'), revokeInvite);

export default router;
