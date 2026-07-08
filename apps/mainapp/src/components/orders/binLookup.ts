import type { InventoryLevelDTO } from '../../lib/commerceApi';

// Two-level lookup: prefer the bin for this exact (SKU, warehouse) pair — the warehouse an order's
// stock was actually reserved from — and only fall back to "any bin seen for this SKU" when the
// order has no recorded fulfillment warehouse yet (still Pending, or the SKU isn't tracked at that
// specific location). Matching by SKU alone would silently point staff at the wrong shelf for any
// SKU stocked in more than one warehouse with different bins.
export interface BinLookup {
  bySkuAndWarehouse: Record<string, string>;
  bySku: Record<string, string>;
}

export function buildBinLookup(levels: InventoryLevelDTO[]): BinLookup {
  const bySkuAndWarehouse: Record<string, string> = {};
  const bySku: Record<string, string> = {};
  for (const level of levels) {
    if (!level.sku) continue;
    const key = `${level.sku}::${level.warehouseId}`;
    if (!bySkuAndWarehouse[key]) bySkuAndWarehouse[key] = level.bin;
    if (!bySku[level.sku]) bySku[level.sku] = level.bin;
  }
  return { bySkuAndWarehouse, bySku };
}

export function resolveBin(lookup: BinLookup | undefined, sku: string | null, warehouseId: string | null): string {
  if (!sku || !lookup) return 'Unassigned';
  if (warehouseId) {
    const match = lookup.bySkuAndWarehouse[`${sku}::${warehouseId}`];
    if (match) return match;
  }
  return lookup.bySku[sku] ?? 'Unassigned';
}
