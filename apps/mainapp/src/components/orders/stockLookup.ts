import type { InventoryLevelDTO } from '../../lib/commerceApi';
import type { OrderDTO, OrderLineItemDTO } from '@zetsales/shared';

// Free stock at whichever single warehouse has the most of a SKU — not summed across every
// warehouse. Reservation only ever pulls from one location (see inventoryEffects.ts on the
// backend, which ranks candidates the same way), so a SKU split 24 at Dhaka + 15 at Chittagong can
// only actually cover an order up to 24 in one shot, not 39. Summing would show "in stock" for an
// order this app is about to flag as out of stock — this has to match what confirming will really
// do, or the badge lies. A SKU with no inventoryLevels rows at all isn't under tracking, so it has
// no stock concept — distinct from a tracked SKU that's genuinely down to zero everywhere.
export interface StockLookup {
  freeBySku: Record<string, number>;
  trackedSkus: Set<string>;
}

export function buildStockLookup(levels: InventoryLevelDTO[]): StockLookup {
  const freeBySku: Record<string, number> = {};
  const trackedSkus = new Set<string>();
  for (const level of levels) {
    if (!level.sku) continue;
    trackedSkus.add(level.sku);
    const free = Math.max(0, level.onHand - level.reserved);
    freeBySku[level.sku] = Math.max(freeBySku[level.sku] ?? 0, free);
  }
  return { freeBySku, trackedSkus };
}

// Null means "not tracked" (no stock concept to show) — distinct from 0 (tracked, genuinely out).
export function resolveFreeStock(lookup: StockLookup | undefined, sku: string | null): number | null {
  if (!sku || !lookup || !lookup.trackedSkus.has(sku)) return null;
  return lookup.freeBySku[sku] ?? 0;
}

export interface OrderStockSummary {
  readyCount: number;
  shortCount: number;
  shortItems: { title: string; free: number; quantity: number }[];
}

// Per line item, atomic: a tracked SKU with enough free stock to cover the whole quantity counts as
// ready, anything short of that (including a SKU with zero free stock) counts as short — no partial
// credit for a line item that's only half-covered. An untracked SKU (no stock concept at all) is
// treated as ready, same as `resolveFreeStock` treats "not tracked" as nothing to flag.
export function summarizeOrderStock(lineItems: OrderLineItemDTO[], lookup: StockLookup | undefined): OrderStockSummary {
  const summary: OrderStockSummary = { readyCount: 0, shortCount: 0, shortItems: [] };
  for (const item of lineItems) {
    const free = resolveFreeStock(lookup, item.sku);
    if (free !== null && free < item.quantity) {
      summary.shortCount += 1;
      summary.shortItems.push({ title: item.title, free, quantity: item.quantity });
    } else {
      summary.readyCount += 1;
    }
  }
  return summary;
}

// Mixed = some line items ready, some short — the one case where a plain "Confirm"/bulk-confirm is
// ambiguous and must go through the split flow instead. Not mixed if every item is ready (normal
// confirm) or every item is short (handled by the existing oversell/Flagged policy, not a split).
export function isOrderMixedStock(lineItems: OrderLineItemDTO[], lookup: StockLookup | undefined): boolean {
  if (!lookup) return false;
  const { readyCount, shortCount } = summarizeOrderStock(lineItems, lookup);
  return readyCount > 0 && shortCount > 0;
}

export interface OrderStockClassification {
  ready: OrderDTO[];
  mixed: OrderDTO[];
  fullyShort: OrderDTO[];
}

// Shared by the bulk-confirm and bulk-send-to-packing stock-check popups — same three buckets
// either way: nothing to decide (ready), needs a split-or-skip decision (mixed), or nothing to
// split so it's confirm-anyway-or-skip / always-skip (fullyShort). No lookup means nothing can be
// classified as short — everything reads as ready rather than blocking on missing data.
export function classifyOrdersByStock(orders: OrderDTO[], lookup: StockLookup | undefined): OrderStockClassification {
  const result: OrderStockClassification = { ready: [], mixed: [], fullyShort: [] };
  for (const order of orders) {
    if (!lookup) {
      result.ready.push(order);
      continue;
    }
    const { readyCount, shortCount } = summarizeOrderStock(order.lineItems, lookup);
    if (shortCount === 0) result.ready.push(order);
    else if (readyCount === 0) result.fullyShort.push(order);
    else result.mixed.push(order);
  }
  return result;
}
