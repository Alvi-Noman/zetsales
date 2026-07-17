import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { requireAppToken } from '../middleware/appAuthMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listApps, installApp, uninstallApp, registerWebhook, createSessionToken } from '../controllers/appsController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requireModule('settings')] as const;

router.get('/apps', requireAuth, requireTenant, asyncHandler(listApps));
router.post('/apps/:appKey/install', ...guard, asyncHandler(installApp));
router.delete('/apps/:appKey/install', ...guard, asyncHandler(uninstallApp));
router.post('/apps/:appKey/session-token', requireAuth, requireTenant, asyncHandler(createSessionToken));
router.post('/apps/:appKey/webhooks', requireAppToken, asyncHandler(registerWebhook));

export default router;
