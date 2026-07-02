import type { OrderTabKey } from '@zetsales/shared';

export const ORDER_TABS: { key: OrderTabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'processing', label: 'Processing' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'codDue', label: 'COD due' },
  { key: 'hold', label: 'On hold' },
  { key: 'cancelled', label: 'Cancelled' },
];
