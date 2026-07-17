import type { OrderStage } from '@zetsales/shared';
import logger from '../utils/logger.js';

// Best-effort mapping from each courier's own status vocabulary to ZetSales's OrderStage. The
// original vocab here was built from published API docs before any live webhook had been seen, and
// undershot what real orders on file actually carry in `courierStatus` — a whole family of
// return-flow statuses (returned, return_in_transit, returning, returned_to_hub, return_dispute)
// plus qc_pending and, for Steadfast, in_transit were all previously unrecognized, which meant an
// order sitting in Ready for Pickup/Shipped/Out for Delivery with one of those statuses never
// auto-restaged and just sat there until a human noticed. Expanded 2026-07-13 against the raw values found on existing
// orders — still worth re-checking against a real live webhook payload once sandbox credentials
// exist, per the original caveat.
//
// Deliberately conservative: an unrecognized status returns null (no stage change) rather than a
// best guess — a missed automatic update just means the order sits until a human or a later
// webhook resolves it, which is far safer than silently moving stock on a misread status.

const STEADFAST_STATUS_MAP: Record<string, OrderStage> = {
  // 'pending'/'in_review' mean the consignment is created but not yet physically collected —
  // that's Ready for Pickup, not Shipped (which now means "handed to the courier").
  pending: 'Ready for Pickup',
  in_review: 'Ready for Pickup',
  in_transit: 'Out for Delivery',
  delivered: 'Delivered',
  partial_delivered: 'Partial Delivered',
  partial_return: 'Partial Delivered',
  returned: 'Returned',
  return_in_transit: 'RTO Initiated',
  cancelled: 'RTO Initiated',
  qc_pending: 'QC Pending',
  hold: 'On Hold',
};

export function mapSteadfastStatus(rawStatus: string): OrderStage | null {
  const stage = STEADFAST_STATUS_MAP[rawStatus.trim().toLowerCase()];
  if (!stage) logger.warn(`[steadfast] unrecognized status "${rawStatus}" — no stage change applied`);
  return stage ?? null;
}

const PATHAO_STATUS_MAP: Record<string, OrderStage> = {
  // 'pending'/'pickup_requested'/'assigned_for_pickup' mean the parcel is still queued for
  // collection (Ready for Pickup); 'picked' is the moment the rider actually takes it (Shipped).
  pending: 'Ready for Pickup',
  pickup_requested: 'Ready for Pickup',
  assigned_for_pickup: 'Ready for Pickup',
  picked: 'Shipped',
  in_transit: 'Out for Delivery',
  delivered: 'Delivered',
  partial_delivery: 'Partial Delivered',
  partial_returned: 'Partial Delivered',
  return: 'RTO Initiated',
  returning: 'RTO Initiated',
  returned_to_hub: 'RTO Initiated',
  return_in_transit: 'RTO Initiated',
  returned: 'Returned',
  cancelled: 'RTO Initiated',
  hold: 'On Hold',
  exchange: 'RTO Initiated',
  return_dispute: 'On Hold',
  qc_pending: 'QC Pending',
};

export function mapPathaoStatus(rawStatus: string): OrderStage | null {
  const normalized = rawStatus.trim().toLowerCase().replace(/\s+/g, '_');
  const stage = PATHAO_STATUS_MAP[normalized];
  if (!stage) logger.warn(`[pathao] unrecognized status "${rawStatus}" — no stage change applied`);
  return stage ?? null;
}
