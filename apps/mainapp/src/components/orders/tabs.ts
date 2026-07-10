import type { OrderTabKey } from '@zetsales/shared';

export const ORDER_TABS: { key: OrderTabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'priority', label: 'Priority calls' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Packing' },
  { key: 'shipped', label: 'In transit' },
  { key: 'returning', label: 'Returning' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'codDue', label: 'COD due' },
  { key: 'hold', label: 'On hold' },
  { key: 'cancelled', label: 'Cancelled' },
];
