import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { requireAppToken } from '../middleware/appAuthMiddleware.js';
import { listApps, installApp, uninstallApp, registerWebhook, createSessionToken } from '../controllers/appsController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requireModule('settings')] as const;

router.get('/apps', ...guard, listApps);
router.post('/apps/:appKey/install', ...guard, installApp);
router.delete('/apps/:appKey/install', ...guard, uninstallApp);
router.post('/apps/:appKey/session-token', requireAuth, requireTenant, createSessionToken);
router.post('/apps/:appKey/webhooks', requireAppToken, registerWebhook);

export default router;
