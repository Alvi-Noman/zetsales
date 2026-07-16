import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listDeliveryZones, createDeliveryZone, deleteDeliveryZone } from '../controllers/deliveryZonesController.js';

const router: Router = Router();
const requireOrders = requireModule('orders');

router.get('/delivery-zones', requireAuth, requireTenant, requireOrders, asyncHandler(listDeliveryZones));
router.post('/delivery-zones', requireAuth, requireTenant, requireOrders, asyncHandler(createDeliveryZone));
router.delete('/delivery-zones/:id', requireAuth, requireTenant, requireOrders, asyncHandler(deleteDeliveryZone));

export default router;
