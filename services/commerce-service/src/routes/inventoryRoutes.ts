import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  createInboundStock,
  createInboundStockBulk,
  createSupplier,
  getLastInboundForVariant,
  getShrinkageReport,
  listInventory,
  listInventorySkus,
  listMovements,
  listStockShortfalls,
  listSuppliers,
  setInventoryCount,
  updateInventoryLevel,
  getReturnsQueue,
  receiveReturnPackage,
  confirmReturnPackageQc,
  receiveAndConfirmReturnPackage,
  searchDeliveredOrders,
  processManualReturn,
  getInventorySettings,
  updateInventorySettings,
  getLevelReservations,
  receiveInboundStock,
  writeOffInboundStock,
  transferStock,
  getCountContext,
  listBins,
  listVariantLocations,
  getOpenShipments,
  getOverdueShipments,
} from '../controllers/inventoryController.js';

const router: Router = Router();
const requireInventory = requireModule('inventory');

router.get('/inventory', requireAuth, requireTenant, requireInventory, listInventory);
router.get('/inventory/stock-shortfalls', requireAuth, requireTenant, requireInventory, listStockShortfalls);
router.get('/inventory/skus', requireAuth, requireTenant, requireInventory, listInventorySkus);
router.get('/inventory/bins', requireAuth, requireTenant, requireInventory, listBins);
router.get('/inventory/variant-locations', requireAuth, requireTenant, requireInventory, listVariantLocations);
router.get('/inventory/shrinkage', requireAuth, requireTenant, requireInventory, getShrinkageReport);
router.get('/inventory/movements', requireAuth, requireTenant, requireInventory, listMovements);
router.get('/inventory/open-shipments', requireAuth, requireTenant, requireInventory, getOpenShipments);
router.get('/inventory/overdue-shipments', requireAuth, requireTenant, requireInventory, getOverdueShipments);
router.get('/inventory/last-inbound', requireAuth, requireTenant, requireInventory, getLastInboundForVariant);
router.post('/inventory/count', requireAuth, requireTenant, requireInventory, setInventoryCount);
router.post('/inventory/inbound', requireAuth, requireTenant, requireInventory, createInboundStock);
router.post('/inventory/inbound/bulk', requireAuth, requireTenant, requireInventory, createInboundStockBulk);
router.patch('/inventory/levels/:id', requireAuth, requireTenant, requireInventory, updateInventoryLevel);
router.get('/inventory/levels/:id/reservations', requireAuth, requireTenant, requireInventory, getLevelReservations);
router.get('/inventory/count-context', requireAuth, requireTenant, requireInventory, getCountContext);
router.post('/inventory/levels/:id/receive-inbound', requireAuth, requireTenant, requireInventory, receiveInboundStock);
router.post('/inventory/levels/:id/write-off-inbound', requireAuth, requireTenant, requireInventory, writeOffInboundStock);
router.post('/inventory/transfer', requireAuth, requireTenant, requireInventory, transferStock);
router.get('/inventory/returns-queue', requireAuth, requireTenant, requireInventory, getReturnsQueue);
router.post('/inventory/returns/:orderId/receive', requireAuth, requireTenant, requireInventory, receiveReturnPackage);
router.post('/inventory/returns/:orderId/confirm-qc', requireAuth, requireTenant, requireInventory, confirmReturnPackageQc);
router.post('/inventory/returns/:orderId/receive-and-confirm', requireAuth, requireTenant, requireInventory, receiveAndConfirmReturnPackage);
router.get('/inventory/returns/search', requireAuth, requireTenant, requireInventory, searchDeliveredOrders);
router.post('/inventory/returns/:orderId/manual-return', requireAuth, requireTenant, requireInventory, processManualReturn);
router.get('/inventory/settings', requireAuth, requireTenant, requireInventory, getInventorySettings);
router.patch('/inventory/settings', requireAuth, requireTenant, requireInventory, updateInventorySettings);
router.get('/suppliers', requireAuth, requireTenant, requireInventory, listSuppliers);
router.post('/suppliers', requireAuth, requireTenant, requireInventory, createSupplier);

export default router;
