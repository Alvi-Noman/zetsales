import { Router } from 'express';
import { requireAuth, requireTenant, requireModule } from '../middleware/authMiddleware.js';
import {
  getAnalyticsLayout,
  saveAnalyticsLayout,
  getAnalyticsSummary,
  getOrderFunnel,
  getConfirmationPerformance,
  getSalesOverTime,
  getAovOverTime,
  getSalesByStore,
  getTopProducts,
  getFulfillmentTime,
  getCourierPerformance,
  getDeliveryZones,
  getCancelReasons,
  getHoldReasons,
  getNewVsReturning,
  getTopCustomers,
  getRfmSegments,
  getRiskSegments,
  getCustomersByZone,
  getGrossProfitOverTime,
  getProfitByProduct,
  getSalesByPaymentMethod,
  getDiscountsOverTime,
  getCodCashflow,
  getAbcAnalysis,
  getSellThrough,
  getStockoutCancellations,
  getItemsBoughtTogether,
  getReturnedProducts,
  getWeeklyPatterns,
  getPartialDeliveryRate,
  getChannelPerformance,
  getInventoryAdjustments,
  getInventoryThroughput,
  getShippingAndTracking,
  getNewCustomerRevenue,
  getNetSalesOverTime,
  getProfitByCourier,
  getProfitByZone,
  getDeadStock,
  getDuplicateOrders,
  getCourierReconciliation,
  getMarketingRoas,
  getAddressQuality,
  getSlaBreach,
  getCallOutcomes,
  getFlagReasons,
  getRescheduleEffectiveness,
  getBlocklistHitRate,
  getRtoLoss,
  getMarginWaterfall,
  getCohortRetention,
  getProductPerformance,
  getConfirmedSalesOverTime,
  getPaymentStatusBreakdown,
  getEmployeeActivity,
  getProductCourierHistory,
  getDailyLeadQuantity,
  getCodChangeLog,
  getHandoverSales,
} from '../controllers/analyticsController.js';

const router: Router = Router();
const requireAnalytics = requireModule('analytics');
const guard = [requireAuth, requireTenant, requireAnalytics] as const;

router.get('/analytics/layout', ...guard, getAnalyticsLayout);
router.put('/analytics/layout', ...guard, saveAnalyticsLayout);
router.get('/analytics/summary', ...guard, getAnalyticsSummary);

router.get('/analytics/order-funnel', ...guard, getOrderFunnel);
router.get('/analytics/confirmation-performance', ...guard, getConfirmationPerformance);
router.get('/analytics/sales-over-time', ...guard, getSalesOverTime);
router.get('/analytics/aov-over-time', ...guard, getAovOverTime);
router.get('/analytics/sales-by-store', ...guard, getSalesByStore);
router.get('/analytics/top-products', ...guard, getTopProducts);
router.get('/analytics/fulfillment-time', ...guard, getFulfillmentTime);

router.get('/analytics/courier-performance', ...guard, getCourierPerformance);
router.get('/analytics/delivery-zones', ...guard, getDeliveryZones);
router.get('/analytics/cancel-reasons', ...guard, getCancelReasons);
router.get('/analytics/hold-reasons', ...guard, getHoldReasons);

router.get('/analytics/new-vs-returning', ...guard, getNewVsReturning);
router.get('/analytics/top-customers', ...guard, getTopCustomers);
router.get('/analytics/rfm-segments', ...guard, getRfmSegments);
router.get('/analytics/risk-segments', ...guard, getRiskSegments);
router.get('/analytics/customers-by-zone', ...guard, getCustomersByZone);

router.get('/analytics/gross-profit-over-time', ...guard, getGrossProfitOverTime);
router.get('/analytics/profit-by-product', ...guard, getProfitByProduct);
router.get('/analytics/sales-by-payment-method', ...guard, getSalesByPaymentMethod);
router.get('/analytics/discounts-over-time', ...guard, getDiscountsOverTime);
router.get('/analytics/cod-cashflow', ...guard, getCodCashflow);

router.get('/analytics/abc-analysis', ...guard, getAbcAnalysis);
router.get('/analytics/sell-through', ...guard, getSellThrough);
router.get('/analytics/stockout-cancellations', ...guard, getStockoutCancellations);
router.get('/analytics/items-bought-together', ...guard, getItemsBoughtTogether);
router.get('/analytics/returned-products', ...guard, getReturnedProducts);
router.get('/analytics/weekly-patterns', ...guard, getWeeklyPatterns);

router.get('/analytics/partial-delivery-rate', ...guard, getPartialDeliveryRate);
router.get('/analytics/channel-performance', ...guard, getChannelPerformance);
router.get('/analytics/inventory-adjustments', ...guard, getInventoryAdjustments);
router.get('/analytics/inventory-throughput', ...guard, getInventoryThroughput);
router.get('/analytics/shipping-and-tracking', ...guard, getShippingAndTracking);
router.get('/analytics/new-customer-revenue', ...guard, getNewCustomerRevenue);

router.get('/analytics/net-sales-over-time', ...guard, getNetSalesOverTime);
router.get('/analytics/profit-by-courier', ...guard, getProfitByCourier);
router.get('/analytics/profit-by-zone', ...guard, getProfitByZone);
router.get('/analytics/dead-stock', ...guard, getDeadStock);
router.get('/analytics/duplicate-orders', ...guard, getDuplicateOrders);

router.get('/analytics/courier-reconciliation', ...guard, getCourierReconciliation);
router.get('/analytics/marketing-roas', ...guard, getMarketingRoas);
router.get('/analytics/address-quality', ...guard, getAddressQuality);
router.get('/analytics/sla-breach', ...guard, getSlaBreach);

router.get('/analytics/call-outcomes', ...guard, getCallOutcomes);
router.get('/analytics/flag-reasons', ...guard, getFlagReasons);
router.get('/analytics/reschedule-effectiveness', ...guard, getRescheduleEffectiveness);
router.get('/analytics/blocklist-hit-rate', ...guard, getBlocklistHitRate);
router.get('/analytics/rto-loss', ...guard, getRtoLoss);
router.get('/analytics/margin-waterfall', ...guard, getMarginWaterfall);
router.get('/analytics/cohort-retention', ...guard, getCohortRetention);
router.get('/analytics/product-performance', ...guard, getProductPerformance);

router.get('/analytics/confirmed-sales-over-time', ...guard, getConfirmedSalesOverTime);
router.get('/analytics/payment-status-breakdown', ...guard, getPaymentStatusBreakdown);
router.get('/analytics/employee-activity', ...guard, getEmployeeActivity);
router.get('/analytics/product-courier-history', ...guard, getProductCourierHistory);
router.get('/analytics/daily-lead-quantity', ...guard, getDailyLeadQuantity);
router.get('/analytics/cod-change-log', ...guard, getCodChangeLog);
router.get('/analytics/handover-sales', ...guard, getHandoverSales);

export default router;
