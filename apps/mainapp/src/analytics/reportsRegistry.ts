import {
  getStockReport,
  getCourierHandoverOrdersReport,
  getCourierHandoverItemsReport,
  getCourierHandoverFinancialReport,
  type StockReportQueryParams,
} from '../lib/reportsApi';
import type { AnalyticsQueryParams } from '../lib/analyticsApi';

export type ReportKey = 'stockReport' | 'stockReportChanged' | 'courierHandoverOrders' | 'courierHandoverItems' | 'courierHandoverFinancial';

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

// A fixed list — no auto-generated one. Each report has its own backend endpoint
// (services/commerce-service/src/controllers/reportsController.ts) and its own bespoke table
// shape below, not a re-shaped Analytics DTO.
export const REPORTS_LIST: ReportListEntry[] = [
  {
    key: 'stockReport',
    label: 'Stock Report',
    description: 'Opening stock, purchases, sales, returns, and losses per item for the selected period.',
    needsWarehouseFilter: true,
  },
  {
    key: 'stockReportChanged',
    label: 'Stock Report (Changed Items)',
    description: 'Same as Stock Report, filtered to only items with actual movement in the selected period.',
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
  {
    key: 'courierHandoverFinancial',
    label: 'Courier Handover Report (Financial Summary)',
    description: 'Per-order pricing, discount, advance, delivery charge, and COD due for every handed-over order, with a grand total row.',
  },
];

function formatDateCell(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/ /g, '-');
}

const STOCK_COLUMNS: ReportColumn[] = [
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
];

export async function fetchReportTable(key: ReportKey, query: AnalyticsQueryParams & { warehouseId?: string }): Promise<ReportTable> {
  if (key === 'stockReport' || key === 'stockReportChanged') {
    const params: StockReportQueryParams = key === 'stockReportChanged' ? { ...query, changedOnly: true } : query;
    const data = await getStockReport(params);
    return {
      columns: STOCK_COLUMNS,
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

  if (key === 'courierHandoverItems') {
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

  const data = await getCourierHandoverFinancialReport(query);
  const columns: ReportColumn[] = [
    { key: 'sl', header: 'SL', align: 'right' },
    { key: 'date', header: 'Date' },
    { key: 'brand', header: 'Brand' },
    { key: 'customerName', header: 'Cus Name' },
    { key: 'customerPhone', header: 'Phone' },
    { key: 'orderNumber', header: 'Order Id' },
    { key: 'sku', header: 'SKU' },
    { key: 'price', header: 'Price', align: 'right' },
    { key: 'qty', header: 'Qty', align: 'right' },
    { key: 'lineTotal', header: 'Total', align: 'right' },
    { key: 'totalQty', header: 'Total Qty', align: 'right' },
    { key: 'subTotal', header: 'Sub-Total', align: 'right' },
    { key: 'discount', header: 'Discount', align: 'right' },
    { key: 'totalAmount', header: 'Total Amount', align: 'right' },
    { key: 'advance', header: 'Advance', align: 'right' },
    { key: 'deliveryCharge', header: 'Delivery Charge', align: 'right' },
    { key: 'cod', header: 'COD', align: 'right' },
    { key: 'courier', header: 'Courier' },
  ];
  const rows: Record<string, string | number>[] = data.rows.map((r, i) => ({
    sl: i + 1,
    date: formatDateCell(r.date),
    brand: r.brand,
    customerName: r.customerName,
    customerPhone: r.customerPhone,
    orderNumber: r.orderNumber,
    sku: r.sku,
    price: r.price,
    qty: r.qty,
    lineTotal: r.lineTotal,
    totalQty: r.totalQty,
    subTotal: r.subTotal,
    discount: r.discount,
    totalAmount: r.totalAmount,
    advance: r.advance,
    deliveryCharge: r.deliveryCharge,
    cod: r.cod,
    courier: r.courier,
  }));

  // A trailing "Total" row summing every numeric column across the displayed rows, matching the
  // reference report's own grand-total footer — which sums shown values as-is, including the
  // order-level fields (subTotal/discount/totalAmount/advance/deliveryCharge/cod) that repeat on
  // each line of a multi-item order, rather than de-duplicating per order.
  if (rows.length > 0) {
    const numericKeys: (keyof (typeof rows)[number])[] = ['price', 'qty', 'lineTotal', 'totalQty', 'subTotal', 'discount', 'totalAmount', 'advance', 'deliveryCharge', 'cod'];
    const totalRow: Record<string, string | number> = { sl: '', date: '', brand: '', customerName: 'TOTAL', customerPhone: '', orderNumber: '', sku: '', courier: '' };
    for (const k of numericKeys) totalRow[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    rows.push(totalRow);
  }

  return { columns, rows };
}
