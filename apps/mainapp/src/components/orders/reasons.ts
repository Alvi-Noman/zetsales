import type { CallOutcome, CancelReason, HoldReason, OrderDTO, OrderStage } from '@zetsales/shared';

// Shown in the "Log call" outcome picker — matches CallOutcome exactly so what an agent logs is
// exactly what powers Call outcomes, Confirmation performance, and the Call Center dashboard.
export const CALL_OUTCOMES: CallOutcome[] = ['Confirmed', 'Rescheduled', 'Customer Cancelled', 'No Answer', 'Wrong Number', 'Switched Off', 'Busy'];

// Before the confirmation call has happened — these are exactly the things you're verifying on
// that call, so they're also exactly why you'd hold instead of confirming outright.
export const PRE_CONFIRM_HOLD_REASONS: HoldReason[] = [
  'Payment verification pending',
  'Address needs confirmation',
  'Stock check needed',
  'Customer requested reschedule',
  'Awaiting customer response',
  'Other',
];

// Once confirmed, the problems that come up are internal (packing/fulfillment) or need looping the
// customer back in about something that changed after they already said yes — not the pre-order
// verification questions above, which are already settled by this point.
export const PACKING_HOLD_REASONS: HoldReason[] = [
  'Stock shortfall found',
  'Payment verification pending',
  'Awaiting customer response',
  'Customer requested reschedule',
  'Other',
];

// Once it's left the building, "stock check"/"stock shortfall" no longer means anything — the
// problems that come up now belong to the courier leg: reaching the customer, the address on the
// label, or the courier's own delay.
export const IN_TRANSIT_HOLD_REASONS: HoldReason[] = [
  'Customer unreachable for delivery',
  'Address unclear to courier',
  'Customer requested reschedule',
  'Courier delay',
  'Other',
];

// Once a package is on its way back (RTO Initiated/QC Pending), none of the above apply either —
// there's no "address to confirm" or "payment to verify" left to do. These are the reasons that
// actually come up on the return leg instead.
export const RETURN_LEG_HOLD_REASONS: HoldReason[] = [
  'Attempting redelivery',
  'Courier dispute',
  'Customer says they never refused it',
  'Other',
];

// The full enum, in a stable order — used where a hold reason needs to be picked without regard
// to the order's current stage, e.g. filtering the Orders list by "why is this held".
export const ALL_HOLD_REASONS: HoldReason[] = [
  'Payment verification pending',
  'Address needs confirmation',
  'Stock check needed',
  'Customer requested reschedule',
  'Awaiting customer response',
  'Stock shortfall found',
  'Customer unreachable for delivery',
  'Address unclear to courier',
  'Courier delay',
  'Attempting redelivery',
  'Courier dispute',
  'Customer says they never refused it',
  'Other',
];

const PACKING_STAGES: OrderStage[] = ['Confirmed', 'Processing', 'Ready for Pickup'];
const IN_TRANSIT_STAGES: OrderStage[] = ['Shipped', 'Out for Delivery'];
const RETURN_LEG_STAGES: OrderStage[] = ['RTO Initiated', 'QC Pending'];

export function holdReasonsFor(stage: OrderStage): HoldReason[] {
  if (PACKING_STAGES.includes(stage)) return PACKING_HOLD_REASONS;
  if (IN_TRANSIT_STAGES.includes(stage)) return IN_TRANSIT_HOLD_REASONS;
  if (RETURN_LEG_STAGES.includes(stage)) return RETURN_LEG_HOLD_REASONS;
  // Pending/Flagged, and anything else, default to the pre-confirm set — the widest, safest option.
  return PRE_CONFIRM_HOLD_REASONS;
}

// For a bulk selection that can span more than one stage at once — the union of whatever's
// relevant to any stage actually represented in the selection, so nothing offered is nonsensical
// for every order it'd apply to, but nothing relevant gets hidden either. Falls back to the
// pre-confirm set (the most common bulk-action tab) when the selection is empty.
export function holdReasonsForMany(stages: OrderStage[]): HoldReason[] {
  if (stages.length === 0) return PRE_CONFIRM_HOLD_REASONS;
  const groups = new Set(stages.map(holdReasonsFor));
  const seen = new Set<HoldReason>();
  const merged: HoldReason[] = [];
  for (const group of groups) {
    for (const reason of group) {
      if (reason === 'Other') continue;
      if (!seen.has(reason)) {
        seen.add(reason);
        merged.push(reason);
      }
    }
  }
  merged.push('Other');
  return merged;
}

export const ALL_CANCEL_REASONS: CancelReason[] = [
  'Customer unreachable',
  'Customer changed mind',
  'Duplicate order',
  'Out of stock',
  'Fraud suspected',
  'Spam',
  'Wrong address',
  'Price/payment dispute',
  'Other',
];

// Same full enum as ALL_CANCEL_REASONS plus 'Blocked customer' — that one reason is set
// automatically (see ordersController's blocked-customer auto-cancel) and deliberately left off the
// manual cancel-action dropdown above, but it's a real value worth filtering the Cancelled tab by.
export const CANCEL_REASONS_FOR_FILTER: CancelReason[] = [...ALL_CANCEL_REASONS.slice(0, -1), 'Blocked customer', 'Other'];

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
