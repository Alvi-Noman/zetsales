import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { updateOrderRiskCheckerSettings } from '../controllers/orderRiskCheckerController.js';

const router: Router = Router();

router.patch('/order-risk-checker/settings', requireAuth, requireTenant, requireModule('settings'), updateOrderRiskCheckerSettings);

export default router;
