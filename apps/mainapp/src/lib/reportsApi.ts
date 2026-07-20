import type { StockReportDTO, CourierHandoverOrdersReportDTO, CourierHandoverItemsReportDTO } from '@zetsales/shared';
import { api } from './api';
import type { AnalyticsQueryParams } from './analyticsApi';

export interface StockReportQueryParams extends AnalyticsQueryParams {
  warehouseId?: string;
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
