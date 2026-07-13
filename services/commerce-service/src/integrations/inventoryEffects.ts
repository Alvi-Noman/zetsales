import { getDb } from '../utils/db.js';
import { maybeDispatchLowStock, type InventoryLevelSnapshot } from '../utils/lowStockCheck.js';
import type { OrderStage } from '@zetsales/shared';

export type InventoryState = 'none' | 'reserved' | 'consumed';

// 'RTO Initiated' and 'QC Pending' cover a failed delivery working its way back to the warehouse —
// stock stays held (not restocked, not resellable) through both, and only actually releases back
// to available on the final move to 'Returned', once someone's confirmed it's really back and fine.
export const RESERVED_STAGES: OrderStage[] = ['Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'RTO Initiated', 'QC Pending'];
const CONSUMED_STAGES: OrderStage[] = ['Delivered', 'Partial Delivered'];

// 'On Hold' freezes whatever state the order was in before being held — it isn't a state of its
// own, so it inherits the classification of heldFromStage instead of always meaning "reserved"
// (which would incorrectly reserve stock for an order that was never even confirmed). Callers must
// pass the heldFromStage snapshot from the SAME moment as `stage` — it changes as part of the very
// update being applied (set when entering hold, cleared on resume), so the "before" and "after"
// snapshots of an order can have different heldFromStage values for the same update.
export function resolveInventoryState(stage: OrderStage, heldFromStage: OrderStage | null | undefined): InventoryState {
  if (stage === 'On Hold') return resolveInventoryState(heldFromStage ?? 'Pending', undefined);
  if (RESERVED_STAGES.includes(stage)) return 'reserved';
  if (CONSUMED_STAGES.includes(stage)) return 'consumed';
  return 'none';
}

interface LineItemForEffect {
  sku: string | null;
  variant: string | null;
  quantity: number;
}

// Reserves/releases/consumes real stock as an order moves between inventory states — this is the
// bridge that makes "available" (on hand minus held) mean something real, instead of `reserved`
// sitting permanently at zero. A symmetric state-diff rather than a per-stage-pair table: leaving
// 'reserved' releases the hold, leaving 'consumed' restocks onHand (a return after delivery),
// entering 'reserved' adds the hold, entering 'consumed' deducts onHand — correct for every real
// transition (confirm, ship, deliver, cancel, return, hold/resume) through the same two rules.
//
// Matching a line item to a tracked variant is best-effort: order line items only carry `sku` and
// a free-text `variant` title (not a stable variant id), and confirmed live-data fact is that most
// multi-variant products (664 of 666) have sibling variants sharing an identical SKU. So this
// matches by SKU first, then disambiguates by variant label when multiple SKU matches exist,
// falling back to the most-stocked match if the label doesn't line up exactly. Silently no-ops
// when a line item's SKU has no matching inventoryLevels record at all — not every SKU has to be
// under ZetSales inventory management for this to work safely.
//
// Known risk, accepted rather than solved here: concurrent stage changes to the same order (e.g. a
// webhook sync racing a manual edit) could double-apply an effect if both read the "before" state
// before either write lands — this codebase doesn't use Mongo transactions anywhere else either,
// so this is a low-probability edge case consistent with the existing risk posture, not a new one.
//
// Returns the signed COGS delta across every line item (positive = COGS recognized on consumption,
// negative = COGS reversed by a post-delivery return, 0 if nothing was consumed/reversed or the
// SKU's cost isn't known) — callers accumulate this onto the order's `cogsTotal`. This is the one
// place stock actually gets consumed or un-consumed, so it's the only correct place to recognize or
// reverse Cost of Goods Sold; a naive per-order-line cost stamp would have to re-solve the same
// SKU/variant-label matching ambiguity this function already resolves.
//
// Also surfaces the first inventoryLevels location actually touched, so callers transitioning an
// order out of 'none' for the first time can remember which warehouse the order's stock really came
// from — that's the same place a courier's RTO physically lands, so it's the only honest source for
// a return's default/expected warehouse (see recordFulfillmentWarehouse below).
export interface StageEffectResult {
  cogsDelta: number;
  warehouse: { warehouseId: string; warehouseName: string } | null;
}

export async function applyInventoryStageEffect(
  tenantId: string,
  lineItems: LineItemForEffect[],
  fromState: InventoryState,
  toState: InventoryState
): Promise<StageEffectResult> {
  if (fromState === toState) return { cogsDelta: 0, warehouse: null };

  const db = getDb();
  let cogsDelta = 0;
  let warehouse: { warehouseId: string; warehouseName: string } | null = null;

  for (const item of lineItems) {
    if (!item.sku || !item.quantity) continue;

    let reservedDelta = 0;
    let onHandDelta = 0;
    if (fromState === 'reserved') reservedDelta -= item.quantity;
    if (fromState === 'consumed') onHandDelta += item.quantity;
    if (toState === 'reserved') reservedDelta += item.quantity;
    if (toState === 'consumed') onHandDelta -= item.quantity;
    if (reservedDelta === 0 && onHandDelta === 0) continue;

    const candidates = await db.collection('inventoryLevels').find({ tenantId, sku: item.sku }).toArray();
    if (candidates.length === 0) continue; // this SKU isn't tracked in the ledger — nothing to adjust
    const variantMatches = item.variant ? candidates.filter((c) => c.variantLabel && c.variantLabel.toLowerCase() === item.variant!.toLowerCase()) : [];
    const pool = variantMatches.length > 0 ? variantMatches : candidates;
    // Ranked by truly-free stock (on hand minus what other orders already hold), not raw on-hand —
    // a location with a big on-hand number that's mostly already reserved for other orders isn't
    // actually the best place to source this one from.
    const level = [...pool].sort((a, b) => b.onHand - b.reserved - (a.onHand - a.reserved))[0];
    if (!warehouse) warehouse = { warehouseId: level.warehouseId, warehouseName: level.warehouseName };

    const now = new Date();
    const newReserved = Math.max(0, level.reserved + reservedDelta);
    const newOnHand = Math.max(0, level.onHand + onHandDelta);
    const actualOnHandDelta = newOnHand - level.onHand; // may differ from onHandDelta if clamped at 0
    await db.collection('inventoryLevels').updateOne({ _id: level._id }, { $set: { reserved: newReserved, onHand: newOnHand, updatedAt: now } });
    maybeDispatchLowStock(tenantId, level as unknown as InventoryLevelSnapshot, newOnHand, newReserved);

    // inventoryMovements is an on-hand audit trail — a pure reserve/release never touches onHand,
    // so it isn't logged here; only actual consumption or a post-delivery return is.
    if (actualOnHandDelta !== 0) {
      const unitCost: number | null = level.unitCost ?? null;
      const valueDelta = unitCost != null ? actualOnHandDelta * unitCost : null;
      const cogsValue = actualOnHandDelta < 0 && unitCost != null ? Math.abs(actualOnHandDelta) * unitCost : null;
      if (unitCost != null) cogsDelta += -valueDelta!; // consuming (negative valueDelta) recognizes positive COGS, reversing does the opposite

      await db.collection('inventoryMovements').insertOne({
        tenantId,
        productId: level.productId ?? null,
        variantId: level.variantId ?? null,
        sku: item.sku,
        productTitle: level.productTitle ?? null,
        variantLabel: level.variantLabel ?? null,
        warehouseId: level.warehouseId,
        warehouseName: level.warehouseName,
        bin: level.bin,
        quantityBefore: level.onHand,
        quantityAfter: newOnHand,
        delta: actualOnHandDelta,
        quantity: Math.abs(actualOnHandDelta),
        unitCost,
        valueDelta,
        cogsValue,
        reason: actualOnHandDelta < 0 ? 'Order fulfilled' : 'Order returned',
        note: null,
        createdAt: now,
      });
    }
  }

  return { cogsDelta, warehouse };
}

// Stamps the order with the warehouse its stock was actually reserved/consumed from, the first
// (and only the first) time it leaves 'none' — that's the pickup point a courier's RTO will
// physically come back to, so once set this is never overwritten by a later stage change. Matched
// by whatever natural filter the caller already has on hand (an order may not have its _id in scope
// yet at upsert time), with `fulfillmentWarehouseId: null` in the filter itself doubling as the
// "don't overwrite" guard — Mongo's `{ field: null }` matches both an explicit null and a missing
// field, so this is safe against both a brand-new order and one seeded before this field existed.
export async function recordFulfillmentWarehouse(
  filter: Record<string, unknown>,
  fromState: InventoryState,
  warehouse: { warehouseId: string; warehouseName: string } | null
) {
  if (fromState !== 'none' || !warehouse) return;
  const db = getDb();
  await db.collection('orders').updateOne(
    { ...filter, fulfillmentWarehouseId: null },
    { $set: { fulfillmentWarehouseId: warehouse.warehouseId, fulfillmentWarehouseName: warehouse.warehouseName } }
  );
}

export interface StockShortfall {
  sku: string;
  productTitle: string | null;
  variantLabel: string | null;
  needed: number;
  free: number;
  // False only when the matching product's variant has continueSellingWhenOutOfStock explicitly
  // turned off — the default (true, or no matching product/variant found at all) always allows it.
  blocksConfirm: boolean;
}

export interface LineItemStockResolution {
  sku: string;
  productTitle: string | null;
  variantLabel: string | null;
  needed: number;
  free: number;
  inbound: number;
}

// Shared by checkStockForConfirm and checkFulfillmentReadiness below — the same "match by SKU,
// then disambiguate by variant label, take the best-stocked candidate" logic applyInventoryStageEffect
// itself uses to pick which location an order actually draws from. Keeping this in one place means
// "can this be confirmed," "can this be processed/shipped," and "what actually gets reserved" can
// never quietly disagree with each other. Returns null when the SKU isn't tracked at all (nothing to
// check) or the line item is empty.
export async function resolveLineItemStock(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  item: { sku: string | null; variant: string | null; quantity: number }
): Promise<LineItemStockResolution | null> {
  if (!item.sku || !item.quantity) return null;
  const candidates = await db.collection('inventoryLevels').find({ tenantId, sku: item.sku }).toArray();
  if (candidates.length === 0) return null;
  const variantMatches = item.variant ? candidates.filter((c) => c.variantLabel && c.variantLabel.toLowerCase() === item.variant!.toLowerCase()) : [];
  const pool = variantMatches.length > 0 ? variantMatches : candidates;
  const bestFree = Math.max(...pool.map((c) => c.onHand - c.reserved));
  const inbound = pool.reduce((sum, c) => sum + (c.inbound ?? 0), 0);
  return {
    sku: item.sku,
    productTitle: pool[0]?.productTitle ?? null,
    variantLabel: pool[0]?.variantLabel ?? null,
    needed: item.quantity,
    free: bestFree,
    inbound,
  };
}

// Runs right before a fresh reservation (fromState 'none' -> 'reserved', i.e. an order actually
// being confirmed for the first time) — checks whether the single best-stocked location can cover
// each line item, exactly matching what applyInventoryStageEffect's own selection logic above will
// actually do (this codebase reserves a whole line item from one location, it doesn't split a line
// across warehouses). A SKU with no inventoryLevels rows at all isn't under tracking, so it's
// always allowed through untouched.
export async function checkStockForConfirm(
  tenantId: string,
  lineItems: { sku: string | null; variant: string | null; quantity: number }[]
): Promise<StockShortfall[]> {
  const db = getDb();
  const shortfalls: StockShortfall[] = [];

  for (const item of lineItems) {
    const result = await resolveLineItemStock(db, tenantId, item);
    if (!result || result.free >= result.needed) continue;

    // Best-effort: find whichever product doc actually carries this SKU on one of its variants, to
    // read its oversell policy — order line items only ever carry a SKU string, not a stable
    // product/variant id, so this is the same SKU-matching approach the rest of the reservation
    // logic already relies on. Disambiguates by variant title the same way resolveLineItemStock
    // disambiguates by variantLabel — most multi-variant products here share one SKU across every
    // sibling variant, so matching by SKU alone would silently grab whichever variant happens to be
    // first in the array regardless of which one this order actually specifies.
    const product = await db.collection('products').findOne({ tenantId, 'variants.sku': item.sku });
    const variantsWithSku = (product?.variants ?? []).filter((v: any) => v.sku === item.sku);
    const variant = (item.variant && variantsWithSku.find((v: any) => v.title?.toLowerCase() === item.variant!.toLowerCase())) || variantsWithSku[0];
    const continueSelling = variant?.continueSellingWhenOutOfStock ?? true;

    shortfalls.push({
      sku: result.sku,
      productTitle: result.productTitle,
      variantLabel: result.variantLabel,
      needed: result.needed,
      free: Math.max(0, result.free),
      blocksConfirm: !continueSelling,
    });
  }

  return shortfalls;
}

export interface FulfillmentReadiness {
  ready: boolean;
  // Human-readable explanation of the first blocking line item found — null when ready. Only ever
  // meant for display (disabling a button, explaining why); the boolean is the actual gate.
  reason: string | null;
}

// 'RTO Initiated' and 'QC Pending' are where a failed delivery sits on its way back to the
// warehouse — see RESERVED_STAGES above. That stock isn't real onHand yet and never counts toward
// whether the fulfillment gate unlocks (only an actual "receive" action in Returns to process does
// that), but knowing it exists changes what staff should DO about a blocked order: chase a supplier,
// or just go check in a return that's already sitting there. Purely informational — this never
// feeds into the ready/not-ready decision itself, only the explanation shown alongside it.
const RETURN_IN_TRANSIT_STAGES: OrderStage[] = ['RTO Initiated', 'QC Pending'];

async function countReturnsInTransit(db: ReturnType<typeof getDb>, tenantId: string, sku: string, variantLabel: string | null): Promise<number> {
  const orders = await db
    .collection('orders')
    .find(
      {
        tenantId,
        'lineItems.sku': sku,
        $or: [{ stage: { $in: RETURN_IN_TRANSIT_STAGES } }, { stage: 'On Hold', heldFromStage: { $in: RETURN_IN_TRANSIT_STAGES } }],
      },
      { projection: { lineItems: 1 } }
    )
    .toArray();

  let quantity = 0;
  for (const order of orders) {
    for (const li of order.lineItems ?? []) {
      if (li.sku !== sku || !(li.quantity > 0)) continue;
      if (variantLabel && li.variant && li.variant.toLowerCase() !== variantLabel.toLowerCase()) continue;
      quantity += li.quantity;
    }
  }
  return quantity;
}

// Hard physical-stock gate for the two manual transitions that represent actually pulling stock off
// a shelf — Confirmed -> Processing ("Process order") and Processing -> Shipped ("Mark shipped").
// Unlike checkStockForConfirm, there's no oversell-policy escape hatch here: continueSellingWhenOutOfStock
// is a decision about whether to accept a backordered sale, not about whether stock has since
// physically appeared. By the time staff are trying to pick or hand off an order, the only question
// left is whether the units are actually there — that's a fact, not a policy.
export async function checkFulfillmentReadiness(
  tenantId: string,
  lineItems: { sku: string | null; variant: string | null; quantity: number }[]
): Promise<FulfillmentReadiness> {
  const db = getDb();

  for (const item of lineItems) {
    const result = await resolveLineItemStock(db, tenantId, item);
    if (!result || result.free >= result.needed) continue;

    const label = result.productTitle ?? result.sku;
    const free = Math.max(0, result.free);
    const shortBy = result.needed - free;
    const incomingNote = result.inbound > 0 ? `, ${result.inbound} incoming` : '';
    const returning = await countReturnsInTransit(db, tenantId, result.sku, result.variantLabel);
    const returnsNote =
      returning > 0
        ? ` ${returning} unit${returning === 1 ? '' : 's'} of this ${returning === 1 ? 'is' : 'are'} already on the way back from a return — check Returns to process instead of reordering.`
        : '';
    return {
      ready: false,
      reason: `Waiting on stock: ${label}${result.variantLabel ? ` (${result.variantLabel})` : ''} — ${shortBy} more unit${shortBy === 1 ? '' : 's'} needed (${free} free${incomingNote}).${returnsNote}`,
    };
  }

  return { ready: true, reason: null };
}
