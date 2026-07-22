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
  line_items: { id: number; title: string; variant_id?: number | null; variant_title?: string | null; quantity: number; price: string; sku: string | null }[];
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
  // WooCommerce's `date_created` is in the store's local timezone, not UTC — parsing it directly
  // with `new Date()` silently mis-shifts it by the site's UTC offset. `date_created_gmt` is the
  // true UTC equivalent WooCommerce also includes on every order; prefer it when present.
  date_created_gmt?: string;
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

// A Woo order still at one of these statuses the very first time we see it never had a successful
// payment — WooCommerce moves COD orders straight to 'processing' on placement (see isWooCod
// below), so a *new* order sitting at pending/on-hold/failed/cancelled is really an incomplete
// checkout, not a real order awaiting confirmation. Only checked against brand-new orders (see
// upsertWooOrder) — an already-tracked order later cancelled by staff or in Woo admin is untouched.
export const WOO_INCOMPLETE_STATUSES = ['pending', 'on-hold', 'failed', 'cancelled'] as const;

// WooCommerce has no dedicated "abandoned cart" webhook — an incomplete order is the closest signal
// it offers, so the same WooOrderWebhook shape doubles as the abandoned-checkout payload.
export interface ShopifyCheckoutWebhook {
  id: number;
  token: string;
  email: string | null;
  phone: string | null;
  total_price: string;
  currency: string;
  created_at: string;
  // Set once the customer actually completes the checkout — a webhook delivery with this present
  // means "recovered," not "still abandoned" (see upsertShopifyAbandonedCheckout).
  completed_at: string | null;
  // The only way to point a customer back at their unfinished cart — WooCommerce has no equivalent.
  abandoned_checkout_url: string | null;
  line_items: { title: string; variant_id?: number | null; variant_title?: string | null; quantity: number; price: string; sku: string | null }[];
  customer?: { first_name?: string; last_name?: string; email?: string; phone?: string } | null;
  billing_address?: { phone?: string; address1?: string; city?: string } | null;
}

export function shopifyCheckoutAddress(checkout: ShopifyCheckoutWebhook): string | null {
  return formatAddress([checkout.billing_address?.address1, checkout.billing_address?.city]);
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

// WooCommerce sets 'processing' immediately on placement for Cash on Delivery orders — COD has no
// separate payment-confirmation step, so it never passes through 'pending' the way an
// online-gateway order does. Without this check, every COD order (the majority of orders for a
// COD-oriented business) would skip straight past the confirmation-call stage new orders are
// meant to sit in, landing directly in "Packing" like an order that's already been confirmed.
function isWooCod(order: WooOrderWebhook): boolean {
  return normalizePaymentMethod(order.payment_method_title) === 'Cash on Delivery';
}

export function mapWooOrderStage(order: WooOrderWebhook): MappedStage {
  switch (order.status) {
    case 'on-hold':
      return 'On Hold';
    case 'processing':
      return isWooCod(order) ? 'Pending' : 'Processing';
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
      return isWooCod(order) ? 'COD Pending' : 'Paid';
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
