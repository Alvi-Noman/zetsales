import { PhoneCall, Package, Truck, Navigation, PackageCheck, RotateCcw } from 'lucide-react';
import type { OrderStage } from '@zetsales/shared';

// The "normal path" a COD order walks through, left to right, for the stepper visual. Exception
// stages (Flagged, On Hold, Returned, Partial Delivered, Cancelled) aren't steps on this line —
// they're handled as banners/overrides on top of wherever the order actually is.
export const STAGE_ORDER: OrderStage[] = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];

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
export const NEXT_ACTION: Partial<Record<OrderStage, StageAction>> = {
  Pending: { label: 'Confirm order', icon: PhoneCall, nextStage: 'Confirmed' },
  Flagged: { label: 'Clear flag & confirm', icon: PhoneCall, nextStage: 'Confirmed' },
  Confirmed: { label: 'Process order', icon: Package, nextStage: 'Processing' },
  Processing: { label: 'Mark shipped', icon: Truck, nextStage: 'Shipped' },
  Shipped: { label: 'Mark out for delivery', icon: Truck, nextStage: 'Out for Delivery' },
  'Out for Delivery': { label: 'Mark delivered', icon: PackageCheck, nextStage: 'Delivered' },
};

// "Partial" isn't listed here — unlike the others, it can't be a single stage transition, since it
// needs a real kept/returned split per line item first. See PartialDeliverModal + the dedicated
// "Partial" button rendered alongside these in OrderDetailDrawer.
export const SECONDARY_ACTIONS: Partial<Record<OrderStage, StageAction[]>> = {
  'Out for Delivery': [{ label: 'Delivery failed', icon: RotateCcw, nextStage: 'RTO Initiated' }],
};
