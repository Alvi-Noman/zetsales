import { Router } from 'express';
import { signup, login, logout, getMe, completeOnboarding, allowSubdomain, updateBusiness } from '../controllers/authController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router: Router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/logout', logout);
router.get('/subdomains/allow', allowSubdomain);
router.get('/me', requireAuth, getMe);
router.post('/onboarding', requireAuth, completeOnboarding);
router.patch('/business', requireAuth, updateBusiness);

export default router;
