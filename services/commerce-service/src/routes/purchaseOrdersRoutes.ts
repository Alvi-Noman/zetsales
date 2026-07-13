import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  listSupplierPurchaseOrders,
  getPurchaseOrder,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  sendPurchaseOrder,
  cancelPurchaseOrder,
} from '../controllers/purchaseOrdersController.js';

const router: Router = Router();
const requireSupplyChain = requireModule('supplyChain');

router.get('/supply-chain/suppliers/:id/purchase-orders', requireAuth, requireTenant, requireSupplyChain, listSupplierPurchaseOrders);
router.post('/supply-chain/purchase-orders', requireAuth, requireTenant, requireSupplyChain, createPurchaseOrder);
router.get('/supply-chain/purchase-orders/:id', requireAuth, requireTenant, requireSupplyChain, getPurchaseOrder);
router.patch('/supply-chain/purchase-orders/:id', requireAuth, requireTenant, requireSupplyChain, updatePurchaseOrder);
router.delete('/supply-chain/purchase-orders/:id', requireAuth, requireTenant, requireSupplyChain, deletePurchaseOrder);
router.post('/supply-chain/purchase-orders/:id/send', requireAuth, requireTenant, requireSupplyChain, sendPurchaseOrder);
router.post('/supply-chain/purchase-orders/:id/cancel', requireAuth, requireTenant, requireSupplyChain, cancelPurchaseOrder);

export default router;
