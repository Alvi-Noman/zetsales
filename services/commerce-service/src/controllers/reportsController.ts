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
} from '@zetsales/shared';

function parseDateRange(req: AuthenticatedRequest): { from: Date; to: Date } {
  const range = typeof req.query.range === 'string' ? req.query.range : 'last30';
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  return resolveRange(range, from, to).current;
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
    db.collection('orders').find({ _id: { $in: orderIds }, tenantId }).toArray(),
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
        source: storeName,
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
    db.collection('orders').find({ _id: { $in: orderIds }, tenantId }).project({ lineItems: 1 }).toArray(),
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
    db.collection('orders').find({ _id: { $in: orderIds }, tenantId }).toArray(),
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
          source: storeName,
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
