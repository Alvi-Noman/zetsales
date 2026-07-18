import type { AnalyticsCardKey, AnalyticsCategory } from '@zetsales/shared';
import type {
  AnalyticsBreakdownDTO,
  AnalyticsSeriesDTO,
  ConfirmationPerformanceDTO,
  CourierHandoverReportDTO,
  OrderReturnReportDTO,
  EmployeeActivityDTO,
  ProductCourierHistoryDTO,
  InventoryThroughputDTO,
  OrderAgentUpsellPerformanceDTO,
} from '@zetsales/shared';
import {
  getAnalyticsSummary as _getAnalyticsSummary, // not a card — excluded on purpose, see note below
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
  getSpamOrders,
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
  getCourierHandoverReport,
  getMarketingRoas,
  getAddressQuality,
  getSlaBreach,
  getCallOutcomes,
  getFlagReasons,
  getRescheduleEffectiveness,
  getBlocklistHitRate,
  getRtoLoss,
  getOrderReturnReport,
  getMarginWaterfall,
  getCohortRetention,
  getProductPerformance,
  getConfirmedSalesOverTime,
  getPaymentStatusBreakdown,
  getEmployeeActivity,
  getOrderAgentUpsellPerformance,
  getProductCourierHistory,
  getDailyLeadQuantity,
  getCodChangeLog,
  getHandoverSales,
  type AnalyticsQueryParams,
} from '../lib/analyticsApi';
import { ANALYTICS_CARDS } from './cardRegistry';
import { formatMoney } from './format';

void _getAnalyticsSummary;

export interface ReportColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
  // Display-only formatter (money/percent/etc) — CSV export always gets the raw value in `key`.
  format?: (value: string | number) => string;
}

export interface ReportTable {
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
}

function titleCase(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isFlatRow(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((val) => val === null || typeof val !== 'object');
}

// Fallback for every card without a hand-written extractor below — reflects on the fetched DTO to
// find its row array (preferring the common `rows`/`points`/`stages`/`segments` field names, else
// the first array of flat objects it finds) and turns that into a generic table. Every DTO in this
// codebase is either that shape or a small bespoke object with no natural row array, in which case
// its own scalar fields become one summary row instead of an empty table. New analytics cards get
// a working report "for free" this way — a hand-tuned extractor above/here is an upgrade, not a
// requirement, for any of them.
function autoExtract(data: unknown): ReportTable {
  if (!data || typeof data !== 'object') return { columns: [], rows: [] };
  const obj = data as Record<string, unknown>;

  let arr: unknown[] | null = null;
  for (const key of ['rows', 'points', 'stages', 'segments']) {
    const v = obj[key];
    if (Array.isArray(v) && v.length > 0 && isFlatRow(v[0])) {
      arr = v;
      break;
    }
  }
  if (!arr) {
    for (const v of Object.values(obj)) {
      if (Array.isArray(v) && v.length > 0 && isFlatRow(v[0])) {
        arr = v;
        break;
      }
    }
  }

  if (!arr) {
    const scalarEntries = Object.entries(obj).filter(([, v]) => typeof v === 'number' || typeof v === 'string');
    if (scalarEntries.length === 0) return { columns: [], rows: [] };
    return {
      columns: scalarEntries.map(([k, v]) => ({ key: k, header: titleCase(k), align: typeof v === 'number' ? 'right' : 'left' })),
      rows: [Object.fromEntries(scalarEntries) as Record<string, string | number>],
    };
  }

  const sample = arr[0] as Record<string, unknown>;
  const columns: ReportColumn[] = Object.keys(sample).map((k) => ({
    key: k,
    header: titleCase(k),
    align: typeof sample[k] === 'number' ? 'right' : 'left',
  }));
  const rows = (arr as Record<string, unknown>[]).map((row) => {
    const out: Record<string, string | number> = {};
    for (const col of columns) {
      const v = row[col.key];
      out[col.key] = v === null || v === undefined ? '' : (v as string | number);
    }
    return out;
  });
  return { columns, rows };
}

function fromBreakdown(d: AnalyticsBreakdownDTO): ReportTable {
  return {
    columns: [
      { key: 'label', header: 'Label' },
      { key: 'count', header: 'Orders', align: 'right' },
      { key: 'value', header: 'Value', align: 'right', format: (v) => formatMoney(Number(v)) },
      { key: 'percentage', header: '% of total', align: 'right', format: (v) => `${v}%` },
    ],
    rows: d.rows.map((r) => ({ label: r.label, count: r.count, value: r.value, percentage: r.percentage })),
  };
}

function fromSeries(d: AnalyticsSeriesDTO): ReportTable {
  return {
    columns: [
      { key: 'date', header: 'Period' },
      { key: 'value', header: 'Value', align: 'right', format: (v) => formatMoney(Number(v)) },
    ],
    rows: d.current.points.map((p) => ({ date: p.label, value: p.value })),
  };
}

// Hand-tuned extractors for the reports worth polishing (nicer headers/formatting than the generic
// fallback would produce). Everything in ANALYTICS_CARDS not listed here still gets a working
// report via autoExtract() — see getReportTable() below.
const REPORT_TABLES: Partial<Record<AnalyticsCardKey, (data: unknown) => ReportTable>> = {
  courierHandoverReport: (data) => {
    const d = data as CourierHandoverReportDTO;
    return {
      columns: [
        { key: 'displayName', header: 'Courier' },
        { key: 'manifestCount', header: 'Manifests', align: 'right' },
        { key: 'parcelCount', header: 'Parcels', align: 'right' },
        { key: 'itemCount', header: 'Items', align: 'right' },
        { key: 'totalCodAmount', header: 'Total COD', align: 'right', format: (v) => formatMoney(Number(v)) },
        { key: 'confirmedCount', header: 'Confirmed', align: 'right' },
        { key: 'pendingCount', header: 'Pending', align: 'right' },
        { key: 'avgConfirmHours', header: 'Avg. hrs to confirm', align: 'right', format: (v) => (v === '' ? '—' : `${v}h`) },
      ],
      rows: d.rows.map((r) => ({
        displayName: r.displayName,
        manifestCount: r.manifestCount,
        parcelCount: r.parcelCount,
        itemCount: r.itemCount,
        totalCodAmount: r.totalCodAmount,
        confirmedCount: r.confirmedCount,
        pendingCount: r.pendingCount,
        avgConfirmHours: r.avgConfirmHours ?? '',
      })),
    };
  },
  orderReturnReport: (data) => {
    const d = data as OrderReturnReportDTO;
    return {
      columns: [
        { key: 'label', header: 'Stage' },
        { key: 'count', header: 'Orders', align: 'right' },
        { key: 'value', header: 'Revenue', align: 'right', format: (v) => formatMoney(Number(v)) },
        { key: 'percentage', header: '% of returns', align: 'right', format: (v) => `${v}%` },
      ],
      rows: d.byStage.rows.map((r) => ({ label: r.label, count: r.count, value: r.value, percentage: r.percentage })),
    };
  },
  confirmationPerformance: (data) => {
    const d = data as ConfirmationPerformanceDTO;
    return {
      columns: [
        { key: 'agent', header: 'Agent' },
        { key: 'confirmedCount', header: 'Confirmed', align: 'right' },
        { key: 'avgCallAttempts', header: 'Avg. call attempts', align: 'right' },
        { key: 'avgTimeToConfirmMinutes', header: 'Avg. time to confirm (min)', align: 'right' },
        { key: 'deliveredRate', header: 'Delivered rate', align: 'right', format: (v) => (v === '' ? '—' : `${v}%`) },
        { key: 'rtoRate', header: 'RTO rate', align: 'right', format: (v) => (v === '' ? '—' : `${v}%`) },
      ],
      rows: d.byAgent.map((r) => ({
        agent: r.agent,
        confirmedCount: r.confirmedCount,
        avgCallAttempts: r.avgCallAttempts ?? '',
        avgTimeToConfirmMinutes: r.avgTimeToConfirmMinutes ?? '',
        deliveredRate: r.deliveredRate ?? '',
        rtoRate: r.rtoRate ?? '',
      })),
    };
  },
  cancelReasons: (data) => fromBreakdown(data as AnalyticsBreakdownDTO),
  courierPerformance: (data) => fromBreakdown(data as AnalyticsBreakdownDTO),
  deliveryZones: (data) => fromBreakdown(data as AnalyticsBreakdownDTO),
  codChangeLog: (data) => fromBreakdown(data as AnalyticsBreakdownDTO),
  paymentStatusBreakdown: (data) => fromBreakdown(data as AnalyticsBreakdownDTO),
  inventoryAdjustments: (data) => fromBreakdown(data as AnalyticsBreakdownDTO),
  dailyLeadQuantity: (data) => fromSeries(data as AnalyticsSeriesDTO),
  confirmedSalesOverTime: (data) => fromSeries(data as AnalyticsSeriesDTO),
  grossProfitOverTime: (data) => fromSeries(data as AnalyticsSeriesDTO),
  handoverSales: (data) => fromSeries(data as AnalyticsSeriesDTO),
  salesOverTime: (data) => fromSeries(data as AnalyticsSeriesDTO),
  aovOverTime: (data) => fromSeries(data as AnalyticsSeriesDTO),
  netSalesOverTime: (data) => fromSeries(data as AnalyticsSeriesDTO),
  discountsOverTime: (data) => fromSeries(data as AnalyticsSeriesDTO),
  employeeActivity: (data) => {
    const d = data as EmployeeActivityDTO;
    return {
      columns: [
        { key: 'agent', header: 'Staff member' },
        { key: 'totalActions', header: 'Total actions', align: 'right' },
        { key: 'confirmed', header: 'Confirmed', align: 'right' },
        { key: 'shipped', header: 'Ready for pickup', align: 'right' },
        { key: 'delivered', header: 'Delivered', align: 'right' },
        { key: 'cancelled', header: 'Cancelled', align: 'right' },
        { key: 'holdResolved', header: 'Holds resolved', align: 'right' },
        { key: 'callAttempts', header: 'Call attempts', align: 'right' },
      ],
      rows: d.rows.map((r) => ({
        agent: r.agent,
        totalActions: r.totalActions,
        confirmed: r.confirmed,
        shipped: r.shipped,
        delivered: r.delivered,
        cancelled: r.cancelled,
        holdResolved: r.holdResolved,
        callAttempts: r.callAttempts,
      })),
    };
  },
  orderAgentUpsellPerformance: (data) => {
    const d = data as OrderAgentUpsellPerformanceDTO;
    return {
      columns: [
        { key: 'agent', header: 'Agent' },
        { key: 'upsellCount', header: 'Upsells', align: 'right' },
        { key: 'itemsAdded', header: 'Items added', align: 'right' },
        { key: 'ordersUpsold', header: 'Orders upsold', align: 'right' },
        { key: 'totalAmount', header: 'Upsell value', align: 'right', format: (v) => formatMoney(Number(v)) },
      ],
      rows: d.rows.map((r) => ({
        agent: r.agent,
        upsellCount: r.upsellCount,
        itemsAdded: r.itemsAdded,
        ordersUpsold: r.ordersUpsold,
        totalAmount: r.totalAmount,
      })),
    };
  },
  productCourierHistory: (data) => {
    const d = data as ProductCourierHistoryDTO;
    return {
      columns: [
        { key: 'title', header: 'Product' },
        { key: 'courierPartner', header: 'Courier' },
        { key: 'unitsShipped', header: 'Units shipped', align: 'right' },
        { key: 'deliveredRate', header: 'Delivered rate', align: 'right', format: (v) => (v === '' ? '—' : `${v}%`) },
        { key: 'rtoRate', header: 'RTO rate', align: 'right', format: (v) => (v === '' ? '—' : `${v}%`) },
      ],
      rows: d.rows.map((r) => ({
        title: r.title,
        courierPartner: r.courierPartner,
        unitsShipped: r.unitsShipped,
        deliveredRate: r.deliveredRate ?? '',
        rtoRate: r.rtoRate ?? '',
      })),
    };
  },
  inventoryThroughput: (data) => {
    const d = data as InventoryThroughputDTO;
    return {
      columns: [
        { key: 'totalOrdered', header: 'Units ordered', align: 'right' },
        { key: 'totalReceived', header: 'Units received', align: 'right' },
        { key: 'totalShipped', header: 'Units ready for pickup', align: 'right' },
        { key: 'uniqueSkus', header: 'Unique SKUs', align: 'right' },
        { key: 'totalInventoryValue', header: 'Inventory value', align: 'right', format: (v) => formatMoney(Number(v)) },
      ],
      rows: [
        {
          totalOrdered: d.totalOrdered,
          totalReceived: d.totalReceived,
          totalShipped: d.totalShipped,
          uniqueSkus: d.uniqueSkus,
          totalInventoryValue: d.totalInventoryValue,
        },
      ],
    };
  },
};

// One fetcher per card in ANALYTICS_CARDS — every report in the list below is backed by a real
// endpoint, the same one that card's dashboard tile already calls.
const REPORT_FETCHERS: Partial<Record<AnalyticsCardKey, (params: AnalyticsQueryParams) => Promise<unknown>>> = {
  orderFunnel: getOrderFunnel,
  confirmationPerformance: getConfirmationPerformance,
  salesOverTime: getSalesOverTime,
  aovOverTime: getAovOverTime,
  salesByStore: getSalesByStore,
  topProducts: getTopProducts,
  fulfillmentTime: getFulfillmentTime,
  courierPerformance: getCourierPerformance,
  deliveryZones: getDeliveryZones,
  cancelReasons: getCancelReasons,
  spamOrders: getSpamOrders,
  holdReasons: getHoldReasons,
  newVsReturning: getNewVsReturning,
  topCustomers: getTopCustomers,
  rfmSegments: getRfmSegments,
  riskSegments: getRiskSegments,
  customersByZone: getCustomersByZone,
  grossProfitOverTime: getGrossProfitOverTime,
  profitByProduct: getProfitByProduct,
  salesByPaymentMethod: getSalesByPaymentMethod,
  discountsOverTime: getDiscountsOverTime,
  codCashflow: getCodCashflow,
  abcAnalysis: getAbcAnalysis,
  sellThrough: getSellThrough,
  stockoutCancellations: getStockoutCancellations,
  itemsBoughtTogether: getItemsBoughtTogether,
  returnedProducts: getReturnedProducts,
  weeklyPatterns: getWeeklyPatterns,
  partialDeliveryRate: getPartialDeliveryRate,
  channelPerformance: getChannelPerformance,
  inventoryAdjustments: getInventoryAdjustments,
  inventoryThroughput: getInventoryThroughput,
  shippingAndTracking: getShippingAndTracking,
  newCustomerRevenue: getNewCustomerRevenue,
  netSalesOverTime: getNetSalesOverTime,
  profitByCourier: getProfitByCourier,
  profitByZone: getProfitByZone,
  deadStock: getDeadStock,
  duplicateOrders: getDuplicateOrders,
  courierReconciliation: getCourierReconciliation,
  courierHandoverReport: getCourierHandoverReport,
  marketingRoas: getMarketingRoas,
  addressQuality: getAddressQuality,
  slaBreach: getSlaBreach,
  callOutcomes: getCallOutcomes,
  flagReasons: getFlagReasons,
  rescheduleEffectiveness: getRescheduleEffectiveness,
  blocklistHitRate: getBlocklistHitRate,
  rtoLoss: getRtoLoss,
  orderReturnReport: getOrderReturnReport,
  marginWaterfall: getMarginWaterfall,
  cohortRetention: getCohortRetention,
  productPerformance: getProductPerformance,
  confirmedSalesOverTime: getConfirmedSalesOverTime,
  paymentStatusBreakdown: getPaymentStatusBreakdown,
  employeeActivity: getEmployeeActivity,
  orderAgentUpsellPerformance: getOrderAgentUpsellPerformance,
  productCourierHistory: getProductCourierHistory,
  dailyLeadQuantity: getDailyLeadQuantity,
  codChangeLog: getCodChangeLog,
  handoverSales: getHandoverSales,
};

export interface ReportListEntry {
  key: AnalyticsCardKey;
  label: string;
  category: AnalyticsCategory;
  description: string;
}

// Every report in Analytics, in the exact same order and category grouping as the Analytics
// dashboard (ANALYTICS_CARDS) — not a curated subset. Sourced directly from the card registry so
// a new analytics card automatically gets a Reports entry too, with no separate list to maintain.
export const REPORTS_LIST: ReportListEntry[] = ANALYTICS_CARDS.map((def) => ({
  key: def.key as AnalyticsCardKey,
  label: def.title,
  category: def.category,
  description: def.description,
}));

export function getReportTable(key: AnalyticsCardKey, data: unknown): ReportTable {
  const extractor = REPORT_TABLES[key];
  return extractor ? extractor(data) : autoExtract(data);
}

export function getReportFetcher(key: AnalyticsCardKey) {
  return REPORT_FETCHERS[key] ?? null;
}
