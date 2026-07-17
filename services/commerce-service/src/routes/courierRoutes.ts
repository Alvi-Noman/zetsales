import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  listCouriers,
  listCourierSummaries,
  connectSteadfast,
  connectPathao,
  removeCourier,
  regenerateCourierWebhookSecret,
  updateChargeRate,
  listSettlements,
  createSettlement,
  deleteSettlement,
  listEligibleHandoverOrders,
  listHandovers,
  createHandover,
  getHandover,
  confirmHandover,
  deleteHandover,
} from '../controllers/couriersController.js';

const router: Router = Router();
const requireIntegrations = requireModule('integrations');
const requireOrders = requireModule('orders');

router.get('/couriers', requireAuth, requireTenant, requireIntegrations, listCouriers);
router.get('/couriers/summaries', requireAuth, requireTenant, requireOrders, listCourierSummaries);
router.post('/couriers/steadfast', requireAuth, requireTenant, requireIntegrations, connectSteadfast);
router.post('/couriers/pathao', requireAuth, requireTenant, requireIntegrations, connectPathao);
router.delete('/couriers/:courierId', requireAuth, requireTenant, requireIntegrations, removeCourier);
router.post('/couriers/:courierId/regenerate-secret', requireAuth, requireTenant, requireIntegrations, regenerateCourierWebhookSecret);
router.patch('/couriers/:courierId/charge-rate', requireAuth, requireTenant, requireIntegrations, updateChargeRate);
router.get('/couriers/:courierId/settlements', requireAuth, requireTenant, requireIntegrations, listSettlements);
router.post('/couriers/:courierId/settlements', requireAuth, requireTenant, requireIntegrations, createSettlement);
router.delete('/couriers/settlements/:settlementId', requireAuth, requireTenant, requireIntegrations, deleteSettlement);

router.get('/couriers/:courierId/eligible-handover-orders', requireAuth, requireTenant, requireIntegrations, listEligibleHandoverOrders);
router.get('/couriers/:courierId/handovers', requireAuth, requireTenant, requireIntegrations, listHandovers);
router.post('/couriers/:courierId/handovers', requireAuth, requireTenant, requireIntegrations, createHandover);
router.get('/couriers/handovers/:handoverId', requireAuth, requireTenant, requireIntegrations, getHandover);
router.patch('/couriers/handovers/:handoverId/confirm', requireAuth, requireTenant, requireIntegrations, confirmHandover);
router.delete('/couriers/handovers/:handoverId', requireAuth, requireTenant, requireIntegrations, deleteHandover);

export default router;
