import type {
  StockReportDTO,
  CourierHandoverOrdersReportDTO,
  CourierHandoverItemsReportDTO,
  CourierHandoverFinancialReportDTO,
  CourierReturnReportDTO,
  AdvancePaymentReportDTO,
  ProductConfirmationReportDTO,
  CancelledOrdersReportDTO,
  CourierHandoverStatusReportDTO,
  CourierProductDeliveryReportDTO,
  ConfirmDateSaleProfitReportDTO,
  EmployeeBaseReportDTO,
  DistrictSalesReportDTO,
  PurchaseReportDTO,
  PurchaseItemDetailsReportDTO,
  SupplierLedgerReportDTO,
  ExpenseReportDTO,
  IncomeExpenseReportDTO,
  CourierReconciliationReportDTO,
  CodChangeLogReportDTO,
  InventoryAdjustmentReportDTO,
} from '@zetsales/shared';
import { api } from './api';
import type { AnalyticsQueryParams } from './analyticsApi';

export interface SupplierLedgerReportQueryParams extends AnalyticsQueryParams {
  supplierId?: string;
}

export interface StockReportQueryParams extends AnalyticsQueryParams {
  warehouseId?: string;
  changedOnly?: boolean;
}

export interface CourierReturnReportQueryParams extends AnalyticsQueryParams {
  finalOnly?: boolean;
}

export interface ConfirmDateSaleProfitReportQueryParams extends AnalyticsQueryParams {
  stage?: string;
}

export async function getStockReport(params: StockReportQueryParams) {
  const res = await api.get<{ report: StockReportDTO }>('/commerce/reports/stock', { params });
  return res.data.report;
}

export async function getCourierHandoverOrdersReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: CourierHandoverOrdersReportDTO }>('/commerce/reports/courier-handover-orders', { params });
  return res.data.report;
}

export async function getCourierHandoverItemsReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: CourierHandoverItemsReportDTO }>('/commerce/reports/courier-handover-items', { params });
  return res.data.report;
}

export async function getCourierHandoverFinancialReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: CourierHandoverFinancialReportDTO }>('/commerce/reports/courier-handover-financial', { params });
  return res.data.report;
}

export async function getCourierReturnReport(params: CourierReturnReportQueryParams) {
  const res = await api.get<{ report: CourierReturnReportDTO }>('/commerce/reports/courier-return', { params });
  return res.data.report;
}

export async function getAdvancePaymentReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: AdvancePaymentReportDTO }>('/commerce/reports/advance-payment', { params });
  return res.data.report;
}

export async function getProductConfirmationReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: ProductConfirmationReportDTO }>('/commerce/reports/product-confirmation', { params });
  return res.data.report;
}

export async function getCancelledOrdersReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: CancelledOrdersReportDTO }>('/commerce/reports/cancelled-orders', { params });
  return res.data.report;
}

export async function getCourierHandoverStatusReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: CourierHandoverStatusReportDTO }>('/commerce/reports/courier-handover-status', { params });
  return res.data.report;
}

export async function getCourierProductDeliveryReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: CourierProductDeliveryReportDTO }>('/commerce/reports/courier-product-delivery', { params });
  return res.data.report;
}

export async function getConfirmDateSaleProfitReport(params: ConfirmDateSaleProfitReportQueryParams) {
  const res = await api.get<{ report: ConfirmDateSaleProfitReportDTO }>('/commerce/reports/confirm-date-sale-profit', { params });
  return res.data.report;
}

export async function getHandoverDateSaleProfitReport(params: ConfirmDateSaleProfitReportQueryParams) {
  const res = await api.get<{ report: ConfirmDateSaleProfitReportDTO }>('/commerce/reports/handover-date-sale-profit', { params });
  return res.data.report;
}

export async function getSaleProfitReport(params: ConfirmDateSaleProfitReportQueryParams) {
  const res = await api.get<{ report: ConfirmDateSaleProfitReportDTO }>('/commerce/reports/sale-profit', { params });
  return res.data.report;
}

export async function getEmployeeBaseReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: EmployeeBaseReportDTO }>('/commerce/reports/employee-base', { params });
  return res.data.report;
}

export async function getDistrictSalesReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: DistrictSalesReportDTO }>('/commerce/reports/district-sales', { params });
  return res.data.report;
}

export async function getPurchaseReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: PurchaseReportDTO }>('/commerce/reports/purchase', { params });
  return res.data.report;
}

export async function getPurchaseItemDetailsReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: PurchaseItemDetailsReportDTO }>('/commerce/reports/purchase-item-details', { params });
  return res.data.report;
}

export async function getSupplierLedgerReport(params: SupplierLedgerReportQueryParams) {
  const res = await api.get<{ report: SupplierLedgerReportDTO }>('/commerce/reports/supplier-ledger', { params });
  return res.data.report;
}

export async function getExpenseReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: ExpenseReportDTO }>('/commerce/reports/expense', { params });
  return res.data.report;
}

export async function getIncomeExpenseReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: IncomeExpenseReportDTO }>('/commerce/reports/income-expense', { params });
  return res.data.report;
}

// storeId only — no date-range params, since this is a lifetime running balance, same as the
// Courier reconciliation Analytics card it's built from. See
// CourierReconciliationReportRowDTO's doc comment.
export async function getCourierReconciliationReport(params: { storeId?: string }) {
  const res = await api.get<{ report: CourierReconciliationReportDTO }>('/commerce/reports/courier-reconciliation', { params });
  return res.data.report;
}

export async function getCodChangeLogReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: CodChangeLogReportDTO }>('/commerce/reports/cod-change-log', { params });
  return res.data.report;
}

export async function getInventoryAdjustmentReport(params: AnalyticsQueryParams) {
  const res = await api.get<{ report: InventoryAdjustmentReportDTO }>('/commerce/reports/inventory-adjustments', { params });
  return res.data.report;
}
