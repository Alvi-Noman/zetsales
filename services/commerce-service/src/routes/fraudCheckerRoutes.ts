import { Router } from 'express';
import { requireAuth, requireTenant, requirePlugin, requireModule } from '../middleware/authMiddleware.js';
import { getFraudCheckerOverview } from '../controllers/fraudCheckerController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requirePlugin('fraudChecker'), requireModule('fraudChecker')] as const;

router.get('/fraud-checker/overview', ...guard, getFraudCheckerOverview);

export default router;
