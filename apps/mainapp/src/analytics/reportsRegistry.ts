import type { OrderStage } from '@zetsales/shared';
import {
  getStockReport,
  getCourierHandoverOrdersReport,
  getCourierHandoverItemsReport,
  getCourierHandoverFinancialReport,
  getCourierReturnReport,
  getAdvancePaymentReport,
  getProductConfirmationReport,
  getCancelledOrdersReport,
  getCourierHandoverStatusReport,
  getCourierProductDeliveryReport,
  getConfirmDateSaleProfitReport,
  getHandoverDateSaleProfitReport,
  getSaleProfitReport,
  getEmployeeBaseReport,
  getDistrictSalesReport,
  getPurchaseReport,
  getPurchaseItemDetailsReport,
  getSupplierLedgerReport,
  getExpenseReport,
  getIncomeExpenseReport,
  getCourierReconciliationReport,
  getCodChangeLogReport,
  getInventoryAdjustmentReport,
  type StockReportQueryParams,
  type CourierReturnReportQueryParams,
  type SupplierLedgerReportQueryParams,
} from '../lib/reportsApi';
import type { AnalyticsQueryParams } from '../lib/analyticsApi';
import { formatMoney } from './format';

// Display-only currency formatter for ReportColumn.format — CSV export bypasses `format` entirely
// (see ReportColumn's doc comment) and always gets the raw number, so this only affects the
// on-screen table and the print/PDF view. Tolerates '' for rows like Income vs. expenses'
// section-header rows, which have no amount.
const moneyFmt = (v: string | number) => (v === '' ? '' : formatMoney(Number(v)));

export type ReportKey =
  | 'stockReport'
  | 'stockReportChanged'
  | 'courierHandoverOrders'
  | 'courierHandoverItems'
  | 'courierHandoverFinancial'
  | 'courierReturn'
  | 'courierFinalReturn'
  | 'advancePayment'
  | 'productConfirmation'
  | 'cancelledOrders'
  | 'courierHandoverStatus'
  | 'courierProductDelivery'
  | 'confirmDateSaleProfit'
  | 'handoverDateSaleProfit'
  | 'saleProfit'
  | 'employeeBase'
  | 'districtSales'
  | 'purchase'
  | 'purchaseItemDetails'
  | 'supplierLedger'
  | 'expense'
  | 'incomeExpense'
  | 'courierReconciliation'
  | 'codChangeLog'
  | 'inventoryAdjustments';

// An order that's already been confirmed can never currently sit at Pending/Flagged again; one
// that's already been through a courier handover can never sit any earlier than Shipped. Each
// stage-filterable report gets only the stages it could actually show, not the full 13.
const POST_CONFIRM_STAGES: OrderStage[] = [
  'Confirmed',
  'Processing',
  'Ready for Pickup',
  'Shipped',
  'Out for Delivery',
  'RTO Initiated',
  'QC Pending',
  'Delivered',
  'Partial Delivered',
  'Returned',
  'Cancelled',
  'On Hold',
];
const POST_HANDOVER_STAGES: OrderStage[] = ['Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending', 'Delivered', 'Partial Delivered', 'Returned', 'Cancelled', 'On Hold'];
// Invoices are only ever issued at print time (during packing) or on entering Ready for Pickup —
// never at Confirmed, so that stage is dropped here too, unlike POST_CONFIRM_STAGES above.
const POST_BILL_STAGES: OrderStage[] = ['Processing', 'Ready for Pickup', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending', 'Delivered', 'Partial Delivered', 'Returned', 'Cancelled', 'On Hold'];

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

export type ReportCategory = 'Sales & Orders' | 'Courier & Delivery' | 'Profit & Finance' | 'Inventory' | 'Purchase & Suppliers' | 'Team';

// Display order for the grouped list page — not alphabetical, roughly the order a business would
// look through them (what sold -> what shipped -> what it made -> what's in stock -> what it
// bought -> who worked it).
export const REPORT_CATEGORY_ORDER: ReportCategory[] = [
  'Sales & Orders',
  'Courier & Delivery',
  'Profit & Finance',
  'Inventory',
  'Purchase & Suppliers',
  'Team',
];

export interface ReportListEntry {
  key: ReportKey;
  label: string;
  description: string;
  category: ReportCategory;
  needsWarehouseFilter?: boolean;
  // Presence (not just truthiness) is what shows the stage dropdown — the list itself is trimmed
  // per report to only stages that report's orders could actually be sitting at.
  stageFilterOptions?: OrderStage[];
  needsSupplierFilter?: boolean;
}

// A fixed list — no auto-generated one. Each report has its own backend endpoint
// (services/commerce-service/src/controllers/reportsController.ts) and its own bespoke table
// shape below, not a re-shaped Analytics DTO.
export const REPORTS_LIST: ReportListEntry[] = [
  {
    key: 'advancePayment',
    label: 'Advance payments',
    description: 'Orders placed with an upfront deposit in the selected period, and how much is still receivable.',
    category: 'Sales & Orders',
  },
  {
    key: 'productConfirmation',
    label: 'Product confirmation',
    description: 'Per-product lead and confirmation funnel — leads, confirmed, held/pending, pre-order, cancelled, delivered, and in transit.',
    category: 'Sales & Orders',
  },
  {
    key: 'cancelledOrders',
    label: 'Cancellations by product',
    description: 'Per-product breakdown of cancelled orders by reason, for orders cancelled in the selected period.',
    category: 'Sales & Orders',
  },
  {
    key: 'districtSales',
    label: 'Sales by district',
    description: 'Sales grouped by Bangladesh district, detected from each order\'s address — best-effort, since ZetSales has no structured district field. Unmatched addresses land under "Unknown".',
    category: 'Sales & Orders',
  },
  {
    key: 'courierHandoverOrders',
    label: 'Courier handover – orders',
    description: 'Every order included in a courier pickup manifest in the selected period.',
    category: 'Courier & Delivery',
  },
  {
    key: 'courierHandoverItems',
    label: 'Courier handover – items',
    description: 'Units handed over to couriers in the selected period, aggregated per item.',
    category: 'Courier & Delivery',
  },
  {
    key: 'courierHandoverFinancial',
    label: 'Courier handover – financials',
    description: 'Per-order pricing, discount, advance, delivery charge, and COD due for every handed-over order, with a grand total row.',
    category: 'Courier & Delivery',
  },
  {
    key: 'courierHandoverStatus',
    label: 'Courier handover – daily status',
    description: 'Date-wise rollup of handed-over orders by current outcome — delivered, cancel/return, partial, or still in transit.',
    category: 'Courier & Delivery',
  },
  {
    key: 'courierProductDelivery',
    label: 'Courier delivery by product',
    description: 'Per-product delivery outcome and COD value for every order handed to a courier in the selected period.',
    category: 'Courier & Delivery',
  },
  {
    key: 'courierReturn',
    label: 'Courier returns – in transit',
    description: 'Every item on an order currently in the return/RTO leg (in transit back or already returned), by return-received date.',
    category: 'Courier & Delivery',
  },
  {
    key: 'courierFinalReturn',
    label: 'Courier returns – confirmed',
    description: 'Same as Courier returns – in transit, narrowed to returns already confirmed back into stock.',
    category: 'Courier & Delivery',
  },
  {
    key: 'confirmDateSaleProfit',
    label: 'Order profit – by confirm date',
    description: 'Per-order profit breakdown by confirm date — sale value, delivery fee markup, and COGS-based profit once delivered.',
    category: 'Profit & Finance',
    stageFilterOptions: POST_CONFIRM_STAGES,
  },
  {
    key: 'handoverDateSaleProfit',
    label: 'Order profit – by handover date',
    description: 'Same per-order profit breakdown as the Confirm Date version, scoped by when the order was handed to a courier instead.',
    category: 'Profit & Finance',
    stageFilterOptions: POST_HANDOVER_STAGES,
  },
  {
    key: 'saleProfit',
    label: 'Order profit – by bill date',
    description: 'Same per-order profit breakdown, scoped by when the invoice/bill was issued — the plain "every billed order" view, not tied to a confirm or handover event.',
    category: 'Profit & Finance',
    stageFilterOptions: POST_BILL_STAGES,
  },
  {
    key: 'expense',
    label: 'Expenses',
    description: 'Every business expense logged in the selected period, by category.',
    category: 'Profit & Finance',
  },
  {
    key: 'incomeExpense',
    label: 'Income vs. expenses',
    description: 'Sales income against logged expenses for the selected period, with a net income line. ZetSales tracks no Assets/Liabilities/Capital, so this is an income-statement view only, not a full balance sheet.',
    category: 'Profit & Finance',
  },
  {
    key: 'stockReport',
    label: 'Stock ledger',
    description: 'Opening stock, purchases, sales, returns, and losses per item for the selected period.',
    category: 'Inventory',
    needsWarehouseFilter: true,
  },
  {
    key: 'stockReportChanged',
    label: 'Stock ledger – changed items',
    description: 'Same as Stock ledger, filtered to only items with actual movement in the selected period.',
    category: 'Inventory',
    needsWarehouseFilter: true,
  },
  {
    key: 'purchase',
    label: 'Purchases',
    description: 'Every purchase order sent to a supplier in the selected period, one row per PO, with item count, total units, and bill amount.',
    category: 'Purchase & Suppliers',
  },
  {
    key: 'purchaseItemDetails',
    label: 'Purchases – item details',
    description: 'Line-by-line breakdown of every purchase order sent to a supplier in the selected period, grouped by PO with a subtotal after each.',
    category: 'Purchase & Suppliers',
  },
  {
    key: 'supplierLedger',
    label: 'Supplier ledger',
    description: 'Running balance of stock received from a chosen supplier. ZetSales has no supplier-payment feature, so the Credit (Paid) column is always 0 — this is a debit-only ledger.',
    category: 'Purchase & Suppliers',
    needsSupplierFilter: true,
  },
  {
    key: 'employeeBase',
    label: 'Employee order activity',
    description: 'Per-agent order funnel for the selected period — every order they touched, broken down by current outcome.',
    category: 'Team',
  },
  {
    key: 'courierReconciliation',
    label: 'Courier reconciliation',
    description: 'How much each courier owes you for delivered COD orders. Delivered COD, charges, and Due are lifetime running balances, not scoped to the date filter above — a courier\'s outstanding balance carries forward.',
    category: 'Courier & Delivery',
  },
  {
    key: 'codChangeLog',
    label: 'COD change log',
    description: 'Every order-level COD amount edit in the selected period — who changed it, from what, to what. A high count here is usually a pricing or shipping-fee mistake upstream.',
    category: 'Profit & Finance',
  },
  {
    key: 'inventoryAdjustments',
    label: 'Inventory adjustments',
    description: 'Every individual damage, loss, cycle-count correction, or receiving discrepancy in the selected period. Routine sales/returns and warehouse-to-warehouse transfers aren\'t included.',
    category: 'Inventory',
  },
];

function formatDateCell(iso: string | null): string {
  if (!iso) return '-';
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

// Appends a trailing "Total" row summing the given numeric columns across every row — matching
// every reference report's own grand-total footer, which sums whatever's shown as-is rather than
// de-duplicating order-level fields that repeat across a multi-item order's lines.
function withTotalRow(rows: Record<string, string | number>[], numericKeys: string[], labelKey: string): Record<string, string | number>[] {
  if (rows.length === 0) return rows;
  const totalRow: Record<string, string | number> = { [labelKey]: 'TOTAL' };
  for (const k of numericKeys) totalRow[k] = rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  return [...rows, totalRow];
}

export async function fetchReportTable(key: ReportKey, query: AnalyticsQueryParams & { warehouseId?: string; stage?: string }): Promise<ReportTable> {
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

  if (key === 'courierHandoverFinancial') {
    const data = await getCourierHandoverFinancialReport(query);
    const columns: ReportColumn[] = [
      { key: 'sl', header: 'SL', align: 'right' },
      { key: 'date', header: 'Date' },
      { key: 'brand', header: 'Brand' },
      { key: 'customerName', header: 'Cus Name' },
      { key: 'customerPhone', header: 'Phone' },
      { key: 'orderNumber', header: 'Order Id' },
      { key: 'sku', header: 'SKU' },
      { key: 'price', header: 'Price', align: 'right', format: moneyFmt },
      { key: 'qty', header: 'Qty', align: 'right' },
      { key: 'lineTotal', header: 'Total', align: 'right', format: moneyFmt },
      { key: 'totalQty', header: 'Total Qty', align: 'right' },
      { key: 'subTotal', header: 'Sub-Total', align: 'right', format: moneyFmt },
      { key: 'discount', header: 'Discount', align: 'right', format: moneyFmt },
      { key: 'totalAmount', header: 'Total Amount', align: 'right', format: moneyFmt },
      { key: 'advance', header: 'Advance', align: 'right', format: moneyFmt },
      { key: 'deliveryCharge', header: 'Delivery Charge', align: 'right', format: moneyFmt },
      { key: 'cod', header: 'COD', align: 'right', format: moneyFmt },
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
    return { columns, rows: withTotalRow(rows, ['price', 'qty', 'lineTotal', 'totalQty', 'subTotal', 'discount', 'totalAmount', 'advance', 'deliveryCharge', 'cod'], 'customerName') };
  }

  if (key === 'courierReturn' || key === 'courierFinalReturn') {
    const params: CourierReturnReportQueryParams = key === 'courierFinalReturn' ? { ...query, finalOnly: true } : query;
    const data = await getCourierReturnReport(params);
    const isFinal = key === 'courierFinalReturn';
    const columns: ReportColumn[] = [
      { key: 'invoiceNo', header: 'Invoice No' },
      { key: 'itemName', header: 'Item Name' },
      { key: 'sku', header: 'SKU' },
      { key: 'invoiceDate', header: 'Invoice Date' },
      { key: 'returnReceivedDate', header: 'Return Received Date' },
      { key: 'courier', header: 'Courier Name' },
      { key: 'status', header: 'Status' },
      { key: 'quantity', header: 'Quantity', align: 'right' },
      { key: 'itemPrice', header: 'Item Price', align: 'right', format: moneyFmt },
      { key: 'itemDiscount', header: 'Item Discount', align: 'right', format: moneyFmt },
      { key: 'deliveryCharge', header: 'Delivery Charge', align: 'right', format: moneyFmt },
      ...(isFinal ? [] : [{ key: 'cod', header: 'COD', align: 'right' as const, format: moneyFmt }]),
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r) => {
      const row: Record<string, string | number> = {
        invoiceNo: r.invoiceNo,
        itemName: r.itemName,
        sku: r.sku,
        invoiceDate: formatDateCell(r.invoiceDate),
        returnReceivedDate: formatDateCell(r.returnReceivedDate),
        courier: r.courier,
        status: r.status,
        quantity: r.quantity,
        itemPrice: r.itemPrice,
        itemDiscount: r.itemDiscount,
        deliveryCharge: r.deliveryCharge,
      };
      if (!isFinal) row.cod = r.cod;
      return row;
    });
    const numericKeys = isFinal ? ['quantity', 'itemPrice', 'itemDiscount', 'deliveryCharge'] : ['quantity', 'itemPrice', 'itemDiscount', 'deliveryCharge', 'cod'];
    return { columns, rows: withTotalRow(rows, numericKeys, 'invoiceNo') };
  }

  if (key === 'advancePayment') {
    const data = await getAdvancePaymentReport(query);
    const columns: ReportColumn[] = [
      { key: 'sl', header: 'SL', align: 'right' },
      { key: 'invoiceDate', header: 'Invoice Date' },
      { key: 'billDate', header: 'Order Date' },
      { key: 'brand', header: 'Brand' },
      { key: 'customerName', header: 'Cus Name' },
      { key: 'customerPhone', header: 'Phone' },
      { key: 'orderNumber', header: 'Order Id' },
      { key: 'totalAmountWithDiscount', header: 'Total Amount (With Dis.)', align: 'right', format: moneyFmt },
      { key: 'deliveryCharge', header: 'Delivery Charge', align: 'right', format: moneyFmt },
      { key: 'totalReceivableAmount', header: 'Total Receivable Amount', align: 'right', format: moneyFmt },
      { key: 'advance', header: 'Advance', align: 'right', format: moneyFmt },
      { key: 'paymentChannel', header: 'Payment Channel' },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r, i) => ({
      sl: i + 1,
      invoiceDate: formatDateCell(r.invoiceDate),
      billDate: formatDateCell(r.billDate),
      brand: r.brand,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      orderNumber: r.orderNumber,
      totalAmountWithDiscount: r.totalAmountWithDiscount,
      deliveryCharge: r.deliveryCharge,
      totalReceivableAmount: r.totalReceivableAmount,
      advance: r.advance,
      paymentChannel: r.paymentChannel,
    }));
    return { columns, rows: withTotalRow(rows, ['totalAmountWithDiscount', 'deliveryCharge', 'totalReceivableAmount', 'advance'], 'customerName') };
  }

  if (key === 'productConfirmation') {
    const data = await getProductConfirmationReport(query);
    return {
      columns: [
        { key: 'productTitle', header: 'Product' },
        { key: 'totalLead', header: 'Total Lead', align: 'right' },
        { key: 'totalRoLead', header: 'Valid Leads', align: 'right' },
        { key: 'confirmed', header: 'Confirmed', align: 'right' },
        { key: 'holdAndPending', header: 'Hold & Pending', align: 'right' },
        { key: 'preOrder', header: 'Pre-Order', align: 'right' },
        { key: 'confirmationPercent', header: 'Confirmation %', align: 'right', format: (v) => `${v}%` },
        { key: 'confirmationCancel', header: 'Confirmation Cancel', align: 'right' },
        { key: 'delivered', header: 'Delivered', align: 'right' },
        { key: 'inTransit', header: 'In-Transit', align: 'right' },
      ],
      rows: data.rows.map((r) => ({
        productTitle: r.productTitle,
        totalLead: r.totalLead,
        totalRoLead: r.totalRoLead,
        confirmed: r.confirmed,
        holdAndPending: r.holdAndPending,
        preOrder: r.preOrder,
        confirmationPercent: r.confirmationPercent,
        confirmationCancel: r.confirmationCancel,
        delivered: r.delivered,
        inTransit: r.inTransit,
      })),
    };
  }

  if (key === 'cancelledOrders') {
    const data = await getCancelledOrdersReport(query);
    const columns: ReportColumn[] = [
      { key: 'productTitle', header: 'Product' },
      { key: 'fakeOrder', header: 'Fake Order', align: 'right' },
      { key: 'doubleOrder', header: 'Double Order', align: 'right' },
      { key: 'fraudCustomer', header: 'Fraud Customer', align: 'right' },
      { key: 'noResponse', header: 'No Response', align: 'right' },
      { key: 'priceIssue', header: 'Price Issue', align: 'right' },
      { key: 'badCustomer', header: 'Bad Customer', align: 'right' },
      { key: 'otherReasons', header: 'Other Reasons', align: 'right' },
      { key: 'totalCancel', header: 'Total Cancel', align: 'right' },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r) => ({
      productTitle: r.productTitle,
      fakeOrder: r.fakeOrder,
      doubleOrder: r.doubleOrder,
      fraudCustomer: r.fraudCustomer,
      noResponse: r.noResponse,
      priceIssue: r.priceIssue,
      badCustomer: r.badCustomer,
      otherReasons: r.otherReasons,
      totalCancel: r.totalCancel,
    }));
    return {
      columns,
      rows: withTotalRow(
        rows,
        ['fakeOrder', 'doubleOrder', 'fraudCustomer', 'noResponse', 'priceIssue', 'badCustomer', 'otherReasons', 'totalCancel'],
        'productTitle',
      ),
    };
  }

  if (key === 'courierHandoverStatus') {
    const data = await getCourierHandoverStatusReport(query);
    const columns: ReportColumn[] = [
      { key: 'date', header: 'Date' },
      { key: 'totalHandover', header: 'Total Handover', align: 'right' },
      { key: 'delivered', header: 'Delivered', align: 'right' },
      { key: 'cancelReturn', header: 'Cancel/Return', align: 'right' },
      { key: 'partialDelivered', header: 'Partial Del.', align: 'right' },
      { key: 'inTransit', header: 'In-Transit', align: 'right' },
      { key: 'successRate', header: 'Success Rate (%)', align: 'right', format: (v) => `${v}%` },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r) => ({
      date: formatDateCell(r.date),
      totalHandover: r.totalHandover,
      delivered: r.delivered,
      cancelReturn: r.cancelReturn,
      partialDelivered: r.partialDelivered,
      inTransit: r.inTransit,
      successRate: r.successRate,
    }));
    // Grand-total row recomputes successRate from the summed counts rather than averaging the
    // per-day rates, so it stays a true delivered/total ratio across the whole range.
    const summed = withTotalRow(rows, ['totalHandover', 'delivered', 'cancelReturn', 'partialDelivered', 'inTransit'], 'date');
    if (summed.length > rows.length) {
      const totalRow = summed[summed.length - 1];
      const totalHandover = Number(totalRow.totalHandover) || 0;
      const delivered = Number(totalRow.delivered) || 0;
      totalRow.successRate = totalHandover > 0 ? Math.round((delivered / totalHandover) * 1000) / 10 : 0;
    }
    return { columns, rows: summed };
  }

  if (key === 'courierProductDelivery') {
    const data = await getCourierProductDeliveryReport(query);
    const columns: ReportColumn[] = [
      { key: 'productTitle', header: 'Product Name' },
      { key: 'totalOrders', header: 'Total Orders', align: 'right' },
      { key: 'delivered', header: 'Delivered', align: 'right' },
      { key: 'returned', header: 'Returned', align: 'right' },
      { key: 'cancelled', header: 'Cancelled', align: 'right' },
      { key: 'inTransit', header: 'In Transit', align: 'right' },
      { key: 'totalCod', header: 'Total COD', align: 'right', format: moneyFmt },
      { key: 'successRate', header: 'Success Rate', align: 'right', format: (v) => `${v}%` },
      { key: 'returnRate', header: 'Return Rate', align: 'right', format: (v) => `${v}%` },
    ];
    return {
      columns,
      rows: data.rows.map((r) => ({
        productTitle: r.productTitle,
        totalOrders: r.totalOrders,
        delivered: r.delivered,
        returned: r.returned,
        cancelled: r.cancelled,
        inTransit: r.inTransit,
        totalCod: r.totalCod,
        successRate: r.successRate,
        returnRate: r.returnRate,
      })),
    };
  }

  if (key === 'confirmDateSaleProfit' || key === 'handoverDateSaleProfit' || key === 'saleProfit') {
    const data =
      key === 'confirmDateSaleProfit'
        ? await getConfirmDateSaleProfitReport(query)
        : key === 'handoverDateSaleProfit'
          ? await getHandoverDateSaleProfitReport(query)
          : await getSaleProfitReport(query);
    const dateHeader = key === 'confirmDateSaleProfit' ? 'Confirm Date' : key === 'handoverDateSaleProfit' ? 'Handover Date' : 'Bill Date';
    const columns: ReportColumn[] = [
      { key: 'sl', header: 'SL No', align: 'right' },
      { key: 'billDate', header: dateHeader },
      { key: 'brand', header: 'Brand Name' },
      { key: 'billNumber', header: 'Bill Number' },
      { key: 'receiverName', header: 'Receiver Name' },
      { key: 'courier', header: 'Courier Name' },
      { key: 'orderStatus', header: 'Order Status' },
      { key: 'paidAmount', header: 'Paid Amount (Bill)', align: 'right', format: moneyFmt },
      { key: 'deliveryFeeBill', header: 'Delivery Fee (Bill)', align: 'right', format: moneyFmt },
      { key: 'deliveryFeeCourier', header: 'Delivery Fee (Courier)', align: 'right', format: moneyFmt },
      { key: 'deliveryFeeProfit', header: 'Delivery Fee Profit', align: 'right', format: moneyFmt },
      { key: 'discountAmount', header: 'Discount Amount', align: 'right', format: moneyFmt },
      { key: 'codAmount', header: 'COD Amount', align: 'right', format: moneyFmt },
      { key: 'saleAmount', header: 'Sale Amount', align: 'right', format: moneyFmt },
      { key: 'buyAmount', header: 'Buy Amount', align: 'right', format: moneyFmt },
      { key: 'totalProfitAmount', header: 'Total Profit Amount', align: 'right', format: moneyFmt },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r, i) => ({
      sl: i + 1,
      billDate: formatDateCell(r.billDate),
      brand: r.brand,
      billNumber: r.billNumber,
      receiverName: r.receiverName,
      courier: r.courier,
      orderStatus: r.orderStatus,
      paidAmount: r.paidAmount,
      deliveryFeeBill: r.deliveryFeeBill,
      deliveryFeeCourier: r.deliveryFeeCourier,
      deliveryFeeProfit: r.deliveryFeeProfit,
      discountAmount: r.discountAmount,
      codAmount: r.codAmount,
      saleAmount: r.saleAmount,
      buyAmount: r.buyAmount,
      totalProfitAmount: r.totalProfitAmount,
    }));
    return {
      columns,
      rows: withTotalRow(
        rows,
        ['paidAmount', 'deliveryFeeBill', 'deliveryFeeCourier', 'deliveryFeeProfit', 'discountAmount', 'codAmount', 'saleAmount', 'buyAmount', 'totalProfitAmount'],
        'receiverName',
      ),
    };
  }

  if (key === 'employeeBase') {
  const data = await getEmployeeBaseReport(query);
  // Order-count only — Unit and per-column "% of team" were cut as noise: ZetSales orders are
  // overwhelmingly single-item so Unit tracked almost identically to Order, and share-of-team-
  // volume is a weaker signal than the real conversion/success rates already on the Confirmation
  // Performance and Employee Activity analytics cards.
  const buckets: { key: keyof (typeof data.rows)[number]; header: string }[] = [
    { key: 'assignOrder', header: 'Assign' },
    { key: 'confirmedOrder', header: 'Confirmed Order' },
    { key: 'orderCreatedOrder', header: 'Order Created' },
    { key: 'holdOrder', header: 'Hold' },
    { key: 'preOrderOrder', header: 'Pre-Order' },
    { key: 'confirmationCancelOrder', header: 'Confirmation Cancel' },
    { key: 'inTransitOrder', header: 'In Transit' },
    { key: 'deliveredOrder', header: 'Delivered' },
    { key: 'deliveryCancelOrder', header: 'Delivery Cancel' },
    { key: 'partiallyDeliveredOrder', header: 'Partially Delivered' },
  ];

  const columns: ReportColumn[] = [
    // ZetSales has no display-name field for team members — history entries are stamped with the
    // user's login email (see ordersController.ts), so that's honestly what this column shows.
    { key: 'employee', header: 'Employee (Email)' },
    ...buckets.map((b) => ({ key: b.key as string, header: b.header, align: 'right' as const })),
  ];

  const rows: Record<string, string | number>[] = data.rows.map((r) => {
    const row: Record<string, string | number> = { employee: r.employee };
    for (const b of buckets) row[b.key as string] = r[b.key] as number;
    return row;
  });

  return { columns, rows: withTotalRow(rows, buckets.map((b) => b.key as string), 'employee') };
  }

  if (key === 'districtSales') {
    const data = await getDistrictSalesReport(query);
    const columns: ReportColumn[] = [
      { key: 'district', header: 'District' },
      { key: 'orderCount', header: 'Orders', align: 'right' },
      { key: 'revenue', header: 'Order Value', align: 'right', format: moneyFmt },
      { key: 'delivered', header: 'Delivered', align: 'right' },
      { key: 'rtoReturned', header: 'RTO/Returned', align: 'right' },
      { key: 'rtoRate', header: 'RTO Rate', align: 'right', format: (v) => (v === '' ? '-' : `${v}%`) },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r) => ({
      district: r.district,
      orderCount: r.orderCount,
      revenue: r.revenue,
      delivered: r.delivered,
      rtoReturned: r.rtoReturned,
      rtoRate: r.rtoRate ?? '',
    }));
    return { columns, rows: withTotalRow(rows, ['orderCount', 'revenue', 'delivered', 'rtoReturned'], 'district') };
  }

  if (key === 'purchase') {
    const data = await getPurchaseReport(query);
    const columns: ReportColumn[] = [
      { key: 'sl', header: 'SL', align: 'right' },
      { key: 'billDate', header: 'Bill Date' },
      { key: 'supplierName', header: 'Supplier Name' },
      { key: 'billNumber', header: 'Bill Number' },
      { key: 'items', header: 'Items', align: 'right' },
      { key: 'totalUnit', header: 'Total Unit', align: 'right' },
      { key: 'billAmount', header: 'Bill Amount', align: 'right', format: moneyFmt },
      { key: 'remark', header: 'Remark' },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r, i) => ({
      sl: i + 1,
      billDate: formatDateCell(r.billDate),
      supplierName: r.supplierName,
      billNumber: r.billNumber,
      items: r.items,
      totalUnit: r.totalUnit,
      billAmount: r.billAmount,
      remark: r.remark,
    }));
    return { columns, rows: withTotalRow(rows, ['items', 'totalUnit', 'billAmount'], 'supplierName') };
  }

  if (key === 'purchaseItemDetails') {
    const data = await getPurchaseItemDetailsReport(query);
    const columns: ReportColumn[] = [
      { key: 'poNumber', header: 'PO Number' },
      { key: 'date', header: 'Date' },
      { key: 'supplier', header: 'Supplier' },
      { key: 'itemName', header: 'Item Name' },
      { key: 'sku', header: 'SKU' },
      { key: 'unit', header: 'Unit', align: 'right' },
      { key: 'unitPrice', header: 'Unit Price', align: 'right', format: moneyFmt },
      { key: 'lineTotal', header: 'Line Total', align: 'right', format: moneyFmt },
    ];
    // Backend rows come pre-grouped by PO (each PO's lines are contiguous) — walk the run and
    // drop a subtotal row after each group, matching the reference report's per-PO totals.
    const rows: Record<string, string | number>[] = [];
    let i = 0;
    while (i < data.rows.length) {
      const poNumber = data.rows[i].poNumber;
      let unitSum = 0;
      let lineTotalSum = 0;
      while (i < data.rows.length && data.rows[i].poNumber === poNumber) {
        const r = data.rows[i];
        rows.push({
          poNumber: r.poNumber,
          date: formatDateCell(r.date),
          supplier: r.supplier,
          itemName: r.itemName,
          sku: r.sku ?? '-',
          unit: r.unit,
          unitPrice: r.unitPrice,
          lineTotal: r.lineTotal,
        });
        unitSum += r.unit;
        lineTotalSum += r.lineTotal;
        i += 1;
      }
      rows.push({
        poNumber: `ORDER TOTAL (${poNumber})`,
        date: '',
        supplier: '',
        itemName: '',
        sku: '',
        unit: unitSum,
        unitPrice: '',
        lineTotal: lineTotalSum,
      });
    }
    return { columns, rows };
  }

  if (key === 'supplierLedger') {
    const data = await getSupplierLedgerReport(query as SupplierLedgerReportQueryParams);
    const columns: ReportColumn[] = [
      { key: 'date', header: 'Date' },
      { key: 'docNo', header: 'Item / SKU' },
      { key: 'type', header: 'Type' },
      { key: 'remark', header: 'Remark' },
      { key: 'debit', header: 'Debit (Buy)', align: 'right', format: moneyFmt },
      { key: 'credit', header: 'Credit (Paid)', align: 'right', format: moneyFmt },
      { key: 'balance', header: 'Balance', align: 'right', format: moneyFmt },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r) => ({
      date: formatDateCell(r.date),
      docNo: r.docNo,
      type: r.type,
      remark: r.remark,
      debit: r.debit,
      credit: r.credit,
      balance: r.balance,
    }));
    if (rows.length > 0) {
      const totalDebit = data.rows.reduce((s, r) => s + r.debit, 0);
      const totalCredit = data.rows.reduce((s, r) => s + r.credit, 0);
      rows.push({
        date: '',
        docNo: '',
        type: 'CLOSING BALANCE',
        remark: '',
        debit: totalDebit,
        credit: totalCredit,
        balance: data.rows[data.rows.length - 1].balance,
      });
    }
    return { columns, rows };
  }

  if (key === 'expense') {
    const data = await getExpenseReport(query);
    const columns: ReportColumn[] = [
      { key: 'sl', header: 'SL', align: 'right' },
      { key: 'date', header: 'Date' },
      { key: 'category', header: 'Category' },
      { key: 'remark', header: 'Remark' },
      { key: 'amount', header: 'Amount', align: 'right', format: moneyFmt },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r, i) => ({
      sl: i + 1,
      date: formatDateCell(r.date),
      category: r.category,
      remark: r.remark,
      amount: r.amount,
    }));
    return { columns, rows: withTotalRow(rows, ['amount'], 'category') };
  }

  if (key === 'incomeExpense') {
    const data = await getIncomeExpenseReport(query);
    const columns: ReportColumn[] = [
      { key: 'label', header: 'Account Head' },
      { key: 'amount', header: 'Amount', align: 'right', format: moneyFmt },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r) => ({
      label: r.kind === 'item' ? `    ${r.label}` : r.label.toUpperCase(),
      amount: r.amount ?? '',
    }));
    return { columns, rows };
  }

  if (key === 'courierReconciliation') {
    const data = await getCourierReconciliationReport({ storeId: query.storeId });
    const columns: ReportColumn[] = [
      { key: 'displayName', header: 'Courier' },
      { key: 'deliveredCodAmount', header: 'Delivered COD', align: 'right', format: moneyFmt },
      { key: 'courierCharges', header: 'Courier Charges', align: 'right', format: moneyFmt },
      { key: 'returnCharges', header: 'Return Charges', align: 'right', format: moneyFmt },
      { key: 'expectedReceivable', header: 'Expected Receivable', align: 'right', format: moneyFmt },
      { key: 'paid', header: 'Paid', align: 'right', format: moneyFmt },
      { key: 'due', header: 'Due', align: 'right', format: moneyFmt },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r) => ({
      displayName: r.displayName,
      deliveredCodAmount: r.deliveredCodAmount,
      courierCharges: r.courierCharges,
      returnCharges: r.returnCharges,
      expectedReceivable: r.expectedReceivable,
      paid: r.paid,
      due: r.due,
    }));
    return { columns, rows: withTotalRow(rows, ['deliveredCodAmount', 'courierCharges', 'returnCharges', 'expectedReceivable', 'paid', 'due'], 'displayName') };
  }

  if (key === 'codChangeLog') {
    const data = await getCodChangeLogReport(query);
    const columns: ReportColumn[] = [
      { key: 'sl', header: 'SL', align: 'right' },
      { key: 'date', header: 'Date' },
      { key: 'orderNumber', header: 'Order Id' },
      { key: 'changedBy', header: 'Changed By' },
      { key: 'oldAmount', header: 'Old Amount', align: 'right', format: moneyFmt },
      { key: 'newAmount', header: 'New Amount', align: 'right', format: moneyFmt },
      { key: 'delta', header: 'Change', align: 'right', format: moneyFmt },
    ];
    const rows: Record<string, string | number>[] = data.rows.map((r, i) => ({
      sl: i + 1,
      date: formatDateCell(r.date),
      orderNumber: r.orderNumber,
      changedBy: r.changedBy,
      oldAmount: r.oldAmount,
      newAmount: r.newAmount,
      delta: r.delta,
    }));
    return { columns, rows };
  }

  const data = await getInventoryAdjustmentReport(query);
  const columns: ReportColumn[] = [
    { key: 'date', header: 'Date' },
    { key: 'itemName', header: 'Item Name' },
    { key: 'sku', header: 'SKU' },
    { key: 'warehouseName', header: 'Warehouse' },
    { key: 'reason', header: 'Reason' },
    { key: 'quantity', header: 'Quantity', align: 'right' },
    { key: 'value', header: 'Value', align: 'right', format: moneyFmt },
    { key: 'note', header: 'Note' },
    { key: 'recordedBy', header: 'Recorded By' },
  ];
  const rows: Record<string, string | number>[] = data.rows.map((r) => ({
    date: formatDateCell(r.date),
    itemName: r.itemName,
    sku: r.sku ?? '-',
    warehouseName: r.warehouseName,
    reason: r.reason,
    quantity: r.quantity,
    value: r.value,
    note: r.note,
    recordedBy: r.recordedBy,
  }));
  return { columns, rows: withTotalRow(rows, ['quantity', 'value'], 'itemName') };
}
