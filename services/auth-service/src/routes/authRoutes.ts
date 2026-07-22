import { Router } from 'express';
import {
  signup,
  login,
  logout,
  refresh,
  getMe,
  completeOnboarding,
  allowSubdomain,
  updateBusiness,
  getBusinessProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
  listSessions,
  revokeSession,
  revokeAllSessions,
  listNotifications,
  markAllNotificationsRead,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router: Router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/subdomains/allow', allowSubdomain);
router.get('/me', requireAuth, getMe);
router.post('/onboarding', requireAuth, completeOnboarding);
router.patch('/business', requireAuth, updateBusiness);
router.get('/business/profile', requireAuth, getBusinessProfile);
router.patch('/password', requireAuth, changePassword);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.get('/sessions', requireAuth, listSessions);
router.delete('/sessions/:tokenId', requireAuth, revokeSession);
router.post('/sessions/revoke-all', requireAuth, revokeAllSessions);
router.get('/notifications', requireAuth, listNotifications);
router.post('/notifications/read-all', requireAuth, markAllNotificationsRead);

export default router;
