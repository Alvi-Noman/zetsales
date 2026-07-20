import { getStockReport, getCourierHandoverOrdersReport, getCourierHandoverItemsReport, type StockReportQueryParams } from '../lib/reportsApi';
import type { AnalyticsQueryParams } from '../lib/analyticsApi';

export type ReportKey = 'stockReport' | 'courierHandoverOrders' | 'courierHandoverItems';

export interface ReportColumn {
  key: string;
  header: string;
  align?: 'left' | 'right';
  // Display-only formatter — CSV export always gets the raw value in `key`.
  format?: (value: string | number) => string;
}

export interface ReportTable {
  columns: ReportColumn[];
  rows: Record<string, string | number>[];
}

export interface ReportListEntry {
  key: ReportKey;
  label: string;
  description: string;
  needsWarehouseFilter?: boolean;
}

// Exactly three reports, matching the reference layout — no auto-generated list. Each has its own
// backend endpoint (services/commerce-service/src/controllers/reportsController.ts) and its own
// bespoke table shape below, not a re-shaped Analytics DTO.
export const REPORTS_LIST: ReportListEntry[] = [
  {
    key: 'stockReport',
    label: 'Stock Report',
    description: 'Opening stock, purchases, sales, returns, and losses per item for the selected period.',
    needsWarehouseFilter: true,
  },
  {
    key: 'courierHandoverOrders',
    label: 'Courier Handover Report',
    description: 'Every order included in a courier pickup manifest in the selected period.',
  },
  {
    key: 'courierHandoverItems',
    label: 'Courier Handover Report Item Wise',
    description: 'Units handed over to couriers in the selected period, aggregated per item.',
  },
];

function formatDateCell(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/ /g, '-');
}

export async function fetchReportTable(key: ReportKey, query: AnalyticsQueryParams & { warehouseId?: string }): Promise<ReportTable> {
  if (key === 'stockReport') {
    const data = await getStockReport(query as StockReportQueryParams);
    return {
      columns: [
        { key: 'itemName', header: 'Item Name' },
        { key: 'sku', header: 'SKU' },
        { key: 'size', header: 'Size' },
        { key: 'color', header: 'Color' },
        { key: 'quality', header: 'Quality' },
        { key: 'open', header: 'Open', align: 'right' },
        { key: 'proSale', header: 'Pro. Sale', align: 'right' },
        { key: 'buyUnit', header: 'Buy Unit', align: 'right' },
        { key: 'saleUnit', header: 'Sale Unit', align: 'right' },
        { key: 'returnUnit', header: 'Return Unit', align: 'right' },
        { key: 'lossUnit', header: 'Loss Unit', align: 'right' },
        { key: 'poReturn', header: 'PO Ret', align: 'right' },
        { key: 'close', header: 'Close Unit', align: 'right' },
      ],
      rows: data.rows.map((r) => ({
        itemName: r.itemName,
        sku: r.sku ?? '-',
        size: r.size,
        color: r.color,
        quality: r.quality,
        open: r.open,
        proSale: r.proSale,
        buyUnit: r.buyUnit,
        saleUnit: r.saleUnit,
        returnUnit: r.returnUnit,
        lossUnit: r.lossUnit,
        poReturn: r.poReturn,
        close: r.close,
      })),
    };
  }

  if (key === 'courierHandoverOrders') {
    const data = await getCourierHandoverOrdersReport(query);
    return {
      columns: [
        { key: 'sl', header: 'SL', align: 'right' },
        { key: 'date', header: 'Date' },
        { key: 'brand', header: 'Brand' },
        { key: 'source', header: 'Source' },
        { key: 'customerName', header: 'Cus Name' },
        { key: 'orderNumber', header: 'Order Id' },
        { key: 'courier', header: 'Courier' },
        { key: 'productName', header: 'Product Name' },
        { key: 'productSku', header: 'Product SKU' },
        { key: 'qty', header: 'Qty', align: 'right' },
        { key: 'totalQty', header: 'Total Qty', align: 'right' },
      ],
      rows: data.rows.map((r, i) => ({
        sl: i + 1,
        date: formatDateCell(r.date),
        brand: r.brand,
        source: r.source,
        customerName: r.customerName,
        orderNumber: r.orderNumber,
        courier: r.courier,
        productName: r.productName,
        productSku: r.productSku,
        qty: r.qty,
        totalQty: r.totalQty,
      })),
    };
  }

  const data = await getCourierHandoverItemsReport(query);
  return {
    columns: [
      { key: 'itemName', header: 'Item Name' },
      { key: 'sku', header: 'SKU' },
      { key: 'size', header: 'Size' },
      { key: 'color', header: 'Color' },
      { key: 'quality', header: 'Quality' },
      { key: 'unit', header: 'Unit', align: 'right' },
    ],
    rows: data.rows.map((r) => ({
      itemName: r.itemName,
      sku: r.sku ?? '-',
      size: r.size,
      color: r.color,
      quality: r.quality,
      unit: r.unit,
    })),
  };
}
