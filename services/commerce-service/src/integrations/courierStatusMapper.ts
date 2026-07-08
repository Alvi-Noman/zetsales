import type { OrderStage } from '@zetsales/shared';
import logger from '../utils/logger.js';

// Best-effort mapping from each courier's own status vocabulary to ZetSales's OrderStage. Neither
// courier's exact webhook payload has been seen live yet (no sandbox credentials configured at the
// time this was written) — these are built from their published API docs, not a verified sample
// payload. Treat this as a starting point: once real webhooks start arriving, log the raw
// `courierStatus` value stored on the order (see applyCourierStatusUpdate) and correct any mapping
// that doesn't land on the right stage.
//
// Deliberately conservative: an unrecognized status returns null (no stage change) rather than a
// best guess — a missed automatic update just means the order sits until a human or a later
// webhook resolves it, which is far safer than silently moving stock on a misread status.

const STEADFAST_STATUS_MAP: Record<string, OrderStage> = {
  pending: 'Shipped',
  in_review: 'Shipped',
  delivered: 'Delivered',
  partial_delivered: 'Partial Delivered',
  cancelled: 'RTO Initiated',
  hold: 'On Hold',
};

export function mapSteadfastStatus(rawStatus: string): OrderStage | null {
  const stage = STEADFAST_STATUS_MAP[rawStatus.trim().toLowerCase()];
  if (!stage) logger.warn(`[steadfast] unrecognized status "${rawStatus}" — no stage change applied`);
  return stage ?? null;
}

const PATHAO_STATUS_MAP: Record<string, OrderStage> = {
  pending: 'Shipped',
  pickup_requested: 'Shipped',
  assigned_for_pickup: 'Shipped',
  picked: 'Shipped',
  in_transit: 'Out for Delivery',
  delivered: 'Delivered',
  partial_delivery: 'Partial Delivered',
  return: 'RTO Initiated',
  cancelled: 'RTO Initiated',
  hold: 'On Hold',
  exchange: 'RTO Initiated',
};

export function mapPathaoStatus(rawStatus: string): OrderStage | null {
  const normalized = rawStatus.trim().toLowerCase().replace(/\s+/g, '_');
  const stage = PATHAO_STATUS_MAP[normalized];
  if (!stage) logger.warn(`[pathao] unrecognized status "${rawStatus}" — no stage change applied`);
  return stage ?? null;
}
