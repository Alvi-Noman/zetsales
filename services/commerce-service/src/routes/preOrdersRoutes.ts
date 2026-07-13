import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { getPreOrderTargets, setPreOrderTarget, deletePreOrderTarget } from '../controllers/preOrdersController.js';

const router: Router = Router();
const requirePreOrders = requireModule('preOrders');

router.get('/pre-orders/targets', requireAuth, requireTenant, requirePreOrders, getPreOrderTargets);
router.put('/pre-orders/targets/:productId/:variantId', requireAuth, requireTenant, requirePreOrders, setPreOrderTarget);
router.delete('/pre-orders/targets/:productId/:variantId', requireAuth, requireTenant, requirePreOrders, deletePreOrderTarget);

export default router;
