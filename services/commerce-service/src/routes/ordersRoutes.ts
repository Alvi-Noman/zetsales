import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { importStoreOrdersStream, listOrders, getOrder, getOrderStats, getOrderTrends, updateOrder, bulkUpdateOrders, markPartialDelivered, blockCustomer, unblockCustomer, markPaymentCollected } from '../controllers/ordersController.js';

const router: Router = Router();
const requireOrders = requireModule('orders');

// Static/literal sub-paths must be registered before the `/orders/:id` param routes, otherwise
// Express matches "stats"/"bulk" as an :id value first.
router.get('/orders/stats', requireAuth, requireTenant, requireOrders, getOrderStats);
router.get('/orders/trends', requireAuth, requireTenant, requireOrders, getOrderTrends);
router.patch('/orders/bulk', requireAuth, requireTenant, requireOrders, bulkUpdateOrders);

router.get('/orders', requireAuth, requireTenant, requireOrders, listOrders);
router.get('/orders/:id', requireAuth, requireTenant, requireOrders, getOrder);
router.patch('/orders/:id', requireAuth, requireTenant, requireOrders, updateOrder);
router.post('/orders/:id/partial-deliver', requireAuth, requireTenant, requireOrders, markPartialDelivered);
router.post('/orders/:id/block-customer', requireAuth, requireTenant, requireOrders, blockCustomer);
router.post('/orders/:id/unblock-customer', requireAuth, requireTenant, requireOrders, unblockCustomer);
router.post('/orders/:id/mark-collected', requireAuth, requireTenant, requireOrders, markPaymentCollected);
router.get('/stores/:storeId/orders/import/stream', requireAuth, requireTenant, requireOrders, importStoreOrdersStream);

export default router;
