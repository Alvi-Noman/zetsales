import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import { authorize, accessToken } from '../controllers/oauthController.js';

const router: Router = Router();

router.get('/authorize', requireAuth, requireTenant, authorize);
router.post('/access_token', accessToken); // public — server-to-server token exchange

export default router;
