import type { OrderClaimDTO } from '@zetsales/shared';
import type { OrderStage } from '@zetsales/shared';

// An agent's tab must heartbeat at least this often or the claim is treated as expired — kept well
// above the frontend's heartbeat interval so a couple of missed beats (a slow network tick) don't
// bounce someone off an order they're actively still on.
export const CLAIM_STALE_MS = 60_000;

const CALL_CLAIM_STAGES: OrderStage[] = ['Pending', 'Flagged', 'On Hold'];
const TERMINAL_STAGES: OrderStage[] = ['Delivered', 'Partial Delivered', 'Returned', 'Cancelled'];

export function shouldUseCallClaim(doc: { stage?: OrderStage; isPriorityCall?: boolean | null }): boolean {
  if (!doc.stage) return false;
  return CALL_CLAIM_STAGES.includes(doc.stage) || Boolean(doc.isPriorityCall && !TERMINAL_STAGES.includes(doc.stage));
}

// Self-expiring on read: a claim older than CLAIM_STALE_MS is reported as unclaimed without needing
// a cron sweep to clear it — the next agent who opens the order can simply claim over it.
export function resolveActiveClaim(doc: any): {
  claimedBy: OrderClaimDTO;
  claimedAt: string | null;
} {
  if (!doc.claimedBy || !doc.claimedAt) return { claimedBy: null, claimedAt: null };
  const claimedAt = new Date(doc.claimedAt);
  if (Date.now() - claimedAt.getTime() > CLAIM_STALE_MS) return { claimedBy: null, claimedAt: null };
  return { claimedBy: doc.claimedBy, claimedAt: claimedAt.toISOString() };
}
