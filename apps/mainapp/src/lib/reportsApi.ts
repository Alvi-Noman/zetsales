import type { StockReportDTO, CourierHandoverOrdersReportDTO, CourierHandoverItemsReportDTO, CourierHandoverFinancialReportDTO } from '@zetsales/shared';
import { api } from './api';
import type { AnalyticsQueryParams } from './analyticsApi';

export interface StockReportQueryParams extends AnalyticsQueryParams {
  warehouseId?: string;
  changedOnly?: boolean;
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
