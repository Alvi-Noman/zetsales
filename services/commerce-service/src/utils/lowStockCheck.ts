import { dispatchAppWebhook } from './appEvents.js';

export interface InventoryLevelSnapshot {
  productId?: string;
  variantId?: string;
  sku?: string | null;
  onHand?: number;
  reserved?: number;
  reorderPoint?: number | null;
}

// No low-stock hook existed anywhere before this — inventoryController.ts only evaluated
// avail <= reorderPoint at read time (for dashboard counts), never on write. Reuses that same
// predicate, called from every site that actually mutates onHand/reserved, and only dispatches
// on the crossing (was-above -> now-at-or-below) so a SKU that stays low doesn't fire a webhook
// on every subsequent order line.
export function isLowStockCrossing(before: InventoryLevelSnapshot, newOnHand: number, newReserved: number): boolean {
  if (before.reorderPoint == null) return false;
  const wasAvail = (before.onHand ?? 0) - (before.reserved ?? 0);
  const nowAvail = newOnHand - newReserved;
  return wasAvail > before.reorderPoint && nowAvail <= before.reorderPoint;
}

export function maybeDispatchLowStock(tenantId: string, level: InventoryLevelSnapshot, newOnHand: number, newReserved: number): void {
  if (!isLowStockCrossing(level, newOnHand, newReserved)) return;
  void dispatchAppWebhook(tenantId, 'inventory/low_stock', {
    productId: level.productId,
    variantId: level.variantId,
    sku: level.sku ?? null,
    onHand: newOnHand,
    reserved: newReserved,
    reorderPoint: level.reorderPoint,
  });
}
