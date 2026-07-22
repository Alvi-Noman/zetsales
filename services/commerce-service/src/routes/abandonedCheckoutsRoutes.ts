import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listAbandonedCheckouts, getAbandonedCheckoutStats } from '../controllers/abandonedCheckoutsController.js';

const router: Router = Router();
const requireOrders = requireModule('orders');

router.get('/abandoned-checkouts/stats', requireAuth, requireTenant, requireOrders, asyncHandler(getAbandonedCheckoutStats));
router.get('/abandoned-checkouts', requireAuth, requireTenant, requireOrders, asyncHandler(listAbandonedCheckouts));

export default router;
