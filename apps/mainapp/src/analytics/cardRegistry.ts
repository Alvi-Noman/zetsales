import type { AnalyticsCardKey } from '@zetsales/shared';
import type { AnalyticsCardDefinition } from './types';
import { orderFunnelCard } from './cards/orderFunnel';
import { confirmationPerformanceCard } from './cards/confirmationPerformance';
import { salesOverTimeCard } from './cards/salesOverTime';
import { aovOverTimeCard } from './cards/aovOverTime';
import { salesByStoreCard } from './cards/salesByStore';
import { topProductsCard } from './cards/topProducts';
import { fulfillmentTimeCard } from './cards/fulfillmentTime';
import { courierPerformanceCard } from './cards/courierPerformance';
import { deliveryZonesCard } from './cards/deliveryZones';
import { cancelReasonsCard } from './cards/cancelReasons';
import { holdReasonsCard } from './cards/holdReasons';
import { newVsReturningCard } from './cards/newVsReturning';
import { topCustomersCard } from './cards/topCustomers';
import { rfmSegmentsCard } from './cards/rfmSegments';
import { riskSegmentsCard } from './cards/riskSegments';
import { customersByZoneCard } from './cards/customersByZone';
import { grossProfitOverTimeCard } from './cards/grossProfitOverTime';
import { profitByProductCard } from './cards/profitByProduct';
import { salesByPaymentMethodCard } from './cards/salesByPaymentMethod';
import { discountsOverTimeCard } from './cards/discountsOverTime';
import { codCashflowCard } from './cards/codCashflow';
import { abcAnalysisCard } from './cards/abcAnalysis';
import { sellThroughCard } from './cards/sellThrough';
import { stockoutCancellationsCard } from './cards/stockoutCancellations';
import { itemsBoughtTogetherCard } from './cards/itemsBoughtTogether';
import { returnedProductsCard } from './cards/returnedProducts';
import { weeklyPatternsCard } from './cards/weeklyPatterns';
import { partialDeliveryRateCard } from './cards/partialDeliveryRate';
import { channelPerformanceCard } from './cards/channelPerformance';
import { inventoryAdjustmentsCard } from './cards/inventoryAdjustments';
import { inventoryThroughputCard } from './cards/inventoryThroughput';
import { shippingAndTrackingCard } from './cards/shippingAndTracking';
import { newCustomerRevenueCard } from './cards/newCustomerRevenue';
import { netSalesOverTimeCard } from './cards/netSalesOverTime';
import { profitByCourierCard } from './cards/profitByCourier';
import { profitByZoneCard } from './cards/profitByZone';
import { deadStockCard } from './cards/deadStock';
import { duplicateOrdersCard } from './cards/duplicateOrders';
import { courierReconciliationCard } from './cards/courierReconciliation';
import { marketingRoasCard } from './cards/marketingRoas';
import { addressQualityCard } from './cards/addressQuality';
import { slaBreachCard } from './cards/slaBreach';
import { callOutcomesCard } from './cards/callOutcomes';
import { flagReasonsCard } from './cards/flagReasons';
import { rescheduleEffectivenessCard } from './cards/rescheduleEffectiveness';
import { blocklistHitRateCard } from './cards/blocklistHitRate';
import { rtoLossCard } from './cards/rtoLoss';
import { marginWaterfallCard } from './cards/marginWaterfall';
import { cohortRetentionCard } from './cards/cohortRetention';
import { productPerformanceCard } from './cards/productPerformance';
import { confirmedSalesOverTimeCard } from './cards/confirmedSalesOverTime';
import { paymentStatusBreakdownCard } from './cards/paymentStatusBreakdown';
import { employeeActivityCard } from './cards/employeeActivity';
import { productCourierHistoryCard } from './cards/productCourierHistory';
import { dailyLeadQuantityCard } from './cards/dailyLeadQuantity';
import { codChangeLogCard } from './cards/codChangeLog';
import { handoverSalesCard } from './cards/handoverSales';
import { spamOrdersCard } from './cards/spamOrders';

// Every implemented card registers itself here — the entry page's default grid, the customize
// drawer's card library, and the /analytics/:cardKey detail route all read from this single list.
// A card key can exist in AnalyticsCardKey (the full planned set) before it lands here; anything
// not yet in this array simply doesn't render anywhere yet.
//
// Ordered as a narrative flow, grouped by category (matching ANALYTICS_CATEGORY_ORDER below) and,
// within each category, headline/trend cards first then progressively narrower breakdowns — this
// is the order a new user sees before they've customized their own layout via CustomizeDrawer.
export const ANALYTICS_CARDS: AnalyticsCardDefinition[] = [
  // Sales
  salesOverTimeCard,
  dailyLeadQuantityCard,
  confirmedSalesOverTimeCard,
  netSalesOverTimeCard,
  aovOverTimeCard,
  salesByStoreCard,
  channelPerformanceCard,
  topProductsCard,
  marketingRoasCard,
  // Orders
  orderFunnelCard,
  confirmationPerformanceCard,
  employeeActivityCard,
  callOutcomesCard,
  flagReasonsCard,
  rescheduleEffectivenessCard,
  fulfillmentTimeCard,
  slaBreachCard,
  productPerformanceCard,
  spamOrdersCard,
  // Delivery
  courierPerformanceCard,
  productCourierHistoryCard,
  deliveryZonesCard,
  partialDeliveryRateCard,
  shippingAndTrackingCard,
  cancelReasonsCard,
  holdReasonsCard,
  addressQualityCard,
  courierReconciliationCard,
  handoverSalesCard,
  // Customers
  newVsReturningCard,
  newCustomerRevenueCard,
  topCustomersCard,
  rfmSegmentsCard,
  riskSegmentsCard,
  cohortRetentionCard,
  customersByZoneCard,
  duplicateOrdersCard,
  blocklistHitRateCard,
  // Finance
  grossProfitOverTimeCard,
  marginWaterfallCard,
  profitByProductCard,
  profitByCourierCard,
  profitByZoneCard,
  salesByPaymentMethodCard,
  paymentStatusBreakdownCard,
  discountsOverTimeCard,
  codCashflowCard,
  rtoLossCard,
  codChangeLogCard,
  // Inventory
  abcAnalysisCard,
  sellThroughCard,
  deadStockCard,
  stockoutCancellationsCard,
  returnedProductsCard,
  itemsBoughtTogetherCard,
  inventoryThroughputCard,
  inventoryAdjustmentsCard,
  weeklyPatternsCard,
];

export const ANALYTICS_CARD_MAP: Partial<Record<AnalyticsCardKey, AnalyticsCardDefinition>> = Object.fromEntries(ANALYTICS_CARDS.map((c) => [c.key, c]));

export const ANALYTICS_CATEGORY_ORDER = ['Sales', 'Orders', 'Delivery', 'Customers', 'Finance', 'Inventory'] as const;
