import type { InventoryLevelDTO } from '../../lib/commerceApi';

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
