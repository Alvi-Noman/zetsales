import type {
  AnalyticsLayoutDTO,
  AnalyticsSummaryDTO,
  AnalyticsSeriesDTO,
  AnalyticsBreakdownDTO,
  OrderFunnelDTO,
  ConfirmationPerformanceDTO,
  ProductRankingDTO,
  FulfillmentTimeDTO,
  NewVsReturningDTO,
  RepeatCustomersDTO,
  RfmSegmentsDTO,
  CodCashflowDTO,
  SellThroughDTO,
  StockoutCancellationsDTO,
  ItemsBoughtTogetherDTO,
  WeeklyPatternDTO,
  InventoryThroughputDTO,
  ShippingTrackingDTO,
  NewCustomerRevenueDTO,
  DeadStockDTO,
  DuplicateOrdersDTO,
  CourierReconciliationDTO,
  CourierHandoverReportDTO,
  MarketingRoasDTO,
  AddressQualityDTO,
  SlaBreachDTO,
  HoldReasonsDTO,
  RtoLossDTO,
  OrderReturnReportDTO,
  MarginWaterfallDTO,
  CohortRetentionDTO,
  BlocklistHitRateDTO,
  RescheduleEffectivenessDTO,
  ProductPerformanceDTO,
  EmployeeActivityDTO,
  ProductCourierHistoryDTO,
  SpamOrdersDTO,
} from '@zetsales/shared';
import { api } from './api';

export interface AnalyticsQueryParams {
  storeId?: string;
  range: string;
  from?: string;
  to?: string;
  comparisonMode?: string;
  comparisonFrom?: string;
  comparisonTo?: string;
}

// Every card on the analytics entry page fetches its own data on mount — and the whole page
// unmounts when you click into a card's detail view, then remounts when you come back. Without a
// cache, that remount means every one of the ~50 cards refetches from scratch and shows its loading
// skeleton again, even though nothing changed since you were last looking at it seconds ago.
//
// This is a plain module-level cache (survives unmount/remount for the SPA session, cleared on a
// hard refresh), keyed by the exact URL + query params. A cache hit returns instantly — no loading
// flash — while a real request still fires in the background to refresh that entry for next time
// (stale-while-revalidate), so data can't go stale forever, it's just one navigation-cycle behind.
const analyticsCache = new Map<string, unknown>();

function cacheKey(url: string, params: unknown): string {
  return `${url}?${JSON.stringify(params ?? {})}`;
}

async function cachedGet<T>(url: string, params?: unknown): Promise<T> {
  const key = cacheKey(url, params);
  const cached = analyticsCache.get(key);
  if (cached !== undefined) {
    void api
      .get(url, { params })
      .then((res) => analyticsCache.set(key, res.data))
      .catch(() => {});
    return cached as T;
  }
  const res = await api.get(url, { params });
  analyticsCache.set(key, res.data);
  return res.data as T;
}

export async function getAnalyticsLayout() {
  const res = await api.get('/commerce/analytics/layout');
  return res.data.layout as AnalyticsLayoutDTO;
}

export async function saveAnalyticsLayout(layout: AnalyticsLayoutDTO) {
  await api.put('/commerce/analytics/layout', layout);
}

export async function getAnalyticsSummary(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ summary: AnalyticsSummaryDTO }>('/commerce/analytics/summary', params);
  return data.summary;
}

export async function getOrderFunnel(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ funnel: OrderFunnelDTO }>('/commerce/analytics/order-funnel', params);
  return data.funnel;
}

export async function getConfirmationPerformance(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ performance: ConfirmationPerformanceDTO }>('/commerce/analytics/confirmation-performance', params);
  return data.performance;
}

export async function getSalesOverTime(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/sales-over-time', params);
  return data.series;
}

export async function getAovOverTime(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/aov-over-time', params);
  return data.series;
}

export async function getSalesByStore(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/sales-by-store', params);
  return data.breakdown;
}

export async function getTopProducts(params: AnalyticsQueryParams & { limit?: number }) {
  const data = await cachedGet<{ ranking: ProductRankingDTO }>('/commerce/analytics/top-products', params);
  return data.ranking;
}

export async function getFulfillmentTime(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ fulfillment: FulfillmentTimeDTO }>('/commerce/analytics/fulfillment-time', params);
  return data.fulfillment;
}

export async function getCourierPerformance(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/courier-performance', params);
  return data.breakdown;
}

export async function getDeliveryZones(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/delivery-zones', params);
  return data.breakdown;
}

export async function getCancelReasons(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/cancel-reasons', params);
  return data.breakdown;
}

export async function getSpamOrders(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ spamOrders: SpamOrdersDTO }>('/commerce/analytics/spam-orders', params);
  return data.spamOrders;
}

export async function getHoldReasons(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ holdReasons: HoldReasonsDTO }>('/commerce/analytics/hold-reasons', params);
  return data.holdReasons;
}

export async function getNewVsReturning(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: NewVsReturningDTO }>('/commerce/analytics/new-vs-returning', params);
  return data.series;
}

export async function getTopCustomers(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ repeatCustomers: RepeatCustomersDTO }>('/commerce/analytics/top-customers', params);
  return data.repeatCustomers;
}

export async function getRfmSegments(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ rfm: RfmSegmentsDTO }>('/commerce/analytics/rfm-segments', params);
  return data.rfm;
}

export async function getRiskSegments(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/risk-segments', params);
  return data.breakdown;
}

export async function getCustomersByZone(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/customers-by-zone', params);
  return data.breakdown;
}

export async function getGrossProfitOverTime(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/gross-profit-over-time', params);
  return data.series;
}

export async function getProfitByProduct(params: AnalyticsQueryParams & { limit?: number }) {
  const data = await cachedGet<{ ranking: ProductRankingDTO }>('/commerce/analytics/profit-by-product', params);
  return data.ranking;
}

export async function getSalesByPaymentMethod(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/sales-by-payment-method', params);
  return data.breakdown;
}

export async function getDiscountsOverTime(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/discounts-over-time', params);
  return data.series;
}

export async function getCodCashflow(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ cashflow: CodCashflowDTO }>('/commerce/analytics/cod-cashflow', params);
  return data.cashflow;
}

export async function getAbcAnalysis(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/abc-analysis', params);
  return data.breakdown;
}

export async function getSellThrough(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ sellThrough: SellThroughDTO }>('/commerce/analytics/sell-through', params);
  return data.sellThrough;
}

export async function getStockoutCancellations(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ stockoutCancellations: StockoutCancellationsDTO }>('/commerce/analytics/stockout-cancellations', params);
  return data.stockoutCancellations;
}

export async function getItemsBoughtTogether(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ itemsBoughtTogether: ItemsBoughtTogetherDTO }>('/commerce/analytics/items-bought-together', params);
  return data.itemsBoughtTogether;
}

export async function getReturnedProducts(params: AnalyticsQueryParams & { limit?: number }) {
  const data = await cachedGet<{ ranking: ProductRankingDTO }>('/commerce/analytics/returned-products', params);
  return data.ranking;
}

export async function getWeeklyPatterns(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ weeklyPattern: WeeklyPatternDTO }>('/commerce/analytics/weekly-patterns', params);
  return data.weeklyPattern;
}

export async function getPartialDeliveryRate(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/partial-delivery-rate', params);
  return data.breakdown;
}

export async function getChannelPerformance(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/channel-performance', params);
  return data.breakdown;
}

export async function getInventoryAdjustments(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/inventory-adjustments', params);
  return data.breakdown;
}

export async function getInventoryThroughput(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ throughput: InventoryThroughputDTO }>('/commerce/analytics/inventory-throughput', params);
  return data.throughput;
}

export async function getShippingAndTracking(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ shippingTracking: ShippingTrackingDTO }>('/commerce/analytics/shipping-and-tracking', params);
  return data.shippingTracking;
}

export async function getNewCustomerRevenue(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: NewCustomerRevenueDTO }>('/commerce/analytics/new-customer-revenue', params);
  return data.series;
}

export async function getNetSalesOverTime(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/net-sales-over-time', params);
  return data.series;
}

export async function getProfitByCourier(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/profit-by-courier', params);
  return data.breakdown;
}

export async function getProfitByZone(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/profit-by-zone', params);
  return data.breakdown;
}

export async function getDeadStock(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ deadStock: DeadStockDTO }>('/commerce/analytics/dead-stock', params);
  return data.deadStock;
}

export async function getDuplicateOrders(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ duplicateOrders: DuplicateOrdersDTO }>('/commerce/analytics/duplicate-orders', params);
  return data.duplicateOrders;
}

export async function getCourierReconciliation(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ reconciliation: CourierReconciliationDTO }>('/commerce/analytics/courier-reconciliation', params);
  return data.reconciliation;
}

export async function getCourierHandoverReport(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ handoverReport: CourierHandoverReportDTO }>('/commerce/analytics/courier-handover-report', params);
  return data.handoverReport;
}

export async function getMarketingRoas(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ marketingRoas: MarketingRoasDTO }>('/commerce/analytics/marketing-roas', params);
  return data.marketingRoas;
}

export async function getAddressQuality(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ addressQuality: AddressQualityDTO }>('/commerce/analytics/address-quality', params);
  return data.addressQuality;
}

export async function getSlaBreach(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ slaBreach: SlaBreachDTO }>('/commerce/analytics/sla-breach', params);
  return data.slaBreach;
}

export async function getCallOutcomes(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/call-outcomes', params);
  return data.breakdown;
}

export async function getFlagReasons(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/flag-reasons', params);
  return data.breakdown;
}

export async function getRescheduleEffectiveness(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ rescheduleEffectiveness: RescheduleEffectivenessDTO }>('/commerce/analytics/reschedule-effectiveness', params);
  return data.rescheduleEffectiveness;
}

export async function getBlocklistHitRate(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ blocklistHitRate: BlocklistHitRateDTO }>('/commerce/analytics/blocklist-hit-rate', params);
  return data.blocklistHitRate;
}

export async function getRtoLoss(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ rtoLoss: RtoLossDTO }>('/commerce/analytics/rto-loss', params);
  return data.rtoLoss;
}

export async function getOrderReturnReport(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ returnReport: OrderReturnReportDTO }>('/commerce/analytics/order-return-report', params);
  return data.returnReport;
}

export async function getMarginWaterfall(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ marginWaterfall: MarginWaterfallDTO }>('/commerce/analytics/margin-waterfall', params);
  return data.marginWaterfall;
}

export async function getCohortRetention(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ cohortRetention: CohortRetentionDTO }>('/commerce/analytics/cohort-retention', params);
  return data.cohortRetention;
}

export async function getProductPerformance(params: AnalyticsQueryParams & { limit?: number }) {
  const data = await cachedGet<{ productPerformance: ProductPerformanceDTO }>('/commerce/analytics/product-performance', params);
  return data.productPerformance;
}

export async function getConfirmedSalesOverTime(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/confirmed-sales-over-time', params);
  return data.series;
}

export async function getPaymentStatusBreakdown(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/payment-status-breakdown', params);
  return data.breakdown;
}

export async function getEmployeeActivity(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ employeeActivity: EmployeeActivityDTO }>('/commerce/analytics/employee-activity', params);
  return data.employeeActivity;
}

export async function getProductCourierHistory(params: AnalyticsQueryParams & { limit?: number }) {
  const data = await cachedGet<{ productCourierHistory: ProductCourierHistoryDTO }>('/commerce/analytics/product-courier-history', params);
  return data.productCourierHistory;
}

export async function getDailyLeadQuantity(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/daily-lead-quantity', params);
  return data.series;
}

export async function getCodChangeLog(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ breakdown: AnalyticsBreakdownDTO }>('/commerce/analytics/cod-change-log', params);
  return data.breakdown;
}

export async function getHandoverSales(params: AnalyticsQueryParams) {
  const data = await cachedGet<{ series: AnalyticsSeriesDTO }>('/commerce/analytics/handover-sales', params);
  return data.series;
}
