export interface UserDTO {
  id: string;
  email: string;
  isVerified: boolean;
  tenantId: string | null;
  isOnboarded: boolean;
  businessName: string | null;
}

export type BusinessType =
  | 'Fashion & Apparel'
  | 'Electronics'
  | 'Beauty & Cosmetics'
  | 'Home & Living'
  | 'Grocery & Food'
  | 'Other';

export type SalesChannel = 'Facebook' | 'Instagram' | 'WhatsApp' | 'Website' | 'Physical Store';

export interface OnboardingPayload {
  businessName: string;
  businessType: BusinessType;
  phone: string;
  channels: SalesChannel[];
  monthlyOrders: string;
  teamSize: string;
}

export interface BusinessDTO {
  id: string;
  name: string;
  businessType: BusinessType;
  phone: string;
  channels: SalesChannel[];
  monthlyOrders: string;
  teamSize: string;
  currency: string;
}

export type StorePlatform = 'shopify' | 'woocommerce';
export type StoreStatus = 'connected' | 'error' | 'pending';
export type StoreConnectionMethod = 'oauth' | 'token' | 'keys';

export interface StoreDTO {
  id: string;
  platform: StorePlatform;
  displayName: string;
  shopDomain: string;
  status: StoreStatus;
  connectionMethod: StoreConnectionMethod;
  lastSyncedAt: string | null;
  productCount: number;
  orderCount: number;
  createdAt: string;
}

export interface ProductVariantDTO {
  id: string;
  sku: string | null;
  title: string;
  price: number;
  inventory: number | null;
}

export interface ProductDTO {
  id: string;
  storeId: string;
  externalId: string;
  title: string;
  image: string | null;
  variants: ProductVariantDTO[];
  updatedAt: string;
  groupId: string | null;
}

export interface ProductPushResultDTO {
  storeId: string;
  displayName: string;
  platform: StorePlatform;
  success: boolean;
  error?: string;
  productId?: string;
}

export type OrderStage =
  | 'Pending'
  | 'Flagged'
  | 'Confirmed'
  | 'Processing'
  | 'Shipped'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Partial Delivered'
  | 'Returned'
  | 'Cancelled'
  | 'On Hold';
export type OrderPaymentStatus = 'COD Pending' | 'Advance Paid' | 'Paid' | 'Collected' | 'Refunded' | 'Failed';

export type HoldReason =
  | 'Payment verification pending'
  | 'Address needs confirmation'
  | 'Stock check needed'
  | 'Customer requested reschedule'
  | 'Awaiting customer response'
  | 'Other';

export type CancelReason =
  | 'Customer unreachable'
  | 'Customer changed mind'
  | 'Duplicate order'
  | 'Out of stock'
  | 'Fraud suspected'
  | 'Wrong address'
  | 'Price/payment dispute'
  | 'Other';

export type RiskLabel = 'Trusted' | 'Normal' | 'Risky' | 'New Customer';
export type PaymentMethod = 'Cash on Delivery' | 'bKash' | 'Nagad' | 'Rocket' | 'Card' | 'Other';

export interface OrderRiskDTO {
  label: RiskLabel;
  totalOrders: number;
  deliveredCount: number;
  cancelledOrReturnedCount: number;
  successRate: number | null;
}

export interface OrderLineItemDTO {
  title: string;
  variant: string | null;
  quantity: number;
  price: number;
  sku: string | null;
  image: string | null;
}

export interface OrderTimelineEventDTO {
  label: string;
  detail: string;
  at: string;
}

export interface OrderDTO {
  id: string;
  storeId: string;
  platform: StorePlatform;
  externalId: string;
  number: string;
  stage: OrderStage;
  heldFromStage: OrderStage | null;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  shippingFee: number;
  total: number;
  currency: string;
  tags: string[];
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string | null;
  lineItems: OrderLineItemDTO[];
  holdReason: HoldReason | null;
  cancelReason: CancelReason | null;
  flagReason: string | null;
  note: string | null;
  courierPartner: string | null;
  courierTrackingId: string | null;
  deliveryZone: string | null;
  callAttempts: number;
  history: OrderTimelineEventDTO[];
  createdAt: string;
  updatedAt: string;
}

export type OrderTabKey = 'all' | 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'codDue' | 'hold' | 'cancelled';

export interface OrderDailyStatDTO {
  date: string;
  count: number;
}

export interface OrderStatsDTO {
  totalOrders: number;
  totalOrdersTrend: number | null;
  totalRevenue: number;
  totalRevenueTrend: number | null;
  pendingTrend: number | null;
  confirmedTrend: number | null;
  oldestPendingMinutes: number | null;
  processingTrend: number | null;
  deliveredTrend: number | null;
  rtoOrders: number;
  rtoTrend: number | null;
  cancelledOrders: number;
  cancelledTrend: number | null;
  codOutstanding: number;
  tabCounts: Record<OrderTabKey, number>;
  dailySeries: OrderDailyStatDTO[];
}

export type TrendGranularity = 'hour' | 'day' | 'month';

export interface TrendPointDTO {
  index: number;
  label: string;
  date: string;
  totalOrders: number;
  totalRevenue: number;
  pending: number;
  confirmed: number;
  processing: number;
  delivered: number;
  cancelled: number;
}

export interface TrendSeriesDTO {
  from: string;
  to: string;
  points: TrendPointDTO[];
}

export interface OrderTrendsDTO {
  granularity: TrendGranularity;
  current: TrendSeriesDTO;
  comparison: TrendSeriesDTO;
}

export interface BulkOrderResultDTO {
  orderId: string;
  success: boolean;
  error?: string;
}
