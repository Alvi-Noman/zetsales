import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import { createSupplier } from '../controllers/inventoryController.js';
import {
  listSupplierOverviews,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  listSupplierTransactions,
  getSupplierSummary,
  listSupplierShipments,
} from '../controllers/suppliersController.js';

const router: Router = Router();
const requireSupplyChain = requireModule('supplyChain');

router.get('/supply-chain/suppliers', requireAuth, requireTenant, requireSupplyChain, listSupplierOverviews);
// Reuses inventoryController's createSupplier directly (same upsert-by-name logic) rather than
// duplicating it — the advanced Suppliers page needs to create suppliers too, not just the
// lightweight inline pickers in Inventory's modals.
router.post('/supply-chain/suppliers', requireAuth, requireTenant, requireSupplyChain, createSupplier);
router.get('/supply-chain/suppliers/:id', requireAuth, requireTenant, requireSupplyChain, getSupplier);
router.patch('/supply-chain/suppliers/:id', requireAuth, requireTenant, requireSupplyChain, updateSupplier);
router.delete('/supply-chain/suppliers/:id', requireAuth, requireTenant, requireSupplyChain, deleteSupplier);
router.get('/supply-chain/suppliers/:id/transactions', requireAuth, requireTenant, requireSupplyChain, listSupplierTransactions);
router.get('/supply-chain/suppliers/:id/summary', requireAuth, requireTenant, requireSupplyChain, getSupplierSummary);
router.get('/supply-chain/suppliers/:id/shipments', requireAuth, requireTenant, requireSupplyChain, listSupplierShipments);

export default router;
