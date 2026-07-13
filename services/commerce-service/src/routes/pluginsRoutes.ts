import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { getInstalledPlugins, updateInstalledPlugins } from '../controllers/pluginsController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requireModule('settings')] as const;

router.get('/plugins', ...guard, getInstalledPlugins);
router.patch('/plugins', ...guard, updateInstalledPlugins);

export default router;
