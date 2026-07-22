import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { resolveRange } from '../utils/dateRange.js';
import type {
  StockReportDTO,
  StockReportRowDTO,
  CourierHandoverOrdersReportDTO,
  CourierHandoverOrdersReportRowDTO,
  CourierHandoverItemsReportDTO,
  CourierHandoverItemsReportRowDTO,
  CourierHandoverFinancialReportDTO,
  CourierHandoverFinancialReportRowDTO,
  CourierReturnReportDTO,
  CourierReturnReportRowDTO,
  AdvancePaymentReportDTO,
  AdvancePaymentReportRowDTO,
  ProductConfirmationReportDTO,
  ProductConfirmationReportRowDTO,
  CancelledOrdersReportDTO,
  CancelledOrdersReportRowDTO,
  CourierHandoverStatusReportDTO,
  CourierHandoverStatusReportRowDTO,
  CourierProductDeliveryReportDTO,
  CourierProductDeliveryReportRowDTO,
  ConfirmDateSaleProfitReportDTO,
  ConfirmDateSaleProfitReportRowDTO,
  EmployeeBaseReportDTO,
  EmployeeBaseReportRowDTO,
  DistrictSalesReportDTO,
  DistrictSalesReportRowDTO,
  PurchaseReportDTO,
  PurchaseReportRowDTO,
  PurchaseItemDetailsReportDTO,
  PurchaseItemDetailsReportRowDTO,
  SupplierLedgerReportDTO,
  SupplierLedgerReportRowDTO,
  ExpenseReportDTO,
  ExpenseReportRowDTO,
  IncomeExpenseReportDTO,
  IncomeExpenseReportRowDTO,
  CourierReconciliationReportDTO,
  CourierReconciliationReportRowDTO,
  CodChangeLogReportDTO,
  CodChangeLogReportRowDTO,
  InventoryAdjustmentReportDTO,
  InventoryAdjustmentReportRowDTO,
} from '@zetsales/shared';
import { detectDistrict } from '../utils/bangladeshDistricts.js';

function parseDateRange(req: AuthenticatedRequest): { from: Date; to: Date } {
  const range = typeof req.query.range === 'string' ? req.query.range : 'last30';
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  return resolveRange(range, from, to).current;
}

// The AnalyticsFilterBar's store dropdown is wired to every report page, but until now no report
// handler actually read it — `orders.storeId` is the only place it's a meaningful filter (POs,
// expenses, inventory movements, and supplier ledger entries aren't store-scoped), so this only
// gets threaded into handlers that query the `orders` collection.
function parseStoreId(req: AuthenticatedRequest): string | null {
  const raw = typeof req.query.storeId === 'string' ? req.query.storeId.trim() : '';
  return raw && raw !== 'all' ? raw : null;
}

function ordersStoreMatch(tenantId: string, storeId: string | null): Record<string, unknown> {
  const match: Record<string, unknown> = { tenantId };
  if (storeId) match.storeId = storeId;
  return match;
}

// Best-effort Size/Color per variant — there's no dedicated size/color field anywhere in the
// product/variant schema (see StockReportRowDTO's doc comment), just a generic `options` array on
// the product (e.g. option name "Size", values [...]) positionally aligned with each variant's
// `optionValues`. Matches by option name containing "size"/"colour|color"; anything that doesn't
// resolve (no product options, ambiguous names, or the variant/product itself not found) reads
// '-', same as the reference report this was modeled on shows for most of its own rows.
async function buildSizeColorMap(tenantId: string): Promise<Map<string, { size: string; color: string }>> {
  const db = getDb();
  const products = await db.collection('products').find({ tenantId }).project({ options: 1, variants: 1 }).toArray();
  const map = new Map<string, { size: string; color: string }>();
  for (const p of products) {
    const options: { name: string }[] = p.options ?? [];
    const sizeIdx = options.findIndex((o) => /size/i.test(o.name));
    const colorIdx = options.findIndex((o) => /colou?r/i.test(o.name));
    for (const v of p.variants ?? []) {
      if (!v.id) continue;
      const values: string[] = v.optionValues ?? [];
      map.set(v.id, {
        size: sizeIdx >= 0 ? (values[sizeIdx] ?? '-') : '-',
        color: colorIdx >= 0 ? (values[colorIdx] ?? '-') : '-',
      });
    }
  }
  return map;
}

const BUY_REASONS = ['Incoming Stock received'];
const SALE_REASONS = ['Order fulfilled'];
const RETURN_REASONS = ['Order returned'];
const LOSS_REASONS = ['Damaged stock', 'Lost', 'Wrong Product', 'Lost in transit', 'Short-shipped by supplier', 'Damaged on arrival'];

// Opening/closing stock per product variant for the selected date range. ZetSales has no daily
// stock-snapshot table, so open/close are derived from the ONE thing that is stored — the current
// `inventoryLevels.onHand` — by reversing out movements: closing = current onHand minus every
// movement after the range's end; opening = closing minus every movement inside the range. The
// in-range movements are also bucketed by `reason` for the Buy/Sale/Return/Loss columns. "Pro.
// Sale" is the CURRENT `reserved` quantity (orders committed against this stock but not yet
// actually sold) — there's no historical reserved snapshot, so this column is always as-of-now,
// meaningful mainly when the date range includes today. "PO Ret" is always 0: no movement reason
// represents stock physically returned to a supplier in this schema yet.
export async function getStockReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const rawWarehouseId = typeof req.query.warehouseId === 'string' ? req.query.warehouseId.trim() : '';
  const warehouseId = rawWarehouseId && rawWarehouseId !== 'all' ? rawWarehouseId : null;
  // "Stock Report — Changed Items" reuses this same endpoint with changedOnly=true rather than a
  // separate handler — it's the identical ledger, just filtered to rows where something actually
  // moved (or an opening/closing mismatch exists) in the period.
  const changedOnly = req.query.changedOnly === 'true';

  const levelMatch: Record<string, unknown> = { tenantId };
  if (warehouseId) levelMatch.warehouseId = warehouseId;

  const levelRows = await db
    .collection('inventoryLevels')
    .aggregate([
      { $match: levelMatch },
      {
        $group: {
          _id: { productId: '$productId', variantId: '$variantId' },
          sku: { $first: '$sku' },
          productTitle: { $first: '$productTitle' },
          onHand: { $sum: '$onHand' },
          reserved: { $sum: '$reserved' },
        },
      },
    ])
    .toArray();

  const warehouseName = warehouseId ? ((await db.collection('warehouses').findOne({ _id: warehouseId } as any))?.name ?? 'Warehouse') : 'All Warehouse';

  if (levelRows.length === 0) {
    const dto: StockReportDTO = { warehouseName, rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const movementMatch: Record<string, unknown> = { tenantId };
  if (warehouseId) movementMatch.warehouseId = warehouseId;

  const [futureAgg, periodAgg, sizeColorMap] = await Promise.all([
    db
      .collection('inventoryMovements')
      .aggregate([
        { $match: { ...movementMatch, createdAt: { $gte: to } } },
        { $group: { _id: { productId: '$productId', variantId: '$variantId' }, delta: { $sum: '$delta' } } },
      ])
      .toArray(),
    db
      .collection('inventoryMovements')
      .aggregate([
        { $match: { ...movementMatch, createdAt: { $gte: from, $lt: to } } },
        {
          $group: {
            _id: { productId: '$productId', variantId: '$variantId' },
            delta: { $sum: '$delta' },
            buyUnit: { $sum: { $cond: [{ $in: ['$reason', BUY_REASONS] }, '$quantity', 0] } },
            saleUnit: { $sum: { $cond: [{ $in: ['$reason', SALE_REASONS] }, '$quantity', 0] } },
            returnUnit: { $sum: { $cond: [{ $in: ['$reason', RETURN_REASONS] }, '$quantity', 0] } },
            lossUnit: { $sum: { $cond: [{ $in: ['$reason', LOSS_REASONS] }, '$quantity', 0] } },
          },
        },
      ])
      .toArray(),
    buildSizeColorMap(tenantId),
  ]);

  const keyOf = (productId: unknown, variantId: unknown) => `${productId}::${variantId}`;
  const futureByKey = new Map(futureAgg.map((r: any) => [keyOf(r._id.productId, r._id.variantId), r.delta as number]));
  const periodByKey = new Map(periodAgg.map((r: any) => [keyOf(r._id.productId, r._id.variantId), r]));

  let rows: StockReportRowDTO[] = levelRows.map((r: any) => {
    const key = keyOf(r._id.productId, r._id.variantId);
    const future = futureByKey.get(key) ?? 0;
    const period = periodByKey.get(key);
    const close = r.onHand - future;
    const open = close - (period?.delta ?? 0);
    const sizeColor = sizeColorMap.get(r._id.variantId) ?? { size: '-', color: '-' };
    return {
      itemName: r.productTitle ?? 'Untitled product',
      sku: r.sku ?? null,
      size: sizeColor.size,
      color: sizeColor.color,
      quality: '-',
      open,
      proSale: r.reserved,
      buyUnit: period?.buyUnit ?? 0,
      saleUnit: period?.saleUnit ?? 0,
      returnUnit: period?.returnUnit ?? 0,
      lossUnit: period?.lossUnit ?? 0,
      poReturn: 0,
      close,
    };
  });

  if (changedOnly) {
    rows = rows.filter((r) => r.open !== r.close || r.buyUnit > 0 || r.saleUnit > 0 || r.returnUnit > 0 || r.lossUnit > 0);
  }

  const dto: StockReportDTO = { warehouseName, rows };
  res.json({ success: true, report: dto });
}

function courierLabel(provider: string): string {
  if (provider === 'steadfast') return 'Steadfast Courier';
  if (provider === 'pathao') return 'Pathao Courier';
  return provider;
}

// One row per (order, line item) inside every courier handover manifest (Pending or Confirmed)
// whose handover date falls in the selected range — productName/productSku are ';'-joined when an
// order has more than one line item, since this is a flat export table, not a nested manifest view.
export async function getCourierHandoverOrdersReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const handovers = await db
    .collection('courierHandovers')
    .find({ tenantId, handoverDate: { $gte: from, $lt: to } })
    .sort({ handoverDate: 1 })
    .toArray();

  if (handovers.length === 0) {
    const dto: CourierHandoverOrdersReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const orderIds = handovers.flatMap((h) => h.orderIds as ObjectId[]);
  const [orders, stores] = await Promise.all([
    db.collection('orders').find({ _id: { $in: orderIds }, ...ordersStoreMatch(tenantId, storeId) }).toArray(),
    db.collection('stores').find({ tenantId }).project({ displayName: 1 }).toArray(),
  ]);
  const orderById = new Map(orders.map((o) => [o._id.toString(), o]));
  const storeNameById = new Map(stores.map((s) => [s._id.toString(), s.displayName as string]));

  const rows: CourierHandoverOrdersReportRowDTO[] = [];
  for (const h of handovers) {
    const label = courierLabel(h.provider);
    for (const oid of h.orderIds as ObjectId[]) {
      const o = orderById.get(oid.toString());
      if (!o) continue;
      const lineItems = o.lineItems ?? [];
      const totalQty = lineItems.reduce((s: number, li: any) => s + li.quantity, 0);
      const storeName = storeNameById.get(o.storeId) ?? 'Store';
      rows.push({
        date: new Date(h.handoverDate).toISOString(),
        brand: storeName,
        customerName: o.customerName ?? 'No customer',
        orderNumber: o.number,
        courier: label,
        productName: lineItems.map((li: any) => li.title).join('; ') || '-',
        productSku: lineItems.map((li: any) => li.sku ?? '-').join('; ') || '-',
        qty: totalQty,
        totalQty,
      });
    }
  }

  const dto: CourierHandoverOrdersReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Units handed over to couriers in the selected range, aggregated per SKU across every handover
// manifest (Pending or Confirmed) — the item-level rollup of getCourierHandoverOrdersReport.
export async function getCourierHandoverItemsReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const handovers = await db
    .collection('courierHandovers')
    .find({ tenantId, handoverDate: { $gte: from, $lt: to } })
    .toArray();

  if (handovers.length === 0) {
    const dto: CourierHandoverItemsReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const orderIds = handovers.flatMap((h) => h.orderIds as ObjectId[]);
  const [orders, sizeColorMap] = await Promise.all([
    db.collection('orders').find({ _id: { $in: orderIds }, ...ordersStoreMatch(tenantId, storeId) }).project({ lineItems: 1 }).toArray(),
    buildSizeColorMap(tenantId),
  ]);

  const bySku = new Map<string, { itemName: string; sku: string | null; size: string; color: string; unit: number }>();
  for (const o of orders) {
    for (const li of o.lineItems ?? []) {
      const key = li.sku ?? li.title;
      const sizeColor = (li.variantId && sizeColorMap.get(li.variantId)) || { size: '-', color: '-' };
      const entry = bySku.get(key) ?? { itemName: li.title, sku: li.sku ?? null, size: sizeColor.size, color: sizeColor.color, unit: 0 };
      entry.unit += li.quantity;
      bySku.set(key, entry);
    }
  }

  const rows: CourierHandoverItemsReportRowDTO[] = [...bySku.values()]
    .sort((a, b) => b.unit - a.unit)
    .map((r) => ({ itemName: r.itemName, sku: r.sku, size: r.size, color: r.color, quality: '-', unit: r.unit }));

  const dto: CourierHandoverItemsReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Financial breakdown per (order, line item) in every handover manifest in the range — the
// per-order money fields (subTotal/discount/totalAmount/advance/deliveryCharge/cod) repeat on
// every line-item row of a multi-item order, same as productName/productSku repeat conceptually;
// this is a flat, spreadsheet-style export, not a nested invoice. `cod` is what's actually left to
// collect on delivery: order.total minus any advance already taken, and only for COD orders —
// zero for orders paid up front by bKash/Nagad/Card.
export async function getCourierHandoverFinancialReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const handovers = await db
    .collection('courierHandovers')
    .find({ tenantId, handoverDate: { $gte: from, $lt: to } })
    .sort({ handoverDate: 1 })
    .toArray();

  if (handovers.length === 0) {
    const dto: CourierHandoverFinancialReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const orderIds = handovers.flatMap((h) => h.orderIds as ObjectId[]);
  const [orders, stores] = await Promise.all([
    db.collection('orders').find({ _id: { $in: orderIds }, ...ordersStoreMatch(tenantId, storeId) }).toArray(),
    db.collection('stores').find({ tenantId }).project({ displayName: 1 }).toArray(),
  ]);
  const orderById = new Map(orders.map((o) => [o._id.toString(), o]));
  const storeNameById = new Map(stores.map((s) => [s._id.toString(), s.displayName as string]));

  const rows: CourierHandoverFinancialReportRowDTO[] = [];
  for (const h of handovers) {
    const label = courierLabel(h.provider);
    for (const oid of h.orderIds as ObjectId[]) {
      const o = orderById.get(oid.toString());
      if (!o) continue;
      const lineItems = o.lineItems ?? [];
      const totalQty = lineItems.reduce((s: number, li: any) => s + li.quantity, 0);
      const storeName = storeNameById.get(o.storeId) ?? 'Store';
      const cod = o.paymentMethod === 'Cash on Delivery' ? Math.max(0, o.total - (o.advanceAmount ?? 0)) : 0;
      for (const li of lineItems.length > 0 ? lineItems : [{ sku: null, quantity: 0, price: 0 }]) {
        rows.push({
          date: new Date(h.handoverDate).toISOString(),
          brand: storeName,
          customerName: o.customerName ?? 'No customer',
          customerPhone: o.customerPhone ?? '-',
          orderNumber: o.number,
          sku: li.sku ?? '-',
          price: li.price ?? 0,
          qty: li.quantity ?? 0,
          lineTotal: (li.price ?? 0) * (li.quantity ?? 0),
          totalQty,
          subTotal: o.subtotal ?? 0,
          discount: o.discount ?? 0,
          totalAmount: o.total ?? 0,
          advance: o.advanceAmount ?? 0,
          deliveryCharge: o.courierCharge ?? 0,
          cod,
          courier: label,
        });
      }
    }
  }

  const dto: CourierHandoverFinancialReportDTO = { rows };
  res.json({ success: true, report: dto });
}

const RETURN_LEG_STAGES = ['RTO Initiated', 'QC Pending', 'Returned'];
const STATUS_LABEL: Record<string, string> = { 'RTO Initiated': 'In Transit', 'QC Pending': 'QC Pending', Returned: 'Returned' };

// Per (order, line item) for orders on the return/RTO leg, matched by RETURN-RECEIVED date (the
// most recent history timestamp of entering RTO Initiated or Returned), not order-creation date —
// a return can legitimately be received weeks after the original order date. `finalOnly=true`
// (the "Courier Final Return Report" list entry) narrows this to Returned only, i.e. confirmed
// back into stock, dropping COD from the frontend table since nothing is left to collect on a
// finalized return.
export async function getCourierReturnReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const finalOnly = req.query.finalOnly === 'true';
  const storeId = parseStoreId(req);

  const stageMatch = finalOnly ? 'Returned' : { $in: RETURN_LEG_STAGES };
  const orders = await db
    .collection('orders')
    .find({ ...ordersStoreMatch(tenantId, storeId), stage: stageMatch })
    .toArray();

  const rows: CourierReturnReportRowDTO[] = [];
  for (const o of orders) {
    const history: { label: string; at: Date }[] = o.history ?? [];
    const returnEvt = [...history].reverse().find((h) => RETURN_LEG_STAGES.includes(h.label));
    const returnReceivedAt = returnEvt ? new Date(returnEvt.at) : null;
    if (!returnReceivedAt || returnReceivedAt < from || returnReceivedAt >= to) continue;

    const cod = o.paymentMethod === 'Cash on Delivery' ? Math.max(0, o.total - (o.advanceAmount ?? 0)) : 0;
    for (const li of o.lineItems ?? []) {
      rows.push({
        invoiceNo: o.invoiceNo ?? o.number,
        itemName: li.title,
        sku: li.sku ?? '-',
        invoiceDate: o.invoiceIssuedAt ? new Date(o.invoiceIssuedAt).toISOString() : null,
        returnReceivedDate: returnReceivedAt.toISOString(),
        courier: courierLabel(o.courierPartner === 'Steadfast' ? 'steadfast' : o.courierPartner === 'Pathao' ? 'pathao' : (o.courierPartner ?? '-')),
        quantity: li.quantity,
        itemPrice: li.price,
        itemDiscount: 0,
        deliveryCharge: o.courierCharge ?? 0,
        cod,
        status: STATUS_LABEL[o.stage] ?? o.stage,
      });
    }
  }

  rows.sort((a, b) => (a.returnReceivedDate ?? '').localeCompare(b.returnReceivedDate ?? ''));
  const dto: CourierReturnReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Orders with a nonzero advance payment, scoped by order-creation date (ZetSales has no separate
// "advance paid at" timestamp — the advance is captured at order entry, not as its own event).
// invoiceDate falls back to the order-creation date when no invoice has been issued yet.
export async function getAdvancePaymentReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const [orders, stores] = await Promise.all([
    db.collection('orders').find({ ...ordersStoreMatch(tenantId, storeId), createdAt: { $gte: from, $lt: to }, advanceAmount: { $gt: 0 } }).sort({ createdAt: 1 }).toArray(),
    db.collection('stores').find({ tenantId }).project({ displayName: 1 }).toArray(),
  ]);
  const storeNameById = new Map(stores.map((s) => [s._id.toString(), s.displayName as string]));

  const rows: AdvancePaymentReportRowDTO[] = orders.map((o) => {
    const storeName = storeNameById.get(o.storeId) ?? 'Store';
    const invoiceDate = o.invoiceIssuedAt ? new Date(o.invoiceIssuedAt).toISOString() : new Date(o.createdAt).toISOString();
    return {
      invoiceDate,
      billDate: new Date(o.createdAt).toISOString(),
      brand: storeName,
      customerName: o.customerName ?? 'No customer',
      customerPhone: o.customerPhone ?? '-',
      orderNumber: o.number,
      totalAmountWithDiscount: (o.subtotal ?? 0) - (o.discount ?? 0),
      deliveryCharge: o.shippingFee ?? 0,
      totalReceivableAmount: o.total ?? 0,
      advance: o.advanceAmount ?? 0,
      paymentChannel: o.paymentMethod,
    };
  });

  const dto: AdvancePaymentReportDTO = { rows };
  res.json({ success: true, report: dto });
}

const LEAD_EXCLUDED_CANCEL_REASONS = ['Spam', 'Duplicate order'];
const HOLD_PENDING_STAGES = ['Pending', 'Flagged', 'On Hold'];
const DELIVERED_STAGES = ['Delivered', 'Partial Delivered'];
const IN_TRANSIT_STAGES = ['Ready for Pickup', 'Shipped', 'Out for Delivery'];

// Per-product lead/confirmation funnel for orders created in the selected period — how many leads
// each product generated, how many were "real" (not Spam/Duplicate), how many actually confirmed
// (ever logged a 'Confirmed' history entry, so a later cancellation doesn't erase that it once
// was), and where the rest ended up (hold/pending, pre-order, cancelled, delivered, in transit).
export async function getProductConfirmationReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...ordersStoreMatch(tenantId, storeId), createdAt: { $gte: from, $lt: to } } },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] },
          productTitle: { $first: '$lineItems.title' },
          totalLead: { $sum: 1 },
          totalRoLead: { $sum: { $cond: [{ $in: ['$cancelReason', LEAD_EXCLUDED_CANCEL_REASONS] }, 0, 1] } },
          confirmed: {
            $sum: {
              $cond: [{ $in: [true, { $map: { input: { $ifNull: ['$history', []] }, as: 'h', in: { $eq: ['$$h.label', 'Confirmed'] } } }] }, 1, 0],
            },
          },
          holdAndPending: { $sum: { $cond: [{ $in: ['$stage', HOLD_PENDING_STAGES] }, 1, 0] } },
          preOrder: { $sum: { $cond: ['$wasShortOfStock', 1, 0] } },
          confirmationCancel: { $sum: { $cond: [{ $eq: ['$stage', 'Cancelled'] }, 1, 0] } },
          delivered: { $sum: { $cond: [{ $in: ['$stage', DELIVERED_STAGES] }, 1, 0] } },
          inTransit: { $sum: { $cond: [{ $in: ['$stage', IN_TRANSIT_STAGES] }, 1, 0] } },
        },
      },
      { $sort: { totalLead: -1 } },
      { $limit: 300 },
    ])
    .toArray();

  const dto: ProductConfirmationReportDTO = {
    rows: rows.map((r: any) => ({
      productTitle: r.productTitle ?? 'Untitled product',
      totalLead: r.totalLead,
      totalRoLead: r.totalRoLead,
      confirmed: r.confirmed,
      holdAndPending: r.holdAndPending,
      preOrder: r.preOrder,
      confirmationPercent: r.totalRoLead > 0 ? Math.round((r.confirmed / r.totalRoLead) * 10000) / 100 : 0,
      confirmationCancel: r.confirmationCancel,
      delivered: r.delivered,
      inTransit: r.inTransit,
    })),
  };
  res.json({ success: true, report: dto });
}

// Per-product cancellation breakdown, pivoted by cancelReason, for orders cancelled in the
// selected period (matched by the 'Cancelled' history entry's timestamp, not order-creation date).
export async function getCancelledOrdersReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const rows = await db
    .collection('orders')
    .aggregate([
      { $match: { ...ordersStoreMatch(tenantId, storeId), stage: 'Cancelled', history: { $elemMatch: { label: 'Cancelled', at: { $gte: from, $lt: to } } } } },
      { $unwind: '$lineItems' },
      {
        $group: {
          _id: { $ifNull: ['$lineItems.sku', '$lineItems.title'] },
          productTitle: { $first: '$lineItems.title' },
          fakeOrder: { $sum: { $cond: [{ $eq: ['$cancelReason', 'Spam'] }, 1, 0] } },
          doubleOrder: { $sum: { $cond: [{ $eq: ['$cancelReason', 'Duplicate order'] }, 1, 0] } },
          fraudCustomer: { $sum: { $cond: [{ $eq: ['$cancelReason', 'Fraud suspected'] }, 1, 0] } },
          noResponse: { $sum: { $cond: [{ $eq: ['$cancelReason', 'Customer unreachable'] }, 1, 0] } },
          priceIssue: { $sum: { $cond: [{ $eq: ['$cancelReason', 'Price/payment dispute'] }, 1, 0] } },
          badCustomer: { $sum: { $cond: [{ $eq: ['$cancelReason', 'Blocked customer'] }, 1, 0] } },
          otherReasons: {
            $sum: {
              $cond: [{ $in: ['$cancelReason', ['Customer changed mind', 'Wrong address', 'Out of stock', 'Other', null]] }, 1, 0],
            },
          },
          totalCancel: { $sum: 1 },
        },
      },
      { $sort: { totalCancel: -1 } },
      { $limit: 300 },
    ])
    .toArray();

  const dto: CancelledOrdersReportDTO = {
    rows: rows.map((r: any) => ({
      productTitle: r.productTitle ?? 'Untitled product',
      fakeOrder: r.fakeOrder,
      doubleOrder: r.doubleOrder,
      fraudCustomer: r.fraudCustomer,
      noResponse: r.noResponse,
      priceIssue: r.priceIssue,
      badCustomer: r.badCustomer,
      otherReasons: r.otherReasons,
      totalCancel: r.totalCancel,
    })),
  };
  res.json({ success: true, report: dto });
}

function bucketOrderOutcome(stage: string): 'delivered' | 'cancelReturn' | 'partialDelivered' | 'inTransit' {
  if (stage === 'Delivered') return 'delivered';
  if (stage === 'Partial Delivered') return 'partialDelivered';
  if (stage === 'Cancelled' || RETURN_LEG_STAGES.includes(stage)) return 'cancelReturn';
  return 'inTransit';
}

// Date-wise rollup of every courier handover manifest in the range, bucketed by each order's
// CURRENT stage (not its stage at handover time) — see CourierHandoverStatusReportDTO's doc
// comment. Grouped in Node rather than the aggregation pipeline since it needs each handover's
// orders joined against their live current stage, not anything stored on the handover itself.
export async function getCourierHandoverStatusReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const handovers = await db
    .collection('courierHandovers')
    .find({ tenantId, handoverDate: { $gte: from, $lt: to } })
    .toArray();

  if (handovers.length === 0) {
    const dto: CourierHandoverStatusReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const orderIds = handovers.flatMap((h) => h.orderIds as ObjectId[]);
  const orders = await db.collection('orders').find({ _id: { $in: orderIds }, ...ordersStoreMatch(tenantId, storeId) }).project({ stage: 1 }).toArray();
  const stageById = new Map(orders.map((o) => [o._id.toString(), o.stage as string]));

  const byDate = new Map<string, { totalHandover: number; delivered: number; cancelReturn: number; partialDelivered: number; inTransit: number }>();
  for (const h of handovers) {
    const dateKey = new Date(h.handoverDate).toISOString().slice(0, 10);
    const entry = byDate.get(dateKey) ?? { totalHandover: 0, delivered: 0, cancelReturn: 0, partialDelivered: 0, inTransit: 0 };
    for (const oid of h.orderIds as ObjectId[]) {
      const stage = stageById.get(oid.toString());
      if (!stage) continue;
      entry.totalHandover += 1;
      entry[bucketOrderOutcome(stage)] += 1;
    }
    byDate.set(dateKey, entry);
  }

  const rows: CourierHandoverStatusReportRowDTO[] = [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, v]) => ({
      date: new Date(date).toISOString(),
      totalHandover: v.totalHandover,
      delivered: v.delivered,
      cancelReturn: v.cancelReturn,
      partialDelivered: v.partialDelivered,
      inTransit: v.inTransit,
      successRate: v.totalHandover > 0 ? Math.round((v.delivered / v.totalHandover) * 1000) / 10 : 0,
    }));

  const dto: CourierHandoverStatusReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Per-product delivery outcome for every order in a courier handover manifest in the range — the
// courier-outcome counterpart to getProductConfirmationReport (which covers the pre-courier
// confirmation funnel). `totalCod` sums each order's full COD-due amount onto every line item of
// that order (same convention as getCourierHandoverFinancialReport), not a per-line-item split.
export async function getCourierProductDeliveryReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const handovers = await db
    .collection('courierHandovers')
    .find({ tenantId, handoverDate: { $gte: from, $lt: to } })
    .toArray();

  if (handovers.length === 0) {
    const dto: CourierProductDeliveryReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const orderIds = handovers.flatMap((h) => h.orderIds as ObjectId[]);
  const orders = await db.collection('orders').find({ _id: { $in: orderIds }, ...ordersStoreMatch(tenantId, storeId) }).toArray();

  const byProduct = new Map<string, { productTitle: string; totalOrders: number; delivered: number; returned: number; cancelled: number; inTransit: number; totalCod: number }>();
  for (const o of orders) {
    const cod = o.paymentMethod === 'Cash on Delivery' ? Math.max(0, o.total - (o.advanceAmount ?? 0)) : 0;
    const isDelivered = o.stage === 'Delivered' || o.stage === 'Partial Delivered';
    const isReturned = o.stage === 'Returned';
    const isCancelled = o.stage === 'Cancelled';
    const isInTransit = !isDelivered && !isReturned && !isCancelled;
    for (const li of o.lineItems ?? []) {
      const key = li.sku ?? li.title;
      const entry = byProduct.get(key) ?? { productTitle: li.title, totalOrders: 0, delivered: 0, returned: 0, cancelled: 0, inTransit: 0, totalCod: 0 };
      entry.totalOrders += 1;
      if (isDelivered) entry.delivered += 1;
      else if (isReturned) entry.returned += 1;
      else if (isCancelled) entry.cancelled += 1;
      else if (isInTransit) entry.inTransit += 1;
      entry.totalCod += cod;
      byProduct.set(key, entry);
    }
  }

  const rows: CourierProductDeliveryReportRowDTO[] = [...byProduct.values()]
    .sort((a, b) => b.totalOrders - a.totalOrders)
    .map((r) => ({
      productTitle: r.productTitle,
      totalOrders: r.totalOrders,
      delivered: r.delivered,
      returned: r.returned,
      cancelled: r.cancelled,
      inTransit: r.inTransit,
      totalCod: Math.round(r.totalCod * 100) / 100,
      successRate: r.totalOrders > 0 ? Math.round((r.delivered / r.totalOrders) * 1000) / 10 : 0,
      returnRate: r.totalOrders > 0 ? Math.round((r.returned / r.totalOrders) * 1000) / 10 : 0,
    }));

  const dto: CourierProductDeliveryReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Shared row-builder for both getConfirmDateSaleProfitReport and getHandoverDateSaleProfitReport
// — same profit math, just a different date field populates `billDate` (confirm date for one,
// handover date for the other) and a different match query decides which orders qualify.
function buildSaleProfitRow(o: any, storeName: string, dateIso: string | null): ConfirmDateSaleProfitReportRowDTO {
  const deliveryFeeBill = o.shippingFee ?? 0;
  const deliveryFeeCourier = o.courierCharge ?? 0;
  const deliveryFeeProfit = deliveryFeeBill - deliveryFeeCourier;
  const discountAmount = o.discount ?? 0;
  const codAmount = o.paymentMethod === 'Cash on Delivery' ? Math.max(0, o.total - (o.advanceAmount ?? 0)) : 0;
  const saleAmount = (o.subtotal ?? 0) - discountAmount;
  // COGS is only known once the order actually reaches Delivered/Partial Delivered — same
  // recognition point applyInventoryStageEffect uses everywhere else in the app.
  const buyAmount = o.stage === 'Delivered' || o.stage === 'Partial Delivered' ? (o.cogsTotal ?? 0) : 0;
  // saleAmount is already net of discount, so it isn't subtracted a second time here.
  const totalProfitAmount = saleAmount - buyAmount + deliveryFeeProfit;

  return {
    billDate: dateIso,
    brand: storeName,
    billNumber: o.invoiceNo ?? o.number,
    receiverName: o.customerName ?? 'No customer',
    courier: courierLabel(o.courierPartner === 'Steadfast' ? 'steadfast' : o.courierPartner === 'Pathao' ? 'pathao' : (o.courierPartner ?? '-')),
    orderStatus: o.stage,
    paidAmount: o.advanceAmount ?? 0,
    deliveryFeeBill,
    deliveryFeeCourier,
    deliveryFeeProfit,
    discountAmount,
    codAmount,
    saleAmount,
    buyAmount,
    totalProfitAmount,
  };
}

// Per-order profit breakdown, matched by CONFIRM date (the 'Confirmed' history entry's
// timestamp) — see ConfirmDateSaleProfitReportRowDTO's doc comment for the COGS-at-delivery
// convention and the fields that have no ZetSales equivalent yet (exchange, per-order return value).
export async function getConfirmDateSaleProfitReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const stage = typeof req.query.stage === 'string' && req.query.stage.trim() && req.query.stage !== 'all' ? req.query.stage.trim() : null;
  const storeId = parseStoreId(req);

  const match: Record<string, unknown> = { ...ordersStoreMatch(tenantId, storeId), history: { $elemMatch: { label: 'Confirmed', at: { $gte: from, $lt: to } } } };
  if (stage) match.stage = stage;
  const orders = await db.collection('orders').find(match).toArray();
  if (orders.length === 0) {
    const dto: ConfirmDateSaleProfitReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const stores = await db.collection('stores').find({ tenantId }).project({ displayName: 1 }).toArray();
  const storeNameById = new Map(stores.map((s) => [s._id.toString(), s.displayName as string]));

  const rows: ConfirmDateSaleProfitReportRowDTO[] = [];
  for (const o of orders) {
    const history: { label: string; at: Date }[] = o.history ?? [];
    const confirmedEvt = [...history].reverse().find((h) => h.label === 'Confirmed');
    if (!confirmedEvt) continue;
    const storeName = storeNameById.get(o.storeId) ?? 'Store';
    rows.push(buildSaleProfitRow(o, storeName, o.invoiceIssuedAt ? new Date(o.invoiceIssuedAt).toISOString() : null));
  }

  rows.sort((a, b) => (b.billDate ?? '').localeCompare(a.billDate ?? ''));
  const dto: ConfirmDateSaleProfitReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Per-order profit breakdown, matched by HANDOVER date (when the order's courier pickup manifest
// was created), not confirm/order date — same profit math and field caveats as
// getConfirmDateSaleProfitReport, see that function's doc comment.
export async function getHandoverDateSaleProfitReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const stage = typeof req.query.stage === 'string' && req.query.stage.trim() && req.query.stage !== 'all' ? req.query.stage.trim() : null;
  const storeId = parseStoreId(req);

  const handovers = await db.collection('courierHandovers').find({ tenantId, handoverDate: { $gte: from, $lt: to } }).toArray();
  if (handovers.length === 0) {
    const dto: ConfirmDateSaleProfitReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const orderIds = handovers.flatMap((h) => h.orderIds as ObjectId[]);
  const handoverDateByOrderId = new Map<string, Date>();
  for (const h of handovers) for (const oid of h.orderIds as ObjectId[]) handoverDateByOrderId.set(oid.toString(), h.handoverDate);

  const orderMatch: Record<string, unknown> = { _id: { $in: orderIds }, ...ordersStoreMatch(tenantId, storeId) };
  if (stage) orderMatch.stage = stage;
  const [orders, stores] = await Promise.all([
    db.collection('orders').find(orderMatch).toArray(),
    db.collection('stores').find({ tenantId }).project({ displayName: 1 }).toArray(),
  ]);
  const storeNameById = new Map(stores.map((s) => [s._id.toString(), s.displayName as string]));

  const rows: ConfirmDateSaleProfitReportRowDTO[] = orders.map((o) => {
    const storeName = storeNameById.get(o.storeId) ?? 'Store';
    const handoverDate = handoverDateByOrderId.get(o._id.toString());
    return buildSaleProfitRow(o, storeName, handoverDate ? new Date(handoverDate).toISOString() : null);
  });

  rows.sort((a, b) => (b.billDate ?? '').localeCompare(a.billDate ?? ''));
  const dto: ConfirmDateSaleProfitReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Per-order profit breakdown, matched by BILL/INVOICE date (when the invoice number was issued —
// see ensureInvoiceNumbers, fired at either print time or on entering Ready for Pickup) — the
// plain "every billed order" view, not scoped to a specific confirm or handover event. Same
// profit math and field caveats as getConfirmDateSaleProfitReport, see that function's doc comment.
export async function getSaleProfitReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const stage = typeof req.query.stage === 'string' && req.query.stage.trim() && req.query.stage !== 'all' ? req.query.stage.trim() : null;
  const storeId = parseStoreId(req);

  const match: Record<string, unknown> = { ...ordersStoreMatch(tenantId, storeId), invoiceIssuedAt: { $gte: from, $lt: to } };
  if (stage) match.stage = stage;
  const orders = await db.collection('orders').find(match).toArray();
  if (orders.length === 0) {
    const dto: ConfirmDateSaleProfitReportDTO = { rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const stores = await db.collection('stores').find({ tenantId }).project({ displayName: 1 }).toArray();
  const storeNameById = new Map(stores.map((s) => [s._id.toString(), s.displayName as string]));

  const rows: ConfirmDateSaleProfitReportRowDTO[] = orders.map((o) => {
    const storeName = storeNameById.get(o.storeId) ?? 'Store';
    return buildSaleProfitRow(o, storeName, o.invoiceIssuedAt ? new Date(o.invoiceIssuedAt).toISOString() : null);
  });

  rows.sort((a, b) => (b.billDate ?? '').localeCompare(a.billDate ?? ''));
  const dto: ConfirmDateSaleProfitReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Which EmployeeBaseReport bucket an order's CURRENT stage falls into — null for
// Confirmed/Processing, which aren't any of these named buckets (they still count toward
// Assign/Confirmed Order above, just not toward any of the outcome buckets below).
function employeeStageBucket(stage: string): keyof Pick<EmployeeBaseReportRowDTO, 'orderCreatedOrder' | 'holdOrder' | 'confirmationCancelOrder' | 'inTransitOrder' | 'deliveredOrder' | 'deliveryCancelOrder' | 'partiallyDeliveredOrder'> | null {
  if (stage === 'Pending' || stage === 'Flagged') return 'orderCreatedOrder';
  if (stage === 'On Hold') return 'holdOrder';
  if (stage === 'Cancelled') return 'confirmationCancelOrder';
  if (['Ready for Pickup', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending'].includes(stage)) return 'inTransitOrder';
  if (stage === 'Delivered') return 'deliveredOrder';
  if (stage === 'Returned') return 'deliveryCancelOrder';
  if (stage === 'Partial Delivered') return 'partiallyDeliveredOrder';
  return null;
}

// Per-agent order/unit funnel for the selected period — see EmployeeBaseReportRowDTO's doc comment
// for what "Assign" means here (every order this agent took any action on) and why every bucket
// but Confirmed Order is a current-stage breakdown of that same set rather than its own action type.
export async function getEmployeeBaseReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const orders = await db
    .collection('orders')
    .find({ ...ordersStoreMatch(tenantId, storeId), history: { $elemMatch: { by: { $ne: null }, at: { $gte: from, $lt: to } } } })
    .toArray();

  const byAgent = new Map<string, EmployeeBaseReportRowDTO>();
  function ensure(agent: string): EmployeeBaseReportRowDTO {
    const existing = byAgent.get(agent);
    if (existing) return existing;
    const fresh: EmployeeBaseReportRowDTO = {
      employee: agent,
      assignOrder: 0,
      assignUnit: 0,
      confirmedOrder: 0,
      confirmedUnit: 0,
      orderCreatedOrder: 0,
      orderCreatedUnit: 0,
      holdOrder: 0,
      holdUnit: 0,
      preOrderOrder: 0,
      preOrderUnit: 0,
      confirmationCancelOrder: 0,
      confirmationCancelUnit: 0,
      inTransitOrder: 0,
      inTransitUnit: 0,
      deliveredOrder: 0,
      deliveredUnit: 0,
      deliveryCancelOrder: 0,
      deliveryCancelUnit: 0,
      partiallyDeliveredOrder: 0,
      partiallyDeliveredUnit: 0,
    };
    byAgent.set(agent, fresh);
    return fresh;
  }

  for (const o of orders) {
    const history: { label: string; by?: string | null; at: Date }[] = o.history ?? [];
    const inRange = history.filter((h) => h.by && new Date(h.at) >= from && new Date(h.at) < to);
    const agents = new Set(inRange.map((h) => h.by as string));
    const confirmedAgents = new Set(inRange.filter((h) => h.label === 'Confirmed').map((h) => h.by as string));
    const unitCount = (o.lineItems ?? []).reduce((s: number, li: any) => s + li.quantity, 0);
    const bucket = employeeStageBucket(o.stage);

    for (const agent of agents) {
      const e = ensure(agent);
      e.assignOrder += 1;
      e.assignUnit += unitCount;
      if (confirmedAgents.has(agent)) {
        e.confirmedOrder += 1;
        e.confirmedUnit += unitCount;
      }
      if (o.wasShortOfStock) {
        e.preOrderOrder += 1;
        e.preOrderUnit += unitCount;
      }
      if (bucket) {
        (e[bucket] as number) += 1;
        const unitKey = bucket.replace(/Order$/, 'Unit') as keyof EmployeeBaseReportRowDTO;
        (e[unitKey] as number) += unitCount;
      }
    }
  }

  const dto: EmployeeBaseReportDTO = { rows: [...byAgent.values()].sort((a, b) => b.assignOrder - a.assignOrder) };
  res.json({ success: true, report: dto });
}

// Sales grouped by Bangladesh district, detected from each order's free-text address — see
// bangladeshDistricts.ts's doc comment for why this is keyword matching, not a real geocode.
// Orders whose address matched no known district land under 'Unknown' rather than being dropped.
export async function getDistrictSalesReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const orders = await db
    .collection('orders')
    .find({ ...ordersStoreMatch(tenantId, storeId), createdAt: { $gte: from, $lt: to } })
    .project({ address: 1, total: 1, stage: 1 })
    .toArray();

  const byDistrict = new Map<string, { orderCount: number; revenue: number; delivered: number; rtoReturned: number }>();
  for (const o of orders) {
    const district = detectDistrict(o.address) ?? 'Unknown';
    const entry = byDistrict.get(district) ?? { orderCount: 0, revenue: 0, delivered: 0, rtoReturned: 0 };
    entry.orderCount += 1;
    entry.revenue += o.total ?? 0;
    if (o.stage === 'Delivered' || o.stage === 'Partial Delivered') entry.delivered += 1;
    if (RETURN_LEG_STAGES.includes(o.stage)) entry.rtoReturned += 1;
    byDistrict.set(district, entry);
  }

  const rows: DistrictSalesReportRowDTO[] = [...byDistrict.entries()]
    .map(([district, v]) => ({
      district,
      orderCount: v.orderCount,
      revenue: Math.round(v.revenue * 100) / 100,
      delivered: v.delivered,
      rtoReturned: v.rtoReturned,
      rtoRate: v.orderCount > 0 ? Math.round((v.rtoReturned / v.orderCount) * 1000) / 10 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const dto: DistrictSalesReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// One row per purchase order created in the selected period. Bill Amount = the PO's own stored
// `total` (subtotal + shipping + duties); Items/Total Unit are derived from the lines array since
// purchaseOrders stores no count/sum field for either. Only 'sent' POs count — a 'draft' PO isn't
// a real purchase yet (nothing was actually ordered from the supplier), and 'cancelled' never was.
export async function getPurchaseReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);

  const orders = await db
    .collection('purchaseOrders')
    .find({ tenantId, status: 'sent', createdAt: { $gte: from, $lt: to } })
    .sort({ createdAt: -1 })
    .toArray();

  const rows: PurchaseReportRowDTO[] = orders.map((po: any) => {
    const lines = po.lines ?? [];
    return {
      billDate: new Date(po.createdAt).toISOString(),
      supplierName: po.supplierName ?? 'Unknown supplier',
      billNumber: po.poNumber,
      items: lines.length,
      totalUnit: lines.reduce((s: number, l: any) => s + (l.quantity ?? 0), 0),
      billAmount: po.total ?? 0,
      remark: po.notes ?? '-',
    };
  });

  const dto: PurchaseReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// One row per line item within every purchase order created in the selected period —
// poNumber lets the frontend group consecutive rows under a per-PO subtotal. lineTotal is derived
// (quantity × unitPrice); purchaseOrders has no stored per-line total. Only 'sent' POs count — see
// getPurchaseReport's doc comment.
export async function getPurchaseItemDetailsReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);

  const orders = await db
    .collection('purchaseOrders')
    .find({ tenantId, status: 'sent', createdAt: { $gte: from, $lt: to } })
    .sort({ createdAt: -1 })
    .toArray();

  const rows: PurchaseItemDetailsReportRowDTO[] = [];
  for (const po of orders) {
    const dateIso = new Date(po.createdAt).toISOString();
    for (const l of po.lines ?? []) {
      rows.push({
        poNumber: po.poNumber,
        date: dateIso,
        supplier: po.supplierName ?? 'Unknown supplier',
        itemName: l.productTitle ?? 'Untitled product',
        sku: l.sku ?? null,
        unit: l.quantity ?? 0,
        unitPrice: l.unitPrice ?? 0,
        lineTotal: Math.round((l.quantity ?? 0) * (l.unitPrice ?? 0) * 100) / 100,
      });
    }
  }

  const dto: PurchaseItemDetailsReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// The only two inventoryMovements reasons that reliably carry a supplierId — see
// suppliersController.ts's identical constant and its doc comment for why receiving/write-off
// events are excluded (a single stock bucket can blend shipments from more than one supplier).
const SUPPLIER_LEDGER_REASONS = ['Opening balance', 'Incoming Stock'];

// Running debit/credit ledger for one supplier — see SupplierLedgerReportRowDTO's doc comment for
// why `credit` is always 0 (no supplier-payment feature exists in ZetSales yet). Opening balance
// is every ledger-eligible movement before the range start, netted into a single starting row;
// everything inside the range follows as its own row with a running balance.
export async function getSupplierLedgerReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const rawSupplierId = typeof req.query.supplierId === 'string' ? req.query.supplierId.trim() : '';
  const supplierId = rawSupplierId && rawSupplierId !== 'all' ? rawSupplierId : null;

  if (!supplierId) {
    const dto: SupplierLedgerReportDTO = { supplierName: '-', rows: [] };
    res.json({ success: true, report: dto });
    return;
  }

  const [supplier, priorMovements, movements] = await Promise.all([
    db.collection('suppliers').findOne({ _id: new ObjectId(supplierId), tenantId }),
    db
      .collection('inventoryMovements')
      .find({ tenantId, supplierId, reason: { $in: SUPPLIER_LEDGER_REASONS }, createdAt: { $lt: from } })
      .toArray(),
    db
      .collection('inventoryMovements')
      .find({ tenantId, supplierId, reason: { $in: SUPPLIER_LEDGER_REASONS }, createdAt: { $gte: from, $lt: to } })
      .sort({ createdAt: 1 })
      .toArray(),
  ]);

  let balance = priorMovements.reduce((s, m: any) => s + Math.abs(m.valueDelta ?? 0), 0);
  const rows: SupplierLedgerReportRowDTO[] = [
    { date: from.toISOString(), docNo: 'N/A', type: 'OPENING BALANCE', remark: 'Balance Carry Forward', debit: 0, credit: 0, balance },
  ];
  for (const m of movements as any[]) {
    const debit = Math.abs(m.valueDelta ?? 0);
    balance += debit;
    rows.push({
      date: new Date(m.createdAt).toISOString(),
      docNo: m.productTitle ? `${m.sku ?? m.productTitle}` : 'N/A',
      type: m.reason,
      remark: m.note ?? '-',
      debit,
      credit: 0,
      balance,
    });
  }

  const dto: SupplierLedgerReportDTO = { supplierName: supplier?.name ?? 'Unknown supplier', rows };
  res.json({ success: true, report: dto });
}

// Flat expense list for the selected period, matched by each expense's own `date` (not
// row-creation `createdAt`). No "code" column — category is the only classifier ZetSales tracks.
export async function getExpenseReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);

  const expenses = await db
    .collection('expenses')
    .find({ tenantId, date: { $gte: from, $lt: to } })
    .sort({ date: -1 })
    .toArray();

  const rows: ExpenseReportRowDTO[] = expenses.map((e: any) => ({
    date: new Date(e.date).toISOString(),
    category: e.category,
    remark: e.note ?? '-',
    amount: e.amount,
  }));

  const dto: ExpenseReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Simplified income/expense statement — Total Income is delivered-order revenue (same
// 'Delivered'/'Partial Delivered' history-event convention getProfitAndLoss uses in
// accountingController.ts), Total Expenses is the real expenses collection grouped by category.
// Deliberately NOT the full P&L (no COGS/shrinkage/gift deductions) — this mirrors the simpler
// "Income and Expense Statement" reference report, which only ever showed Income vs. Expense, not
// gross margin. Assets/Liability/Capital are omitted entirely — see IncomeExpenseReportDTO's doc
// comment for why (no such data exists in ZetSales, not just an edge case).
export async function getIncomeExpenseReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  // Expenses aren't store-scoped (no storeId field on that collection), so only the revenue side
  // of this statement is affected by the store filter.
  const storeId = parseStoreId(req);

  const [revenueAgg, expenseAgg] = await Promise.all([
    db
      .collection('orders')
      .aggregate([
        { $match: { ...ordersStoreMatch(tenantId, storeId), history: { $elemMatch: { label: { $in: ['Delivered', 'Partial Delivered'] }, at: { $gte: from, $lt: to } } } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ])
      .toArray(),
    db
      .collection('expenses')
      .aggregate([{ $match: { tenantId, date: { $gte: from, $lt: to } } }, { $group: { _id: '$category', amount: { $sum: '$amount' } } }, { $sort: { amount: -1 } }])
      .toArray(),
  ]);

  const revenue = revenueAgg[0]?.total ?? 0;
  const totalExpenses = expenseAgg.reduce((s: number, e: any) => s + e.amount, 0);

  const rows: IncomeExpenseReportRowDTO[] = [
    { label: 'Income', amount: null, kind: 'section' },
    { label: 'Sales Income', amount: revenue, kind: 'item' },
  ];
  if (expenseAgg.length > 0) {
    rows.push({ label: 'Expense', amount: null, kind: 'section' });
    for (const e of expenseAgg as any[]) rows.push({ label: e._id ?? 'Uncategorized', amount: e.amount, kind: 'item' });
  }
  rows.push(
    { label: 'Total Expenses', amount: Math.round(totalExpenses * 100) / 100, kind: 'summary' },
    { label: 'Total Income', amount: Math.round(revenue * 100) / 100, kind: 'summary' },
    { label: 'Net Income', amount: Math.round((revenue - totalExpenses) * 100) / 100, kind: 'summary' },
  );

  const dto: IncomeExpenseReportDTO = { rows };
  res.json({ success: true, report: dto });
}

const RECONCILIATION_PROVIDER_TO_PARTNER: Record<string, string> = { steadfast: 'Steadfast', pathao: 'Pathao' };

// Per-courier cash reconciliation — same computation as getCourierReconciliation
// (analyticsController.ts), duplicated here as this file's own bespoke report rather than a
// re-shaped Analytics DTO (see this file's top-of-file convention). Deliberately ignores the
// date-range query param — deliveredCodAmount/due are lifetime running balances, not scoped to a
// period, same reasoning as the source card.
export async function getCourierReconciliationReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const storeId = parseStoreId(req);

  const couriers = await db.collection('couriers').find({ tenantId }).toArray();

  const [deliveredAgg, returnedAgg, paidAgg] = await Promise.all([
    db
      .collection('orders')
      .aggregate([
        { $match: { ...ordersStoreMatch(tenantId, storeId), courierPartner: { $ne: null }, paymentMethod: 'Cash on Delivery', stage: { $in: ['Delivered', 'Partial Delivered'] } } },
        { $group: { _id: '$courierPartner', deliveredCodAmount: { $sum: '$total' }, courierCharges: { $sum: { $ifNull: ['$courierCharge', 0] } } } },
      ])
      .toArray(),
    db
      .collection('orders')
      .aggregate([
        { $match: { ...ordersStoreMatch(tenantId, storeId), courierPartner: { $ne: null }, courierConsignmentId: { $ne: null }, stage: 'Returned' } },
        { $group: { _id: '$courierPartner', returnCharges: { $sum: { $ifNull: ['$courierReturnCharge', 0] } } } },
      ])
      .toArray(),
    db.collection('courierSettlements').aggregate([{ $match: { tenantId } }, { $group: { _id: '$provider', paid: { $sum: '$amount' } } }]).toArray(),
  ]);

  const deliveredByPartner = new Map(deliveredAgg.map((r: any) => [r._id, r]));
  const returnedByPartner = new Map(returnedAgg.map((r: any) => [r._id, r.returnCharges as number]));
  const paidByProvider = new Map(paidAgg.map((r: any) => [r._id, r.paid as number]));

  const rows: CourierReconciliationReportRowDTO[] = couriers.map((c: any) => {
    const partner = RECONCILIATION_PROVIDER_TO_PARTNER[c.provider] ?? c.provider;
    const delivered = deliveredByPartner.get(partner);
    const deliveredCodAmount = delivered?.deliveredCodAmount ?? 0;
    const courierCharges = delivered?.courierCharges ?? 0;
    const returnCharges = returnedByPartner.get(partner) ?? 0;
    const expectedReceivable = deliveredCodAmount - courierCharges - returnCharges;
    const paid = paidByProvider.get(c.provider) ?? 0;
    return {
      provider: c.provider,
      displayName: c.displayName,
      deliveredCodAmount,
      courierCharges,
      returnCharges,
      expectedReceivable,
      paid,
      due: Math.round((expectedReceivable - paid) * 100) / 100,
    };
  });

  const dto: CourierReconciliationReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// One row per individual COD-amount edit in the selected period — the order-level detail behind
// the "COD change log" Analytics card, which only shows totals grouped by editor. Parses the same
// "৳X → ৳Y" history detail string that card already reads (see buildOrderUpdate in
// ordersController.ts).
export async function getCodChangeLogReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);
  const storeId = parseStoreId(req);

  const docs = await db
    .collection('orders')
    .aggregate([
      { $match: { ...ordersStoreMatch(tenantId, storeId), history: { $elemMatch: { label: 'COD amount changed', at: { $gte: from, $lt: to } } } } },
      { $unwind: '$history' },
      { $match: { 'history.label': 'COD amount changed', 'history.at': { $gte: from, $lt: to } } },
      { $project: { number: 1, by: '$history.by', detail: '$history.detail', at: '$history.at' } },
    ])
    .toArray();

  const rows: CodChangeLogReportRowDTO[] = docs.map((d: any) => {
    const parsed = /৳([\d.]+) → ৳([\d.]+)/.exec(d.detail ?? '');
    const oldAmount = parsed ? Number(parsed[1]) : 0;
    const newAmount = parsed ? Number(parsed[2]) : 0;
    return {
      date: new Date(d.at).toISOString(),
      orderNumber: d.number,
      changedBy: d.by ?? 'Unknown',
      oldAmount,
      newAmount,
      delta: Math.round((newAmount - oldAmount) * 100) / 100,
    };
  });

  rows.sort((a, b) => b.date.localeCompare(a.date));
  const dto: CodChangeLogReportDTO = { rows };
  res.json({ success: true, report: dto });
}

// Same reason set as getInventoryAdjustments (analyticsController.ts) — damage, loss, cycle-count
// corrections, and receiving discrepancies. Routine sales/returns and warehouse-to-warehouse
// transfers aren't included, same scope as that card.
const INVENTORY_ADJUSTMENT_REASONS = [
  'Damaged stock',
  'Lost',
  'Wrong Product',
  'Lost in transit',
  'Manual adjustment',
  'Cycle count',
  'Wrong entry',
  'Found stock',
  'Short-shipped by supplier',
  'Damaged on arrival',
];

// One row per individual inventory adjustment in the selected period — the event-level detail
// behind the "Inventory adjustments" Analytics card, which only shows totals grouped by reason.
export async function getInventoryAdjustmentReport(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const { from, to } = parseDateRange(req);

  const movements = await db
    .collection('inventoryMovements')
    .find({ tenantId, reason: { $in: INVENTORY_ADJUSTMENT_REASONS }, createdAt: { $gte: from, $lt: to } })
    .sort({ createdAt: -1 })
    .toArray();

  const rows: InventoryAdjustmentReportRowDTO[] = movements.map((m: any) => ({
    date: new Date(m.createdAt).toISOString(),
    itemName: m.productTitle ?? 'Untitled product',
    sku: m.sku ?? null,
    warehouseName: m.warehouseName ?? 'Warehouse',
    reason: m.reason,
    quantity: Math.abs(m.delta ?? 0),
    value: Math.abs(m.valueDelta ?? 0),
    note: m.note ?? '-',
    recordedBy: m.createdBy ?? 'Unknown',
  }));

  const dto: InventoryAdjustmentReportDTO = { rows };
  res.json({ success: true, report: dto });
}
