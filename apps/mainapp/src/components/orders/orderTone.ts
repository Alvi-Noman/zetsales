import {
  Clock, Flag, PhoneCall, Package, Truck, Navigation, PackageCheck, PackageX, RotateCcw, Ban, PauseCircle,
  PackageSearch,
} from 'lucide-react';
import type { OrderPaymentStatus, OrderStage, PaymentMethod } from '@zetsales/shared';

export const STAGE_TONE: Record<OrderStage, string> = {
  Pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Flagged: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  Confirmed: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Processing: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  Shipped: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'Out for Delivery': 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  'RTO Initiated': 'bg-orange-50 text-orange-700 ring-orange-600/20',
  'QC Pending': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  'Partial Delivered': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  Returned: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  Cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  'On Hold': 'bg-orange-50 text-orange-700 ring-orange-600/20',
};

export const STAGE_ICON: Record<OrderStage, typeof Clock> = {
  Pending: Clock,
  Flagged: Flag,
  Confirmed: PhoneCall,
  Processing: Package,
  Shipped: Truck,
  'Out for Delivery': Navigation,
  'RTO Initiated': RotateCcw,
  'QC Pending': PackageSearch,
  Delivered: PackageCheck,
  'Partial Delivered': PackageX,
  Returned: RotateCcw,
  Cancelled: Ban,
  'On Hold': PauseCircle,
};

export const PAYMENT_METHOD_SHORT: Record<PaymentMethod, string> = {
  'Cash on Delivery': 'COD',
  bKash: 'bKash',
  Nagad: 'Nagad',
  Rocket: 'Rocket',
  Card: 'Card',
  Other: 'Other',
};

export const PAYMENT_TONE: Record<OrderPaymentStatus, string> = {
  'COD Pending': 'bg-amber-50 text-amber-700 ring-amber-600/20',
  'Advance Paid': 'bg-sky-50 text-sky-700 ring-sky-600/20',
  Paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Collected: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  Refunded: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  Failed: 'bg-rose-50 text-rose-700 ring-rose-600/20',
};
