import { Router } from 'express';
import { requireAuth, requireTenant } from '../middleware/authMiddleware.js';
import { importStoreOrdersStream, listOrders, getOrder, getOrderStats, getOrderTrends, updateOrder, bulkUpdateOrders } from '../controllers/ordersController.js';

const router: Router = Router();

// Static/literal sub-paths must be registered before the `/orders/:id` param routes, otherwise
// Express matches "stats"/"bulk" as an :id value first.
router.get('/orders/stats', requireAuth, requireTenant, getOrderStats);
router.get('/orders/trends', requireAuth, requireTenant, getOrderTrends);
router.patch('/orders/bulk', requireAuth, requireTenant, bulkUpdateOrders);

router.get('/orders', requireAuth, requireTenant, listOrders);
router.get('/orders/:id', requireAuth, requireTenant, getOrder);
router.patch('/orders/:id', requireAuth, requireTenant, updateOrder);
router.get('/stores/:storeId/orders/import/stream', requireAuth, requireTenant, importStoreOrdersStream);

export default router;
