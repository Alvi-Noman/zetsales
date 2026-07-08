import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { getCallCenterOverview } from '../controllers/callCenterController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requireModule('callCenter')] as const;

router.get('/call-center/overview', ...guard, getCallCenterOverview);

export default router;
