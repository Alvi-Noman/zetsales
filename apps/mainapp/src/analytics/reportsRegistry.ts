import type { AnalyticsCardKey } from '@zetsales/shared';
import type {
  AnalyticsBreakdownDTO,
  AnalyticsSeriesDTO,
  ConfirmationPerformanceDTO,
  CourierHandoverReportDTO,
  OrderReturnReportDTO,
  EmployeeActivityDTO,
  ProductCourierHistoryDTO,
  InventoryThroughputDTO,
} from '@zetsales/shared';
import {
  getCourierHandoverReport,
  getOrderReturnReport,
  getConfirmationPerformance,
  getCancelReasons,
  getCourierPerformance,
  getProductCourierHistory,
  getDailyLeadQuantity,
  getConfirmedSalesOverTime,
  getEmployeeActivity,
  getHandoverSales,
  getGrossProfitOverTime,
  getCodChangeLog,
  getDeliveryZones,
  getPaymentStatusBreakdown,
  getInventoryAdjustments,
  getInventoryThroughput,
  type AnalyticsQueryParams,
} from '../lib/analyticsApi';
import { formatMoney } from './format';

export type ReportCategory = 'Courier' | 'Sales' | 'Stock' | 'Staff' | 'Other';

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

// Every curated report reuses an existing analytics endpoint and its DTO — nothing here computes
// new data, it just re-shapes an already-fetched DTO into one flat table for the list/export view,
// since each DTO has its own bespoke structure (breakdown rows, a time series, per-agent rows...).
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

const REPORT_FETCHERS: Partial<Record<AnalyticsCardKey, (params: AnalyticsQueryParams) => Promise<unknown>>> = {
  courierHandoverReport: getCourierHandoverReport,
  orderReturnReport: getOrderReturnReport,
  confirmationPerformance: getConfirmationPerformance,
  cancelReasons: getCancelReasons,
  courierPerformance: getCourierPerformance,
  productCourierHistory: getProductCourierHistory,
  dailyLeadQuantity: getDailyLeadQuantity,
  confirmedSalesOverTime: getConfirmedSalesOverTime,
  employeeActivity: getEmployeeActivity,
  handoverSales: getHandoverSales,
  grossProfitOverTime: getGrossProfitOverTime,
  codChangeLog: getCodChangeLog,
  deliveryZones: getDeliveryZones,
  paymentStatusBreakdown: getPaymentStatusBreakdown,
  inventoryAdjustments: getInventoryAdjustments,
  inventoryThroughput: getInventoryThroughput,
};

export interface ReportListEntry {
  key: AnalyticsCardKey;
  label: string;
  category: ReportCategory;
  description: string;
}

// Curated to match the report names/categories requested — several of the originally-requested
// names (Courier Handover Report v2/v3/Admin; Courier Return/Final Return/Waiting Return Report)
// collapse onto ONE underlying report here, since they're the same data sliced by status/stage
// rather than genuinely different reports. Courier Handover Item Wise, Purchase Report, Purchase
// Item Details, Supplier Ledger, and Expense/Income reports have no equivalent yet — Supplier
// Ledger and Expense/Income already exist as operational pages (Supply Chain / Accounting) rather
// than analytics reports.
export const REPORTS_LIST: ReportListEntry[] = [
  { key: 'courierHandoverReport', label: 'Courier Handover Report', category: 'Courier', description: 'Manifest volume per courier — parcels, COD, and confirmation status. Covers v2/v3/Admin variants and both Pending and Confirmed manifests.' },
  { key: 'orderReturnReport', label: 'Courier Return Report', category: 'Courier', description: 'Orders in the return pipeline by stage — covers Final Return (Returned to stock) and Waiting Return (RTO in transit / Awaiting QC) in one table.' },
  { key: 'courierPerformance', label: 'Date Wise Courier History Report', category: 'Courier', description: 'Delivered vs. RTO rate and average delivery time, per courier partner.' },
  { key: 'productCourierHistory', label: 'Product-wise Courier History Report', category: 'Stock', description: 'Per-product, per-courier delivered/RTO performance.' },
  { key: 'handoverSales', label: 'Handover Date Wise Sale Reports', category: 'Courier', description: 'COD value handed over to couriers, by handover date.' },
  { key: 'confirmationPerformance', label: 'Confirmation Report', category: 'Other', description: 'Confirmation rate and call-attempt performance, per agent.' },
  { key: 'cancelReasons', label: 'Cancelled Orders Report', category: 'Sales', description: 'Why orders get cancelled, ranked by frequency and revenue lost.' },
  { key: 'dailyLeadQuantity', label: 'Daily Lead Quantity', category: 'Sales', description: 'New orders received per day.' },
  { key: 'confirmedSalesOverTime', label: 'Confirm Date Base Sale Reports', category: 'Sales', description: 'Sales value by the date each order was confirmed, not placed.' },
  { key: 'grossProfitOverTime', label: 'Sale Profit Report', category: 'Sales', description: 'Gross profit over time.' },
  { key: 'codChangeLog', label: 'COD Change Reports', category: 'Sales', description: 'Every manual change to an order’s COD amount, with who changed it.' },
  { key: 'deliveryZones', label: 'District Wise Sale Bill Date Base Report', category: 'Sales', description: 'Orders and RTO rate by delivery zone tier (inside/outside/suburb — not literal district boundaries).' },
  { key: 'paymentStatusBreakdown', label: 'Advance Payment', category: 'Sales', description: 'Orders by payment status, including how much COD volume carries an upfront deposit.' },
  { key: 'employeeActivity', label: 'Employee Base Report', category: 'Staff', description: 'Every staff-attributed action across the pipeline, per agent.' },
  { key: 'inventoryAdjustments', label: 'Stock Reports (When Change)', category: 'Stock', description: 'Damage, loss, and count corrections, by reason.' },
  { key: 'inventoryThroughput', label: 'Stock Report', category: 'Stock', description: 'Units ordered, received, and readied for pickup, plus current inventory value.' },
];

export function getReportTable(key: AnalyticsCardKey, data: unknown): ReportTable | null {
  const extractor = REPORT_TABLES[key];
  return extractor ? extractor(data) : null;
}

export function getReportFetcher(key: AnalyticsCardKey) {
  return REPORT_FETCHERS[key] ?? null;
}
