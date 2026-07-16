import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import {
  importStoreOrdersStream, listOrders, getOrder, getOrderInventorySnapshot, getOrderFulfillmentStatus, getOrderStats, getOrderTrends, updateOrder, bulkUpdateOrders, markPartialDelivered,
  blockCustomer, unblockCustomer, markPaymentCollected, bulkMarkPaymentCollected, bulkRecheckFraud, claimOrder, heartbeatOrderClaim, releaseOrderClaim, upsellOrder, removeOrderLineItem, createOrder, splitOrder,
  getReadyToPrintOrders, markOrdersPrinted, ensureOrderInvoices, getCourierShipmentStats, dispatchScanHandover,
} from '../controllers/ordersController.js';

const router: Router = Router();
const requireOrders = requireModule('orders');

// Static/literal sub-paths must be registered before the `/orders/:id` param routes, otherwise
// Express matches "stats"/"bulk" as an :id value first.
router.get('/orders/stats', requireAuth, requireTenant, requireOrders, asyncHandler(getOrderStats));
router.get('/orders/courier-stats', requireAuth, requireTenant, requireOrders, asyncHandler(getCourierShipmentStats));
router.get('/orders/trends', requireAuth, requireTenant, requireOrders, asyncHandler(getOrderTrends));
router.patch('/orders/bulk', requireAuth, requireTenant, requireOrders, asyncHandler(bulkUpdateOrders));
router.post('/orders/dispatch-scan', requireAuth, requireTenant, requireOrders, asyncHandler(dispatchScanHandover));
router.post('/orders/bulk/mark-collected', requireAuth, requireTenant, requireOrders, asyncHandler(bulkMarkPaymentCollected));
router.post('/orders/bulk/recheck-fraud', requireAuth, requireTenant, requireOrders, asyncHandler(bulkRecheckFraud));
router.get('/orders/ready-to-print', requireAuth, requireTenant, requireOrders, asyncHandler(getReadyToPrintOrders));
router.post('/orders/ensure-invoices', requireAuth, requireTenant, requireOrders, asyncHandler(ensureOrderInvoices));
router.post('/orders/mark-printed', requireAuth, requireTenant, requireOrders, asyncHandler(markOrdersPrinted));

router.get('/orders', requireAuth, requireTenant, requireOrders, asyncHandler(listOrders));
router.post('/orders', requireAuth, requireTenant, requireOrders, asyncHandler(createOrder));
router.get('/orders/:id', requireAuth, requireTenant, requireOrders, asyncHandler(getOrder));
router.get('/orders/:id/inventory-snapshot', requireAuth, requireTenant, requireOrders, asyncHandler(getOrderInventorySnapshot));
router.get('/orders/:id/fulfillment-status', requireAuth, requireTenant, requireOrders, asyncHandler(getOrderFulfillmentStatus));
router.patch('/orders/:id', requireAuth, requireTenant, requireOrders, asyncHandler(updateOrder));
router.post('/orders/:id/partial-deliver', requireAuth, requireTenant, requireOrders, asyncHandler(markPartialDelivered));
router.post('/orders/:id/block-customer', requireAuth, requireTenant, requireOrders, asyncHandler(blockCustomer));
router.post('/orders/:id/unblock-customer', requireAuth, requireTenant, requireOrders, asyncHandler(unblockCustomer));
router.post('/orders/:id/mark-collected', requireAuth, requireTenant, requireOrders, asyncHandler(markPaymentCollected));
router.post('/orders/:id/claim', requireAuth, requireTenant, requireOrders, asyncHandler(claimOrder));
router.post('/orders/:id/claim/heartbeat', requireAuth, requireTenant, requireOrders, asyncHandler(heartbeatOrderClaim));
router.post('/orders/:id/release', requireAuth, requireTenant, requireOrders, asyncHandler(releaseOrderClaim));
router.post('/orders/:id/upsell', requireAuth, requireTenant, requireOrders, asyncHandler(upsellOrder));
router.delete('/orders/:id/line-items/:index', requireAuth, requireTenant, requireOrders, asyncHandler(removeOrderLineItem));
router.post('/orders/:id/split', requireAuth, requireTenant, requireOrders, asyncHandler(splitOrder));
router.get('/stores/:storeId/orders/import/stream', requireAuth, requireTenant, requireOrders, asyncHandler(importStoreOrdersStream));

export default router;
