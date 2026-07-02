import type { OrderDTO } from '@zetsales/shared';

// Orders that are already paid (bKash/Nagad/Rocket/Card, not plain COD) don't need a
// confirmation call just to verify payment — they're safe to bulk-confirm straight away.
export function isFastTrackEligible(order: OrderDTO): boolean {
  return order.stage === 'Pending' && (order.paymentStatus === 'Paid' || order.paymentStatus === 'Advance Paid');
}

export function fastTrackEligibleIds(orders: OrderDTO[]): string[] {
  return orders.filter(isFastTrackEligible).map((o) => o.id);
}
