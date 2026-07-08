import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  listWarehouses,
  createWarehouse,
  renameWarehouse,
  deleteWarehouse,
  addWarehouseBin,
  removeWarehouseBin,
} from '../controllers/warehousesController.js';

const router: Router = Router();
const requireInventory = requireModule('inventory');

router.get('/warehouses', requireAuth, requireTenant, requireInventory, listWarehouses);
router.post('/warehouses', requireAuth, requireTenant, requireInventory, createWarehouse);
router.patch('/warehouses/:id', requireAuth, requireTenant, requireInventory, renameWarehouse);
router.delete('/warehouses/:id', requireAuth, requireTenant, requireInventory, deleteWarehouse);
router.post('/warehouses/:id/bins', requireAuth, requireTenant, requireInventory, addWarehouseBin);
router.post('/warehouses/:id/bins/remove', requireAuth, requireTenant, requireInventory, removeWarehouseBin);

export default router;
