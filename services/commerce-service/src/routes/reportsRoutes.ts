import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  getStockReport,
  getCourierHandoverOrdersReport,
  getCourierHandoverItemsReport,
  getCourierHandoverFinancialReport,
} from '../controllers/reportsController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requireModule('analytics')] as const;

router.get('/reports/stock', ...guard, getStockReport);
router.get('/reports/courier-handover-orders', ...guard, getCourierHandoverOrdersReport);
router.get('/reports/courier-handover-items', ...guard, getCourierHandoverItemsReport);
router.get('/reports/courier-handover-financial', ...guard, getCourierHandoverFinancialReport);

export default router;
