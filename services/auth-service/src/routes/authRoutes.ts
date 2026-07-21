import { Router } from 'express';
import {
  signup,
  login,
  logout,
  getMe,
  completeOnboarding,
  allowSubdomain,
  updateBusiness,
  getBusinessProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router: Router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/subdomains/allow', allowSubdomain);
router.get('/me', requireAuth, getMe);
router.post('/onboarding', requireAuth, completeOnboarding);
router.patch('/business', requireAuth, updateBusiness);
router.get('/business/profile', requireAuth, getBusinessProfile);
router.patch('/password', requireAuth, changePassword);
router.post('/forgot-password', requestPasswordReset);
router.post('/reset-password', resetPassword);

export default router;
