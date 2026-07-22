import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  getStockReport,
  getCourierHandoverOrdersReport,
  getCourierHandoverItemsReport,
  getCourierHandoverFinancialReport,
  getCourierReturnReport,
  getAdvancePaymentReport,
  getProductConfirmationReport,
  getCancelledOrdersReport,
  getCourierHandoverStatusReport,
  getCourierProductDeliveryReport,
  getConfirmDateSaleProfitReport,
  getHandoverDateSaleProfitReport,
  getSaleProfitReport,
  getEmployeeBaseReport,
  getDistrictSalesReport,
  getPurchaseReport,
  getPurchaseItemDetailsReport,
  getSupplierLedgerReport,
  getExpenseReport,
  getIncomeExpenseReport,
  getCourierReconciliationReport,
  getCodChangeLogReport,
  getInventoryAdjustmentReport,
} from '../controllers/reportsController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requireModule('analytics')] as const;

router.get('/reports/stock', ...guard, getStockReport);
router.get('/reports/courier-handover-orders', ...guard, getCourierHandoverOrdersReport);
router.get('/reports/courier-handover-items', ...guard, getCourierHandoverItemsReport);
router.get('/reports/courier-handover-financial', ...guard, getCourierHandoverFinancialReport);
router.get('/reports/courier-return', ...guard, getCourierReturnReport);
router.get('/reports/advance-payment', ...guard, getAdvancePaymentReport);
router.get('/reports/product-confirmation', ...guard, getProductConfirmationReport);
router.get('/reports/cancelled-orders', ...guard, getCancelledOrdersReport);
router.get('/reports/courier-handover-status', ...guard, getCourierHandoverStatusReport);
router.get('/reports/courier-product-delivery', ...guard, getCourierProductDeliveryReport);
router.get('/reports/confirm-date-sale-profit', ...guard, getConfirmDateSaleProfitReport);
router.get('/reports/handover-date-sale-profit', ...guard, getHandoverDateSaleProfitReport);
router.get('/reports/sale-profit', ...guard, getSaleProfitReport);
router.get('/reports/employee-base', ...guard, getEmployeeBaseReport);
router.get('/reports/district-sales', ...guard, getDistrictSalesReport);
router.get('/reports/purchase', ...guard, getPurchaseReport);
router.get('/reports/purchase-item-details', ...guard, getPurchaseItemDetailsReport);
router.get('/reports/supplier-ledger', ...guard, getSupplierLedgerReport);
router.get('/reports/expense', ...guard, getExpenseReport);
router.get('/reports/income-expense', ...guard, getIncomeExpenseReport);
router.get('/reports/courier-reconciliation', ...guard, getCourierReconciliationReport);
router.get('/reports/cod-change-log', ...guard, getCodChangeLogReport);
router.get('/reports/inventory-adjustments', ...guard, getInventoryAdjustmentReport);

export default router;
