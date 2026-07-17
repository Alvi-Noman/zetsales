import { PhoneCall, Package, Truck, Navigation, PackageCheck, RotateCcw } from 'lucide-react';
import type { OrderStage } from '@zetsales/shared';

// The "normal path" a COD order walks through, left to right, for the stepper visual. Exception
// stages (Flagged, On Hold, Returned, Partial Delivered, Cancelled) aren't steps on this line —
// they're handled as banners/overrides on top of wherever the order actually is.
export const STAGE_ORDER: OrderStage[] = ['Pending', 'Confirmed', 'Processing', 'Ready for Pickup', 'Shipped', 'Out for Delivery', 'Delivered'];

export interface StageAction {
  label: string;
  icon: typeof PhoneCall;
  nextStage: OrderStage;
}

// The single "move it forward" action for each stage — what a seller would click next in a
// normal COD flow. Hold/Cancel are separate, always-available side actions handled elsewhere.
// Terminal stages (Delivered, Cancelled, Returned) have no forward action. RTO Initiated and QC
// Pending deliberately have no order-team action here — moving a package out of those two stages
// is inventory's job (see the Inventory page's Returns queue), not order management's, and once a
// courier integration is live those two transitions are driven automatically by webhook anyway.
// Shipped -> Out for Delivery likewise has no manual action here on purpose: that transition is
// reported by the courier's own webhook once it's actually moving the parcel, not clicked by staff.
export const NEXT_ACTION: Partial<Record<OrderStage, StageAction>> = {
  Pending: { label: 'Confirm order', icon: PhoneCall, nextStage: 'Confirmed' },
  Flagged: { label: 'Clear flag & confirm', icon: PhoneCall, nextStage: 'Confirmed' },
  Confirmed: { label: 'Send to packing', icon: Package, nextStage: 'Processing' },
  Processing: { label: 'Mark ready for pickup', icon: Truck, nextStage: 'Ready for Pickup' },
  'Ready for Pickup': { label: 'Hand over to courier', icon: Truck, nextStage: 'Shipped' },
  'Out for Delivery': { label: 'Mark delivered', icon: PackageCheck, nextStage: 'Delivered' },
};

// "Partial" isn't listed here — unlike the others, it can't be a single stage transition, since it
// needs a real kept/returned split per line item first. See PartialDeliverModal + the dedicated
// "Partial" button rendered alongside these in OrderDetailDrawer.
export const SECONDARY_ACTIONS: Partial<Record<OrderStage, StageAction[]>> = {
  'Out for Delivery': [{ label: 'Delivery failed', icon: RotateCcw, nextStage: 'RTO Initiated' }],
};

// A packing slip only makes sense once an order has actually reached packing — printing one for a
// still-Confirmed order shows bins nobody has picked yet, and used to double as an accidental way
// to *start* packing (see PrintOrderModal's old "Print & send to packing" button). Packing slips
// are now purely a re-print of work already underway, so they're gated on having left Confirmed.
export function canPrintPackingSlip(stage: OrderStage): boolean {
  return stage !== 'Pending' && stage !== 'Flagged' && stage !== 'Confirmed';
}
