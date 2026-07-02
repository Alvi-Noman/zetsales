// Translates each platform's own status vocabulary into our internal COD-oriented pipeline.
// This is necessarily a best-effort approximation — Shopify/WooCommerce don't have concepts like
// "confirmation call" or "courier handover", so several of our stages (Flagged, Confirmed as a
// distinct step from payment, Out for Delivery) can't be derived from their webhooks alone. This
// mapping gets an order onto the right *general* point in the pipeline; a human (or a courier
// webhook, once wired up) refines it from there using the same tools as any other order.

export type MappedStage =
  | 'Pending' | 'Confirmed' | 'Processing' | 'Shipped' | 'Delivered' | 'Returned' | 'Cancelled' | 'On Hold';
export type MappedPaymentStatus = 'COD Pending' | 'Advance Paid' | 'Paid' | 'Collected' | 'Refunded' | 'Failed';
export type MappedPaymentMethod = 'Cash on Delivery' | 'bKash' | 'Nagad' | 'Rocket' | 'Card' | 'Other';

export function normalizePaymentMethod(raw: string | null | undefined): MappedPaymentMethod {
  const s = (raw || '').toLowerCase();
  if (s.includes('cod') || s.includes('cash on delivery') || s.includes('cash_on_delivery')) return 'Cash on Delivery';
  if (s.includes('bkash')) return 'bKash';
  if (s.includes('nagad')) return 'Nagad';
  if (s.includes('rocket')) return 'Rocket';
  if (s.includes('card') || s.includes('shopify_payments') || s.includes('stripe') || s.includes('visa') || s.includes('mastercard')) return 'Card';
  return 'Other';
}

function formatAddress(parts: (string | null | undefined)[]): string | null {
  const joined = parts.filter(Boolean).join(', ');
  return joined || null;
}

export interface ShopifyOrderWebhook {
  id: number;
  name: string;
  created_at: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  cancelled_at: string | null;
  total_price: string;
  subtotal_price?: string | null;
  total_shipping_price_set?: { shop_money?: { amount?: string } } | null;
  currency: string;
  tags?: string | null;
  payment_gateway_names?: string[] | null;
  customer?: { first_name?: string; last_name?: string; email?: string; phone?: string } | null;
  shipping_address?: { phone?: string; address1?: string; city?: string } | null;
  line_items: { id: number; title: string; variant_title?: string | null; quantity: number; price: string; sku: string | null }[];
}

export function mapShopifyOrderStage(order: ShopifyOrderWebhook): MappedStage {
  if (order.cancelled_at) return 'Cancelled';
  if (order.financial_status === 'refunded' || order.financial_status === 'partially_refunded') return 'Returned';
  if (order.fulfillment_status === 'fulfilled') return 'Shipped';
  if (order.fulfillment_status === 'partial') return 'Processing';
  if (order.financial_status === 'paid') return 'Confirmed';
  return 'Pending';
}

export function mapShopifyPaymentStatus(order: ShopifyOrderWebhook): MappedPaymentStatus {
  switch (order.financial_status) {
    case 'paid':
      return 'Paid';
    case 'partially_paid':
      return 'Advance Paid';
    case 'refunded':
    case 'partially_refunded':
      return 'Refunded';
    case 'voided':
      return 'Failed';
    default:
      return 'COD Pending';
  }
}

export interface WooOrderWebhook {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  shipping_total?: string | null;
  currency: string;
  payment_method_title?: string | null;
  billing?: { first_name?: string; last_name?: string; email?: string; phone?: string; address_1?: string; city?: string };
  line_items: { id: number; name: string; variation_id?: number; quantity: number; price: number; sku: string | null }[];
}

export function shopifyOrderAddress(order: ShopifyOrderWebhook): string | null {
  return formatAddress([order.shipping_address?.address1, order.shipping_address?.city]);
}

export function wooOrderAddress(order: WooOrderWebhook): string | null {
  return formatAddress([order.billing?.address_1, order.billing?.city]);
}

export function shopifyOrderSubtotal(order: ShopifyOrderWebhook): number {
  return Number(order.subtotal_price) || Number(order.total_price) || 0;
}

export function shopifyOrderShippingFee(order: ShopifyOrderWebhook): number {
  return Number(order.total_shipping_price_set?.shop_money?.amount) || 0;
}

export function wooOrderSubtotal(order: WooOrderWebhook): number {
  const shipping = Number(order.shipping_total) || 0;
  return Math.max(0, (Number(order.total) || 0) - shipping);
}

export function wooOrderShippingFee(order: WooOrderWebhook): number {
  return Number(order.shipping_total) || 0;
}

export function mapWooOrderStage(order: WooOrderWebhook): MappedStage {
  switch (order.status) {
    case 'on-hold':
      return 'On Hold';
    case 'processing':
      return 'Processing';
    case 'completed':
      return 'Delivered';
    case 'cancelled':
    case 'failed':
      return 'Cancelled';
    case 'refunded':
      return 'Returned';
    default:
      return 'Pending';
  }
}

export function mapWooPaymentStatus(order: WooOrderWebhook): MappedPaymentStatus {
  switch (order.status) {
    case 'processing':
    case 'completed':
      return 'Paid';
    case 'refunded':
      return 'Refunded';
    case 'cancelled':
    case 'failed':
      return 'Failed';
    default:
      return 'COD Pending';
  }
}
