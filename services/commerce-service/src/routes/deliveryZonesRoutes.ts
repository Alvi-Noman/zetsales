import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { listDeliveryZones, createDeliveryZone, deleteDeliveryZone } from '../controllers/deliveryZonesController.js';

const router: Router = Router();
const requireOrders = requireModule('orders');

router.get('/delivery-zones', requireAuth, requireTenant, requireOrders, listDeliveryZones);
router.post('/delivery-zones', requireAuth, requireTenant, requireOrders, createDeliveryZone);
router.delete('/delivery-zones/:id', requireAuth, requireTenant, requireOrders, deleteDeliveryZone);

export default router;
