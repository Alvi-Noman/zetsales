import type { CancelReason, HoldReason, OrderDTO, OrderStage } from '@zetsales/shared';

export const ALL_HOLD_REASONS: HoldReason[] = [
  'Payment verification pending',
  'Address needs confirmation',
  'Stock check needed',
  'Customer requested reschedule',
  'Awaiting customer response',
  'Other',
];

export const ALL_CANCEL_REASONS: CancelReason[] = [
  'Customer unreachable',
  'Customer changed mind',
  'Duplicate order',
  'Out of stock',
  'Fraud suspected',
  'Wrong address',
  'Price/payment dispute',
  'Other',
];

const TERMINAL_STAGES: OrderStage[] = ['Delivered', 'Cancelled', 'Returned'];

export function canHold(stage: OrderStage): boolean {
  return !TERMINAL_STAGES.includes(stage) && stage !== 'On Hold';
}

export function canCancel(stage: OrderStage): boolean {
  return !TERMINAL_STAGES.includes(stage);
}

// A sensible starting guess for why an order is being cancelled, based on what's already on
// record — the seller can always pick something else, this just saves a click in the common case.
export function inferCancelReason(order: OrderDTO): CancelReason {
  if (order.stage === 'Flagged') return 'Fraud suspected';
  if (order.holdReason === 'Address needs confirmation') return 'Wrong address';
  if (order.holdReason === 'Payment verification pending') return 'Price/payment dispute';
  if (order.callAttempts >= 3) return 'Customer unreachable';
  return 'Other';
}
