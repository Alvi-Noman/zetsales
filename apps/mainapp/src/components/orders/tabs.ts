import type { OrderTabKey } from '@zetsales/shared';

// Ordered by how soon it needs a human, not by pipeline sequence — All/Priority/On hold/Pending
// are the ones staff actually check first every day (something needs a call or a decision right
// now), so they lead the row; the rest follow the normal fulfillment sequence after that.
export const ORDER_TABS: { key: OrderTabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'priority', label: 'Priority calls' },
  { key: 'pending', label: 'Pending' },
  { key: 'hold', label: 'On hold' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Packing' },
  { key: 'shipped', label: 'In transit' },
  { key: 'returning', label: 'Returning' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'codDue', label: 'COD due' },
  { key: 'cancelled', label: 'Cancelled' },
];
