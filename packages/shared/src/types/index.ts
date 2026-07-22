export interface UserDTO {
  id: string;
  email: string;
  isVerified: boolean;
  tenantId: string | null;
  isOnboarded: boolean;
  businessName: string | null;
  businessSlug: string | null;
  businessUrl: string | null;
  businessType: BusinessType | null;
  role: TeamRole | null;
  installedPlugins: ModuleKey[];
}

export type TeamRole = 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';

export const MODULE_KEYS = [
  'home',
  'orders',
  'dispatch',
  'products',
  'inventory',
  'returns',
  'preOrders',
  'printOut',
  'customers',
  'adPerformance',
  'customerService',
  'callCenter',
  'fraudChecker',
  'zetSalesAds',
  'supplyChain',
  'accounting',
  'analytics',
  'integrations',
  'team',
  'settings',
  'hrm',
] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

// The subset of modules that a tenant must explicitly "install" (see AppsPage /
// appsController) before they're usable at all — independent of and in addition to
// the role check below. Everything else is a "core" module: visible whenever the
// signed-in user's role permits it, no install step needed.
export const PLUGIN_MODULES: ModuleKey[] = ['fraudChecker', 'callCenter', 'adPerformance', 'customerService', 'zetSalesAds', 'hrm'];

// --- App platform (extension points + install flow) ---
// Two-tier model mirroring Shopify's own app platform: an "Embedded App" gets its own sidebar
// nav entry and full page; an "Admin Block Extension" injects a small piece of UI into an
// *existing* core page at one of these named extension targets (Shopify's own term for this
// concept, e.g. `admin.order-details.block.render`). `sidebarNav`/`settingsPath` are NOT
// extension targets — they're Embedded App page-registration fields on AppManifestDTO below.
export const APP_EXTENSION_TARGETS = [
  'admin.order-details.block',
  'admin.order-details.action',
  'admin.orders.index.row-badge',
  'admin.orders.index.bulk-action',
  'admin.products.index.row-badge',
  'admin.product-details.block',
  'admin.customers.index.row-badge',
  'admin.customer-details.block',
  'admin.home.block',
  'admin.analytics.block',
  'admin.topbar.block',
] as const;
export type AppExtensionTarget = (typeof APP_EXTENSION_TARGETS)[number];

// `embedded` = first-party code running in-process (all 4 official apps today). `oauth` = a
// standalone service installed via the real OAuth 2.0 authorization-code flow (see
// oauthController.ts) — no app uses this yet, but the mechanism works end-to-end so a future
// standalone service (or a genuine 3rd party) can install against it.
export type AppAuthType = 'embedded' | 'oauth';

export interface AppManifestDTO {
  key: ModuleKey;
  name: string;
  description: string;
  icon: string;
  authType: AppAuthType;
  // Which block-extension targets this app fills with real content — see APP_EXTENSION_TARGETS.
  extensions: AppExtensionTarget[];
  // Whether this app also gets its own sidebar nav entry + full page (the "Embedded App" tier).
  isEmbeddedApp: boolean;
  // Base URL of the standalone service — only set for oauth-type apps.
  homepageUrl?: string;
  sidebarLabel?: string;
  sidebarPath?: string;
  // A settings sub-page is just another page of the embedded app, not a block extension —
  // Shopify treats an app's settings screen the same way.
  settingsPath?: string;
  // OAuth 2.0 client_id — only set for oauth-type apps (see oauthController.ts / oauth_apps).
  clientId?: string;
}

export interface InstalledAppDTO {
  appKey: ModuleKey;
  status: 'installed' | 'revoked';
  installedAt: string;
}

// Outbound webhook topics, named in Shopify's own slash style — `orders/create`,
// `orders/updated`, `products/create`, `products/update` are literally identical to real
// Shopify topic names; the rest are ZetSales-specific concepts named to match that convention.
export const APP_WEBHOOK_TOPICS = [
  'orders/create',
  'orders/updated',
  'orders/confirmed',
  'orders/cancelled',
  'customers/blocked',
  'products/create',
  'products/update',
  'payments/collected',
  'inventory/low_stock',
] as const;
export type AppWebhookTopic = (typeof APP_WEBHOOK_TOPICS)[number];

export interface RoleDefinition {
  role: TeamRole;
  label: string;
  description: string;
  modules: ModuleKey[];
  canManageTeam: boolean;
  // false means mutating requests are blocked regardless of module access.
  canWrite: boolean;
  // Optional per-module write allowlist for roles that can write in some sections
  // but only view others.
  writableModules?: ModuleKey[];
}

export const ROLE_DEFINITIONS: Record<TeamRole, RoleDefinition> = {
  owner: {
    role: 'owner',
    label: 'Owner',
    description: 'Full access to everything, including billing and team management.',
    modules: [...MODULE_KEYS],
    canManageTeam: true,
    canWrite: true,
  },
  admin: {
    role: 'admin',
    label: 'Admin',
    description: 'Full operational access and can manage the team.',
    modules: [...MODULE_KEYS],
    canManageTeam: true,
    canWrite: true,
  },
  manager: {
    role: 'manager',
    label: 'Manager',
    description: 'Runs day-to-day operations, with finance visibility but no workspace administration.',
    modules: [
      'home',
      'orders',
      'dispatch',
      'printOut',
      'products',
      'inventory',
      'returns',
      'preOrders',
      'customers',
      'adPerformance',
      'customerService',
      'callCenter',
      'fraudChecker',
      'zetSalesAds',
      'supplyChain',
      'accounting',
      'analytics',
      'hrm',
    ],
    canManageTeam: false,
    canWrite: true,
    writableModules: [
      'orders',
      'dispatch',
      'printOut',
      'products',
      'inventory',
      'returns',
      'preOrders',
      'customers',
      'adPerformance',
      'customerService',
      'callCenter',
      'fraudChecker',
      'zetSalesAds',
      'supplyChain',
      'hrm',
    ],
  },
  agent: {
    role: 'agent',
    label: 'Order Agent',
    description: 'Works orders and calls, with read-only catalog and inventory access.',
    modules: ['home', 'orders', 'callCenter', 'printOut', 'products', 'inventory', 'customers'],
    canManageTeam: false,
    canWrite: true,
    writableModules: ['orders', 'callCenter', 'printOut', 'customers'],
  },
  viewer: {
    role: 'viewer',
    label: 'Viewer',
    description: 'Read-only access for operational oversight and reporting.',
    modules: [
      'home',
      'orders',
      'printOut',
      'products',
      'inventory',
      'returns',
      'preOrders',
      'customers',
      'supplyChain',
      'accounting',
      'analytics',
    ],
    canManageTeam: false,
    canWrite: false,
  },
};

export function canWriteModule(role: TeamRole | null | undefined, module: ModuleKey): boolean {
  const definition = role ? ROLE_DEFINITIONS[role] : ROLE_DEFINITIONS.owner;
  if (!definition.canWrite) return false;
  return definition.writableModules ? definition.writableModules.includes(module) : true;
}

export type TeamMemberStatus = 'active' | 'invited' | 'suspended';

export interface TeamMemberDTO {
  id: string;
  email: string;
  role: TeamRole;
  status: TeamMemberStatus;
  isYou: boolean;
  invitedAt: string;
  joinedAt: string | null;
}

export type TeamInviteStatus = 'pending' | 'revoked' | 'accepted';

export interface TeamInviteDTO {
  id: string;
  email: string;
  role: TeamRole;
  status: TeamInviteStatus;
  invitedByEmail: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  inviteLink: string;
}

export interface AcceptInvitePreviewDTO {
  email: string;
  role: TeamRole;
  businessName: string;
  valid: boolean;
  reason?: string;
}

export type BusinessType =
  | 'I manufacture my own products'
  | 'I import my products'
  | 'I buy from local wholesalers'
  | 'I dropship — I never hold stock';

export type SalesChannel = 'Facebook' | 'Instagram' | 'WhatsApp' | 'Website' | 'Physical Store';

export interface PreOrderTargetDTO {
  productId: string;
  variantId: string;
  targetQuantity: number;
  updatedAt: string;
}

export type PrintPaperSize = 'A4' | 'A5';

export interface InvoiceTemplateDTO {
  id: string;
  name: string;
  logoUrl: string | null;
  businessNameOverride: string | null;
  address: string | null;
  phone: string | null;
  paperSize: PrintPaperSize;
  showItemImages: boolean;
  showSkuVariant: boolean;
  showCustomerAddress: boolean;
  showPaymentBox: boolean;
  showDeliveryBox: boolean;
  showBarcode: boolean;
  showCodCallout: boolean;
  footerNote: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export const INVOICE_FONT_OPTIONS = ['Helvetica', 'Times New Roman', 'Georgia', 'Arial', 'Courier New'] as const;
export type InvoiceFont = (typeof INVOICE_FONT_OPTIONS)[number];

export interface BrandingSettingsDTO {
  logoUrl: string | null;
  invoiceFont: InvoiceFont | null;
}

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
  installedPlugins: ModuleKey[];
}

// The editable business-profile shape shown in Settings → General — a superset of the fields
// UserDTO exposes (which only has businessType, for role/plugin-gating purposes elsewhere), all of
// which are captured once at onboarding but weren't editable again anywhere until this settings
// redesign. currency/businessSlug/businessUrl are shown but not editable here — there's no
// multi-currency support anywhere in the system (every order/product hardcodes BDT), and changing
// a live subdomain has no supporting endpoint (it's baked into auth cookies, DNS, and every tenant
// URL elsewhere) — both would be fake controls with nothing real behind them.
export interface BusinessProfileDTO {
  id: string;
  name: string;
  businessType: BusinessType | null;
  phone: string | null;
  channels: SalesChannel[];
  monthlyOrders: string | null;
  teamSize: string | null;
  currency: string;
  businessSlug: string | null;
  businessUrl: string | null;
}

export interface SessionDTO {
  tokenId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  current: boolean;
}

export interface NotificationDTO {
  id: string;
  type: 'new_device_login';
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  meta: { userAgent: string | null; ip: string | null };
}

export type UpdateBusinessProfileInput = Partial<
  Pick<BusinessProfileDTO, 'name' | 'businessType' | 'phone' | 'channels' | 'monthlyOrders' | 'teamSize'>
>;

// 'csv' is a synthetic platform for the generic "CSV Import" bucket a tenant gets when they import
// orders not tied to any real storefront — see getOrCreateCsvImportStore in storesController.ts.
export type StorePlatform = 'shopify' | 'woocommerce' | 'csv';
export type StoreStatus = 'connected' | 'error' | 'pending';
export type StoreConnectionMethod = 'oauth' | 'token' | 'keys' | 'manual';

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

export type CourierProvider = 'steadfast' | 'pathao';
export type CourierStatus = 'connected' | 'error';
export type CourierZoneTier = 'inside' | 'outside' | 'suburb';
export type CourierSpeed = 'regular' | 'express';

export interface CourierAccountDTO {
  id: string;
  provider: CourierProvider;
  displayName: string;
  status: CourierStatus;
  // Fixed per-provider endpoint the merchant pastes into their courier panel's webhook settings —
  // account-level, not per-store, since one courier account ships parcels for every connected store.
  webhookUrl: string;
  // The shared secret the merchant also pastes into that same panel field, so the webhook handler
  // can tell which tenant's account a given incoming call belongs to (see couriersController.ts).
  webhookSecret: string;
  // Per-parcel delivery fee, by speed and zone tier — couriers don't expose a real per-shipment
  // charge via API, so this is a manually configured estimate mirroring the courier's own published
  // rate card. Cells are null until the merchant fills them in.
  deliveryRates: Record<CourierSpeed, Record<CourierZoneTier, number | null>>;
  // What the courier charges back when a parcel fails delivery and is returned — no speed dimension,
  // couriers price returns the same regardless of how the outbound leg was booked.
  returnRates: Record<CourierZoneTier, number | null>;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CourierSummaryDTO {
  id: string;
  provider: CourierProvider;
  displayName: string;
  status: CourierStatus;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CourierSettlementDTO {
  id: string;
  courierId: string;
  provider: CourierProvider;
  amount: number;
  settledAt: string;
  reference: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type CourierHandoverStatus = 'Pending' | 'Confirmed';

export interface EligibleHandoverOrderDTO {
  orderId: string;
  orderNumber: string;
  invoiceNo: string | null;
  customerName: string | null;
  consignmentId: string | null;
  itemCount: number;
  total: number;
  createdAt: string;
}

export interface CourierHandoverOrderRowDTO {
  orderId: string;
  orderNumber: string;
  invoiceNo: string | null;
  customerName: string | null;
  consignmentId: string | null;
  itemCount: number;
  total: number;
}

export interface CourierHandoverItemRowDTO {
  title: string;
  sku: string | null;
  image: string | null;
  quantity: number;
}

export interface CourierHandoverDTO {
  id: string;
  manifestNo: string;
  courierId: string;
  provider: CourierProvider;
  handoverDate: string;
  parcelCount: number;
  itemCount: number;
  totalCodAmount: number;
  status: CourierHandoverStatus;
  confirmedAt: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CourierHandoverDetailDTO extends CourierHandoverDTO {
  orders: CourierHandoverOrderRowDTO[];
  items: CourierHandoverItemRowDTO[];
}

export interface ProductOptionDTO {
  name: string;
  values: string[];
}

export interface ProductVariantDTO {
  id: string;
  sku: string | null;
  title: string;
  price: number;
  compareAtPrice: number | null;
  inventory: number | null;
  optionValues: string[];
  // What happens at confirm time once every warehouse is out of free stock for this variant. True
  // (the default) lets the order confirm normally — staff just see a stock warning in the order
  // drawer. False routes it to Flagged instead of Confirmed, so a human has to clear it by hand
  // before it can proceed.
  continueSellingWhenOutOfStock: boolean;
  // Distinct from the product's shared images[] gallery — e.g. a color variant's own swatch photo.
  image?: string | null;
}

export interface ProductDTO {
  id: string;
  storeId: string;
  externalId: string;
  title: string;
  description: string | null;
  category: string | null;
  images: string[];
  weight: number | null;
  weightUnit: ProductWeightUnit;
  sourceUrl: string | null;
  sourcePlatform: ProductSourcePlatform | null;
  options: ProductOptionDTO[];
  variants: ProductVariantDTO[];
  updatedAt: string;
  groupId: string | null;
}

export type ProductWeightUnit = 'kg' | 'g' | 'lb' | 'oz';
export type ProductSourcePlatform = 'alibaba' | 'manual' | 'shopify' | 'woocommerce';

export interface ProductVariantInputDTO {
  sku?: string;
  price: number;
  compareAtPrice?: number;
  optionValues: string[];
  continueSellingWhenOutOfStock?: boolean;
  image?: string | null;
  // Only meaningful on create — an explicit starting stock count entered in the Add Product form.
  initialQuantity?: number;
}

export interface ProductWritePayload {
  title: string;
  description?: string;
  category?: string;
  images: string[];
  weight?: number;
  weightUnit?: ProductWeightUnit;
  sourceUrl?: string;
  sourcePlatform?: ProductSourcePlatform;
  options: ProductOptionDTO[];
  variants: ProductVariantInputDTO[];
  // Where a variant's initialQuantity (above) lands — only used on create.
  warehouseId?: string;
  bin?: string;
}

export interface ProductPublishTargetDTO {
  storeId: string;
  collectionIds?: string[];
}

export interface ProductCollectionDTO {
  id: string;
  storeId: string;
  platform: StorePlatform;
  name: string;
  handle?: string | null;
}

export interface SupplierProductDraftDTO extends ProductWritePayload {
  sourcePlatform: 'alibaba';
  sourceUrl: string;
  supplierName?: string | null;
  rawPriceText?: string | null;
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
}

// One row in the Products list: products sharing a groupId across stores collapse into a single
// item here (see ProductDTO.groupId), so this carries aggregate stats and every member store
// instead of one store's variants.
export interface ProductListItemDTO {
  id: string;
  title: string;
  image: string | null;
  variantCount: number;
  priceMin: number;
  priceMax: number;
  totalStock: number;
  trackedInventoryCount: number;
  updatedAt: string;
  groupId: string | null;
  storeIds: string[];
  // The product's real storefront link (Shopify handle / WooCommerce permalink) — null until the
  // product's next sync after this field shipped. First store's URL when grouped across stores.
  url: string | null;
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
  | 'Ready for Pickup'
  | 'Shipped'
  | 'Out for Delivery'
  | 'RTO Initiated'
  | 'QC Pending'
  | 'Delivered'
  | 'Partial Delivered'
  | 'Returned'
  | 'Cancelled'
  | 'On Hold';
export type OrderPaymentStatus = 'COD Pending' | 'Advance Paid' | 'Paid' | 'Collected' | 'Refunded' | 'Failed';
export type CallOutcome = 'Confirmed' | 'Rescheduled' | 'Customer Cancelled' | 'No Answer' | 'Wrong Number' | 'Switched Off' | 'Busy';

export type HoldReason =
  | 'Payment needs verification'
  | 'Address needs confirmation'
  | 'Stock check needed'
  | 'Customer rescheduled call'
  | "Customer didn't respond"
  | 'Stock shortfall found'
  | 'Customer unreachable for delivery'
  | 'Address unclear to courier'
  | 'Courier delay'
  | 'Attempting redelivery'
  | 'Courier dispute'
  | 'Customer says they never refused it'
  | 'Other';

export type CancelReason =
  | 'Customer unreachable'
  | 'Customer changed mind'
  | 'Duplicate order'
  | 'Out of stock'
  | 'Fraud suspected'
  | 'Spam'
  | 'Wrong address'
  | 'Price/payment dispute'
  | 'Blocked customer'
  | 'Other';

export type RiskLabel = 'Trusted' | 'Normal' | 'Risky' | 'New Customer';
export type PaymentMethod = 'Cash on Delivery' | 'bKash' | 'Nagad' | 'Rocket' | 'Card' | 'Other';
export type CourierPartner = 'Steadfast' | 'Pathao';

// Cosmetic bucketing of order.courierStatus (raw courier webhook text) for the Delivery Partners
// dashboard only. Deliberately separate from courierStatusMapper.ts on the backend, which maps the
// same raw text into OrderStage to drive order pipeline restaging — that mapping is lossy (several
// distinct courier states collapse into one stage) and must never be reused for display, just as
// this bucketing must never be reused for restaging.
export const COURIER_STATUS_BUCKETS = [
  'awaiting_sync',
  'accepted',
  'picked',
  'in_transit',
  'delivered',
  'partial',
  'returned',
  'cancelled',
  'hold',
  'other',
] as const;
export type CourierStatusBucket = (typeof COURIER_STATUS_BUCKETS)[number];

export const COURIER_STATUS_BUCKET_LABEL: Record<CourierStatusBucket, string> = {
  awaiting_sync: 'Awaiting sync',
  accepted: 'Accepted',
  picked: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  partial: 'Partial delivery',
  returned: 'Returned',
  cancelled: 'Cancelled',
  hold: 'On hold',
  other: 'Other',
};

// Beyond the vocab courierStatusMapper.ts documents (itself admittedly unverified against live
// webhooks), real order data already on file uses a noticeably richer set of raw values — notably
// a whole family of return-flow statuses and qc_pending, plus in_transit for Steadfast too. Covered
// here so the dashboard doesn't dump most real shipments into the generic "other" bucket.
const STEADFAST_STATUS_BUCKETS: Record<string, CourierStatusBucket> = {
  pending: 'accepted',
  in_review: 'accepted',
  in_transit: 'in_transit',
  delivered: 'delivered',
  partial_delivered: 'partial',
  partial_return: 'partial',
  returned: 'returned',
  return_in_transit: 'returned',
  cancelled: 'cancelled',
  qc_pending: 'hold',
  hold: 'hold',
};

const PATHAO_STATUS_BUCKETS: Record<string, CourierStatusBucket> = {
  pending: 'accepted',
  pickup_requested: 'accepted',
  assigned_for_pickup: 'accepted',
  picked: 'picked',
  in_transit: 'in_transit',
  delivered: 'delivered',
  partial_delivery: 'partial',
  partial_returned: 'partial',
  return: 'returned',
  returning: 'returned',
  returned: 'returned',
  returned_to_hub: 'returned',
  return_in_transit: 'returned',
  cancelled: 'cancelled',
  exchange: 'returned',
  return_dispute: 'hold',
  qc_pending: 'hold',
  hold: 'hold',
};

// courierStatus === null means a courier is assigned but no webhook has landed yet.
export function bucketForCourierStatus(courierPartner: CourierPartner | null, courierStatus: string | null): CourierStatusBucket {
  if (!courierStatus) return 'awaiting_sync';
  const key = courierStatus.trim().toLowerCase().replace(/\s+/g, '_');
  const table = courierPartner === 'Steadfast' ? STEADFAST_STATUS_BUCKETS : courierPartner === 'Pathao' ? PATHAO_STATUS_BUCKETS : null;
  return table?.[key] ?? 'other';
}

export interface CourierShipmentStatsDTO {
  total: number;
  bucketCounts: Record<CourierStatusBucket, number>;
}

export interface OrderRiskDTO {
  label: RiskLabel;
  totalOrders: number;
  deliveredCount: number;
  cancelledOrReturnedCount: number;
  successRate: number | null;
  // Other still-active (not Cancelled/Returned) orders from this same phone number placed on the
  // same Asia/Dhaka calendar day as this one — the real-time half of duplicate detection, computed
  // fresh on every view rather than waiting for the retrospective analytics grouping to catch it.
  possibleDuplicateOrders: string[];
  // Same delivered/cancelled-or-returned split as above, just broken out per courier partner —
  // this tenant's own order history only, no external API or cross-tenant data. For riskScope=
  // courier, `stale` means this row came from courierFraudHistory (the last known result) because
  // a fresh live check failed, and `checkedAt` says how old it is. `unavailable` (riskScope=courier
  // only) means this specific courier's live check failed with no cached fallback either — distinct
  // from a real 0/0 result, so the UI can say "check failed" instead of silently omitting it.
  courierBreakdown: (
    | { courierPartner: CourierPartner; delivered: number; failed: number; stale?: boolean; checkedAt?: string; unavailable?: false }
    | { courierPartner: CourierPartner; unavailable: true }
  )[];
}

export interface OrderLineItemDTO {
  title: string;
  variant: string | null;
  quantity: number;
  price: number;
  sku: string | null;
  image: string | null;
  // The platform's own variant/variation id (Shopify variant_id, WooCommerce variation_id) — an
  // exact, unambiguous match key for image resolution when a line item has no SKU. Not set on
  // CSV-imported or manually-entered orders, which have no such platform identity to carry.
  variantId?: string | null;
}

export interface OrderTimelineEventDTO {
  label: string;
  detail: string;
  at: string;
  by?: string | null;
  // Structured counterpart to `detail`'s free-text "N × Product" — only set on 'Upsell added'
  // entries, so the upsell performance report can sum without parsing the display string.
  quantity?: number;
  amount?: number;
}

// Advisory lock so two call-center agents can't both dial the same order at once — set when an
// agent opens the order to work it, cleared on release/expiry. Not an authorization gate, just a
// "someone's already on this" signal (see resolveActiveClaim on the server, which self-expires it).
export type OrderClaimDTO = { userId: string; email: string } | null;

export interface OrderDTO {
  id: string;
  storeId: string;
  platform: StorePlatform;
  externalId: string;
  number: string;
  invoiceNo: string | null;
  invoiceIssuedAt: string | null;
  stage: OrderStage;
  heldFromStage: OrderStage | null;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: PaymentMethod;
  subtotal: number;
  shippingFee: number;
  discount: number;
  // Collected from the customer up front (e.g. a delivery-charge advance via bKash/Nagad) before
  // the courier ever delivers — money already in hand against `total`, which itself never changes
  // to account for it. Whatever shows the amount still owed (COD-to-collect, invoice, packing
  // slip) subtracts this; `total` alone always means "full order value."
  advanceAmount: number;
  total: number;
  currency: string;
  tags: string[];
  customerName: string | null;
  customerPhone: string | null;
  customerAltPhone: string | null;
  customerEmail: string | null;
  address: string | null;
  lineItems: OrderLineItemDTO[];
  holdReason: HoldReason | null;
  cancelReason: CancelReason | null;
  flagReason: string | null;
  // Set the moment this order confirms (Pending/Flagged -> Confirmed) while a line item was short
  // of free stock but oversell was allowed for that variant, so confirm went through anyway. Clears
  // the moment the order advances past Confirmed (see updateOrder). Distinguishes "this order was a
  // pre-order and just came back in stock" from "always had stock, just hasn't been packed yet" —
  // both look identical (Confirmed + currently in stock) without this breadcrumb.
  wasShortOfStock: boolean;
  // Set only on an order created by splitting a mixed-stock order at confirm time — points back at
  // the order it was split from. Null for every order that was never split off.
  splitFromOrderId: string | null;
  splitFromOrderNumber: string | null;
  // Set only on the original order once it's been split — points forward at the new order that was
  // spun off to hold the out-of-stock line items. Null if this order was never split.
  splitIntoOrderId: string | null;
  splitIntoOrderNumber: string | null;
  note: string | null;
  // Set only when holdReason is 'Customer rescheduled call' and a date/time was picked — the
  // structured instant a "Priority calls" queue can filter/sort on. `note` carries the same
  // information as human-readable text for display; this is the machine-comparable copy of it.
  rescheduledFor: string | null;
  // Manual override, independent of stage — a human decided this needs an outbound call regardless
  // of what the automatic priority signals (reschedule-due, multi-SKU) say. Auto-clears the same
  // way `note`/`rescheduledFor` do once the order's stage actually changes, so it can't go stale.
  isPriorityCall: boolean;
  priorityNote: string | null;
  // Derived from a lookup against the tenant's blocklist (by customerPhone), not stored on the order
  // itself — blocking is a customer-level fact, not an order field, since it has to be checkable
  // before a *future* order (one that doesn't exist yet) is even allowed into the system.
  isCustomerBlocked: boolean;
  // Derived from counting this phone's orders tenant-wide (all-time), not stored on the order —
  // "returning" means more than one order exists for the phone, "new" means this is the only one.
  isReturningCustomer: boolean;
  // Derived the same way — this phone's delivery-success label/rate, batched for row display.
  // Prefers courierFraudHistory (real Steadfast/Pathao ground truth) when a record exists for the
  // phone, falling back to ZetSales' own network-wide order-stage history otherwise — same
  // preference order as the drawer's ZetSales Network scope. Null until at least 2 resolved
  // orders exist (matches computeOrderRisk's own threshold for a label to be meaningful), or if
  // ZetSales Fraud Checker isn't installed.
  riskLabel: RiskLabel | null;
  riskSuccessRate: number | null;
  // Cached result of a live Steadfast dashboard fraud-check (see steadfastFraudClient.ts), keyed
  // to this order's own customerPhone — checked once in the background right after the order is
  // created. Null until that background check completes (or if it fails/isn't configured).
  steadfastFraudCheck: { totalDelivered: number; totalCancelled: number; checkedAt: string } | null;
  // Same as steadfastFraudCheck, for Pathao's own dashboard fraud-check (see
  // pathaoFraudClient.ts) — independent of Steadfast's, checked and cached separately.
  pathaoFraudCheck: { totalDelivered: number; totalCancelled: number; checkedAt: string } | null;
  courierPartner: CourierPartner | null;
  courierTrackingId: string | null;
  courierConsignmentId: string | null;
  courierStatus: string | null;
  courierSyncedAt: string | null;
  // Snapshotted from the courier account's rate table (for this order's zone/speed) at the moment
  // this order dispatched — later rate changes never retroactively alter it. Null if no matching
  // rate was configured yet, or the order never dispatched through a connected courier account.
  courierCharge: number | null;
  // Snapshotted the first time the order's stage becomes 'Returned' after having shipped — the
  // courier's rate-card cost for a failed delivery, which is otherwise invisible to reconciliation.
  courierReturnCharge: number | null;
  // Best-effort auto-detected from the address (see zoneDetection.ts), editable by staff before
  // dispatch — determines which deliveryRates/returnRates cell applies.
  courierZoneTier: CourierZoneTier | null;
  // Chosen manually per order (defaults to 'regular') — the other axis of the deliveryRates cell.
  courierSpeed: CourierSpeed | null;
  deliveryZone: string | null;
  callAttempts: number;
  history: OrderTimelineEventDTO[];
  returnLocation: { warehouseId: string; warehouseName: string; bin: string } | null;
  // Where this order's stock was actually reserved from — set once, the first time the order
  // leaves inventory state 'none' (see recordFulfillmentWarehouse server-side), and never
  // overwritten after. Null until then (e.g. a still-Pending order with nothing reserved yet, or a
  // SKU that isn't tracked in inventory at all).
  fulfillmentWarehouseId: string | null;
  fulfillmentWarehouseName: string | null;
  // Running Cost of Goods Sold recognized for this order — positive once fulfilled (Delivered),
  // reduced by a good-condition return after delivery. Null until inventory cost tracking has
  // enough data (e.g. the SKU's unit cost was never known at the time it was consumed).
  cogsTotal: number | null;
  createdAt: string;
  updatedAt: string;
  claimedBy: OrderClaimDTO;
  claimedAt: string | null;
  // Set the moment any invoice/packing-slip/label print actually fires for this order (see
  // PrintOrderModal.tsx / CourierLabelModal.tsx) — not when a print dialog merely opens. Null means
  // never printed, which is what the Orders "ready to pack" banner filters on.
  printedAt: string | null;
}

export type OrderTabKey = 'all' | 'priority' | 'pending' | 'confirmed' | 'processing' | 'courierBooked' | 'shipped' | 'returning' | 'delivered' | 'codDue' | 'hold' | 'cancelled';

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
  confirmedAmount: number;
  confirmedAmountTrend: number | null;
  cancelledAmount: number;
  cancelledAmountTrend: number | null;
  tabCounts: Record<OrderTabKey, number>;
  dailySeries: OrderDailyStatDTO[];
  // Confirmed orders that were short of stock at confirm time (wasShortOfStock) and have since
  // become fully coverable — the "call the customer, their pre-order is back in stock" queue.
  // Backs RestockedOrdersBanner; independent of tabCounts since it only ever counts a subset of
  // the Confirmed tab, not a tab of its own.
  restockedReadyCount: number;
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
  confirmedAmount: number;
  cancelledAmount: number;
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

// --- Abandoned checkouts (WooCommerce orders never completed + Shopify abandoned checkouts) ---
// Deliberately separate from OrderDTO/orders: neither of these represents a placed order — a Woo
// order stuck at pending/on-hold/failed/cancelled at creation time never had a successful payment,
// and a Shopify checkout is by definition a cart that never became an order. Keeping them out of
// the orders pipeline is what keeps the Orders tabs free of never-completed noise.
export interface AbandonedCheckoutDTO {
  id: string;
  storeId: string;
  platform: 'shopify' | 'woocommerce';
  externalId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  address: string | null;
  lineItems: OrderLineItemDTO[];
  subtotal: number;
  total: number;
  currency: string;
  // The Woo order status that landed it here (e.g. 'pending', 'on-hold'), or 'checkout_abandoned'
  // for a Shopify checkout — there's no equivalent status vocabulary on that side.
  reason: string;
  // Shopify's abandoned_checkout_url — the only source of a "resume checkout" link a staff member
  // could send back to the customer. Always null for WooCommerce, which has no equivalent.
  checkoutUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AbandonedCheckoutStatsDTO {
  totalCount: number;
  totalValue: number;
  byPlatform: Record<'shopify' | 'woocommerce', number>;
}

// --- Messaging (unified Facebook Page + Instagram inbox) ---

export type MessagingProvider = 'facebook' | 'instagram';
export type SocialAccountStatus = 'connected' | 'error';

export interface SocialAccountDTO {
  id: string;
  provider: MessagingProvider;
  externalId: string;
  name: string;
  avatarUrl: string | null;
  status: SocialAccountStatus;
  connectedAt: string;
}

export type ConversationStatus = 'open' | 'closed';

export interface ConversationDTO {
  id: string;
  accountId: string;
  provider: MessagingProvider;
  accountName: string;
  participantId: string;
  participantName: string;
  participantAvatar: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  status: ConversationStatus;
}

export type MessageDirection = 'in' | 'out';

export interface MessageDTO {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  text: string;
  attachments: string[];
  sentAt: string;
}

export interface MessagingCapabilitiesDTO {
  metaAppConfigured: boolean;
}

// --- Analytics ---

export type AnalyticsCardKey =
  | 'orderFunnel'
  | 'confirmationPerformance'
  | 'salesOverTime'
  | 'aovOverTime'
  | 'salesByStore'
  | 'topProducts'
  | 'fulfillmentTime'
  | 'courierPerformance'
  | 'deliveryZones'
  | 'cancelReasons'
  | 'holdReasons'
  | 'newVsReturning'
  | 'topCustomers'
  | 'rfmSegments'
  | 'riskSegments'
  | 'customersByZone'
  | 'grossProfitOverTime'
  | 'profitByProduct'
  | 'salesByPaymentMethod'
  | 'discountsOverTime'
  | 'codCashflow'
  | 'abcAnalysis'
  | 'sellThrough'
  | 'stockoutCancellations'
  | 'itemsBoughtTogether'
  | 'returnedProducts'
  | 'weeklyPatterns'
  | 'partialDeliveryRate'
  | 'channelPerformance'
  | 'inventoryAdjustments'
  | 'inventoryThroughput'
  | 'shippingAndTracking'
  | 'newCustomerRevenue'
  | 'netSalesOverTime'
  | 'profitByCourier'
  | 'profitByZone'
  | 'deadStock'
  | 'duplicateOrders'
  | 'courierReconciliation'
  | 'marketingRoas'
  | 'addressQuality'
  | 'slaBreach'
  | 'callOutcomes'
  | 'flagReasons'
  | 'rescheduleEffectiveness'
  | 'blocklistHitRate'
  | 'rtoLoss'
  | 'marginWaterfall'
  | 'cohortRetention'
  | 'productPerformance'
  | 'confirmedSalesOverTime'
  | 'paymentStatusBreakdown'
  | 'employeeActivity'
  | 'productCourierHistory'
  | 'dailyLeadQuantity'
  | 'codChangeLog'
  | 'handoverSales'
  | 'spamOrders'
  | 'courierHandoverReport'
  | 'orderReturnReport'
  | 'orderAgentUpsellPerformance';

export type AnalyticsCategory = 'Sales' | 'Orders' | 'Delivery' | 'Customers' | 'Finance' | 'Inventory';

export interface AnalyticsLayoutCardDTO {
  key: AnalyticsCardKey;
  hidden: boolean;
}

// Per-user (not per-tenant) since a manager, an order agent, and a viewer plausibly want different
// defaults on the same team.
export interface AnalyticsLayoutDTO {
  cards: AnalyticsLayoutCardDTO[];
}

export interface MetricWithTrendDTO {
  value: number;
  trend: number | null;
}

// Powers the entry page's KPI strip.
export interface AnalyticsSummaryDTO {
  totalSales: MetricWithTrendDTO;
  totalOrders: MetricWithTrendDTO;
  aov: MetricWithTrendDTO;
  confirmationRate: MetricWithTrendDTO;
  deliveredRate: MetricWithTrendDTO;
  rtoRate: MetricWithTrendDTO;
  codOutstanding: MetricWithTrendDTO;
  grossProfitMargin: MetricWithTrendDTO;
}

export interface AnalyticsSeriesPointDTO {
  index: number;
  label: string;
  date: string;
  value: number;
}

export interface AnalyticsSeriesWindowDTO {
  from: string;
  to: string;
  points: AnalyticsSeriesPointDTO[];
}

// Generic single-metric "X over time" shape — current period + the intelligently matched
// comparison period (see resolveRange in commerce-service), plus a headline total/trend so a
// compact card can render without summing the series client-side.
export interface AnalyticsSeriesDTO {
  granularity: TrendGranularity;
  current: AnalyticsSeriesWindowDTO;
  comparison: AnalyticsSeriesWindowDTO;
  totalCurrent: number;
  totalComparison: number;
  trend: number | null;
}

// Generic "breakdown by dimension" shape, sorted by `value` descending with a running
// `cumulativePercentage` — this single shape powers every Pareto/ranked-dimension card
// (cancel/hold reasons, sales by store/payment method, courier/zone/risk performance, ABC
// analysis): `secondaryRate` carries a rate metric where one applies (delivered rate, success
// rate) and `secondaryValue` a second numeric where one applies (avg delivery days, etc), both
// null when not applicable to that card.
export interface AnalyticsBreakdownRowDTO {
  key: string;
  label: string;
  count: number;
  value: number;
  percentage: number;
  cumulativePercentage: number;
  secondaryRate: number | null;
  secondaryValue: number | null;
  // A third free numeric slot — e.g. parcels currently in transit for a courier — null wherever a
  // card has no use for it.
  tertiaryValue: number | null;
}

export interface AnalyticsBreakdownDTO {
  totalCount: number;
  totalValue: number;
  rows: AnalyticsBreakdownRowDTO[];
}

export interface OrderFunnelStageDTO {
  stage: string;
  count: number;
  conversionFromPrevious: number | null;
  conversionFromStart: number;
}

export interface OrderFunnelDTO {
  totalEntered: number;
  stages: OrderFunnelStageDTO[];
}

export interface AgentPerformanceRowDTO {
  agent: string;
  confirmedCount: number;
  avgCallAttempts: number | null;
  avgTimeToConfirmMinutes: number | null;
  // Not just how fast this agent confirms orders, but what happens to them afterward — a fast
  // confirmer whose orders mostly RTO isn't actually doing a good job.
  deliveredRate: number | null;
  rtoRate: number | null;
  // deliveredRate ÷ avgCallAttempts (clamped to >= 1 attempt) — a rough "successful deliveries per
  // unit of calling effort" efficiency score, for staffing/incentive comparisons across agents.
  compositeScore: number | null;
}

export interface ConfirmationPerformanceDTO {
  totalPending: number;
  totalConfirmed: number;
  confirmationRate: number | null;
  avgTimeToConfirmMinutes: number | null;
  // Order placed -> first logged call attempt (any outcome) — the real "how fresh is our call
  // queue" number, distinct from time-to-*confirm* which only resolves once someone actually picks up.
  avgTimeToFirstContactMinutes: number | null;
  avgCallAttempts: number | null;
  callAttemptsDistribution: { attempts: number; count: number }[];
  byAgent: AgentPerformanceRowDTO[];
}

export interface NewVsReturningPointDTO {
  index: number;
  label: string;
  date: string;
  newCustomers: number;
  returningCustomers: number;
}

export interface NewVsReturningDTO {
  granularity: TrendGranularity;
  current: { from: string; to: string; points: NewVsReturningPointDTO[] };
  comparison: { from: string; to: string; points: NewVsReturningPointDTO[] };
}

export interface TopCustomerRowDTO {
  phone: string;
  name: string | null;
  orderCount: number;
  totalSpend: number;
  deliveredCount: number;
  successRate: number | null;
  lastOrderAt: string;
  isBlocked: boolean;
  segment: string | null;
  recencyDays: number | null;
}

export interface RepeatCustomersDTO {
  oneTimeCount: number;
  repeatCount: number;
  repeatRevenueShare: number | null;
  topCustomers: TopCustomerRowDTO[];
}

export interface RfmSegmentsDTO {
  segments: AnalyticsBreakdownDTO;
  customers: TopCustomerRowDTO[];
}

export interface CustomerRowDTO {
  phone: string;
  name: string | null;
  orderCount: number;
  totalSpend: number;
  deliveredRate: number | null;
  lastOrderAt: string;
  riskLabel: RiskLabel;
  segment: string;
  isBlocked: boolean;
}

export interface CustomerListSummaryDTO {
  totalCustomers: number;
  repeatCount: number;
  repeatRevenueShare: number | null;
  totalLifetimeValue: number;
}

export interface CustomerListDTO {
  rows: CustomerRowDTO[];
  summary: CustomerListSummaryDTO;
}

export interface CustomerOrderRowDTO {
  orderId: string;
  number: string;
  createdAt: string;
  stage: OrderStage;
  paymentStatus: OrderPaymentStatus;
  total: number;
}

export interface CustomerDetailDTO {
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  orderCount: number;
  totalSpend: number;
  deliveredRate: number | null;
  riskLabel: RiskLabel;
  segment: string;
  isBlocked: boolean;
  firstOrderAt: string;
  lastOrderAt: string;
  // A real order ID belonging to this customer, anchoring the existing block/unblock-by-order
  // endpoints (see ordersController.blockCustomer) — those deliberately require an order ID rather
  // than a bare phone number, so a customer profile action reuses the same trusted path.
  recentOrderId: string;
}

export interface ProductRankingRowDTO {
  productId: string;
  title: string;
  image: string | null;
  unitsSold: number;
  orderCount: number;
  revenue: number;
  cogs: number | null;
  grossProfit: number | null;
  marginPercent: number | null;
  // Populated only by returnedProducts (returned/RTO units ÷ units shipped in the same period) —
  // null on every other card using this shape.
  returnRate: number | null;
}

export interface ProductRankingDTO {
  rows: ProductRankingRowDTO[];
}

export interface ProductPerformanceRowDTO {
  productId: string;
  title: string;
  image: string | null;
  orderCount: number;
  unitsOrdered: number;
  revenue: number;
  cancelledOrders: number;
  cancelledUnits: number;
  // Of every order placed for this product in the period, what share never made it past Cancelled —
  // a pre-shipment failure signal (confirmation/stock/blocklist), distinct from rtoRate below.
  cancelRate: number | null;
  // Spam is a subset of cancelledOrders (cancelReason: 'Spam'), broken out on its own — a high spam
  // rate on one product points at a junk-order/bot-attack pattern specific to that listing (e.g. a
  // viral ad drawing bait orders), which a blended cancelRate would otherwise bury.
  spamOrders: number;
  spamRate: number | null;
  // Same idea as spamRate, for cancelReason: 'Duplicate order' — a high rate here means customers
  // (or the confirmation flow) keep re-submitting for this specific product, distinct from spam/fraud.
  duplicateOrders: number;
  duplicateRate: number | null;
  rtoOrders: number;
  rtoUnits: number;
  // Of orders that actually shipped and reached a final outcome (delivered or RTO'd), what share
  // came back — same "of what shipped" convention courierPerformance/deliveryZones use.
  rtoRate: number | null;
  deliveredOrders: number;
  deliveredUnits: number;
  deliveredRate: number | null;
}

export interface ProductPerformanceDTO {
  rows: ProductPerformanceRowDTO[];
}

export interface EmployeeActivityRowDTO {
  agent: string;
  totalActions: number;
  confirmed: number;
  shipped: number;
  delivered: number;
  cancelled: number;
  holdResolved: number;
  callAttempts: number;
}

export interface EmployeeActivityDTO {
  rows: EmployeeActivityRowDTO[];
}

// Per-agent upselling performance — an order agent "upsells" by adding extra line items to an
// order in the order drawer before it's confirmed (see upsellOrder). Derived entirely from the
// existing 'Upsell added' history entries, same convention as EmployeeActivityDTO.
export interface OrderAgentUpsellPerformanceRowDTO {
  agent: string;
  upsellCount: number;
  itemsAdded: number;
  totalAmount: number;
  ordersUpsold: number;
}

export interface OrderAgentUpsellPerformanceDTO {
  rows: OrderAgentUpsellPerformanceRowDTO[];
}

// --- Call Center ---
// Presence is a hybrid: 'onCall' is inferred server-side from a real order-history action in the
// last ACTIVE_WINDOW seconds (see callCenterController), so agents never have to clock in/out for
// it. 'break' is the one state that leaves no data trail, so it's the only one an agent sets
// themselves; 'available'/'offline' are the idle fallbacks once a break ends or nothing's happened
// in a while.
export type CallCenterPresenceStatus = 'onCall' | 'available' | 'offline';

export interface CallCenterAgentDTO {
  email: string;
  role: TeamRole;
  status: CallCenterPresenceStatus;
  statusSince: string;
  statusDurationSeconds: number;
  callsToday: number;
  confirmedToday: number;
  failedToday: number;
  avgTimeToConfirmMinutes: number | null;
  isYou: boolean;
}

export interface CallCenterQueueItemDTO {
  orderId: string;
  number: string;
  customerName: string | null;
  customerPhone: string | null;
  total: number;
  callAttempts: number;
  waitingMinutes: number;
  lastOutcome: string | null;
  isPriorityCall: boolean;
  claimedBy: OrderClaimDTO;
  claimedAt: string | null;
}

export interface CallCenterHourlyVolumeDTO {
  hour: number;
  label: string;
  calls: number;
  confirmed: number;
}

export interface CallCenterLeaderboardEntryDTO {
  email: string;
  confirmedCount: number;
  avgTimeToConfirmMinutes: number | null;
  deliveredRate: number | null;
  compositeScore: number | null;
}

// One completed (or, if `end` is null, still-in-progress) break — this is the answer to "who took a
// break for how long": a chronological log, not just a running daily total.
export interface CallCenterKpisDTO {
  callsToday: number;
  confirmedToday: number;
  failedToday: number;
  rescheduledToday: number;
  pendingQueueCount: number;
  confirmationRateToday: number | null;
  avgTimeToConfirmMinutesToday: number | null;
  avgTimeToFirstCallMinutesToday: number | null;
  slaBreachCount: number;
}

export interface CallCenterOverviewDTO {
  kpis: CallCenterKpisDTO;
  agents: CallCenterAgentDTO[];
  queue: CallCenterQueueItemDTO[];
  hourlyVolume: CallCenterHourlyVolumeDTO[];
  leaderboard: CallCenterLeaderboardEntryDTO[];
}

export interface ProductCourierHistoryRowDTO {
  productId: string;
  title: string;
  courierPartner: string;
  unitsShipped: number;
  deliveredRate: number | null;
  rtoRate: number | null;
}

export interface ProductCourierHistoryDTO {
  rows: ProductCourierHistoryRowDTO[];
}

export interface ItemPairRowDTO {
  productA: string;
  productB: string;
  pairCount: number;
}

export interface ItemsBoughtTogetherDTO {
  rows: ItemPairRowDTO[];
}

export interface WeeklyPatternCellDTO {
  dayOfWeek: number;
  hour: number;
  orderCount: number;
  revenue: number;
}

export interface WeeklyPatternDTO {
  cells: WeeklyPatternCellDTO[];
  maxOrderCount: number;
}

export interface SellThroughRowDTO {
  productId: string;
  title: string;
  unitsSoldPerDay: number;
  currentStock: number;
  daysOfInventory: number | null;
  percentageSold: number | null;
}

export interface SellThroughDTO {
  rows: SellThroughRowDTO[];
}

export interface FulfillmentTimeStageDTO {
  fromStage: string;
  toStage: string;
  avgHours: number | null;
  medianHours: number | null;
}

export interface FulfillmentTimeDTO {
  stages: FulfillmentTimeStageDTO[];
}

export interface CodCashflowDTO {
  outstanding: number;
  collected: number;
  // Real now, not a proxy: average days between an order's Delivered event and its "Payment
  // collected" event, for orders that have actually been marked collected via that action. Orders
  // synced before that feature existed, or still pending, aren't part of the average.
  avgDaysToCollect: number | null;
  series: AnalyticsSeriesDTO;
  collectedSeries: AnalyticsSeriesDTO;
}

export interface StockoutCancellationsDTO {
  series: AnalyticsSeriesDTO;
  topAffectedProducts: AnalyticsBreakdownRowDTO[];
}

export interface SpamOrdersDTO {
  totalOrders: number;
  spamOrders: number;
  // Share of every order placed in the period that got cancelled as Spam — the one number that
  // answers "is this actually a problem right now" without opening the detail view.
  spamRate: number | null;
  valueLost: number;
  series: AnalyticsSeriesDTO;
  topAffectedProducts: AnalyticsBreakdownRowDTO[];
}

export interface InventoryThroughputDTO {
  totalOrdered: number;
  totalReceived: number;
  totalShipped: number;
  uniqueSkus: number;
  totalInventoryValue: number;
}

export interface ShippingTrackingDTO {
  series: AnalyticsSeriesDTO;
  totalShippingFee: number;
  trackingIncludedRate: number | null;
}

export interface NewCustomerRevenuePointDTO {
  index: number;
  label: string;
  date: string;
  newRevenue: number;
  returningRevenue: number;
}

export interface NewCustomerRevenueDTO {
  granularity: TrendGranularity;
  current: { from: string; to: string; points: NewCustomerRevenuePointDTO[] };
  comparison: { from: string; to: string; points: NewCustomerRevenuePointDTO[] };
}

export interface DeadStockRowDTO {
  productId: string;
  title: string;
  currentStock: number;
  daysSinceLastSale: number | null;
  inventoryValue: number;
}

export interface DeadStockDTO {
  rows: DeadStockRowDTO[];
}

export interface DuplicateOrderGroupDTO {
  phone: string;
  customerName: string | null;
  date: string;
  orderCount: number;
  orderNumbers: string[];
  totalValue: number;
  // Which of orderNumbers above actually got cancelled with reason "Duplicate order" — the manual
  // confirmation on top of the automatic same-phone/same-day detection that flagged this group in
  // the first place. Empty doesn't mean it wasn't a duplicate, just that nobody's acted on it (yet).
  confirmedOrderNumbers: string[];
}

export interface DuplicateOrdersDTO {
  groups: DuplicateOrderGroupDTO[];
  // Of every order cancelled as "Duplicate order" in the period (the manual/confirmed signal) —
  // same total/rate/series shape as SpamOrdersDTO, so the two "which cancel reason, how often, on
  // what day" questions are answered the same way for both.
  totalOrders: number;
  confirmedOrders: number;
  confirmationRate: number | null;
  series: AnalyticsSeriesDTO;
}

export interface CourierReconciliationRowDTO {
  provider: string;
  displayName: string;
  deliveredCodAmount: number;
  courierCharges: number;
  returnCharges: number;
  expectedReceivable: number;
  paid: number;
  due: number;
}

export interface CodAgingBucketDTO {
  label: string;
  count: number;
  value: number;
}

// `due` here is a lifetime running balance (all delivered COD minus all charges minus all
// settlements ever recorded), not scoped to the date filter — dues carry forward, so a period-
// scoped number would be misleading. `aging` buckets *currently unreconciled* delivered orders by
// how long they've been waiting, which is a real, date-independent signal on its own.
export interface CourierReconciliationDTO {
  rows: CourierReconciliationRowDTO[];
  aging: CodAgingBucketDTO[];
}

export interface CourierHandoverReportRowDTO {
  provider: string;
  displayName: string;
  manifestCount: number;
  parcelCount: number;
  itemCount: number;
  totalCodAmount: number;
  confirmedCount: number;
  pendingCount: number;
  avgConfirmHours: number | null;
}

// Manifest-level view of handovers within the selected date range (scoped by handoverDate, unlike
// CourierReconciliationDTO which is a lifetime balance) — how many batches went out per courier,
// how big they were, and how long a batch typically sits Pending before the courier confirms it.
export interface CourierHandoverReportDTO {
  totalManifests: number;
  totalParcels: number;
  totalCodAmount: number;
  pendingManifests: number;
  rows: CourierHandoverReportRowDTO[];
  aging: CodAgingBucketDTO[];
}

export interface MarketingRoasDTO {
  adSpend: number;
  netSales: number;
  grossProfit: number;
  roas: number | null;
  profitRoas: number | null;
  series: AnalyticsSeriesDTO;
}

export interface AddressQualityRowDTO {
  bucket: string;
  count: number;
  rtoRate: number | null;
}

export interface AddressQualityDTO {
  rows: AddressQualityRowDTO[];
}

export interface SlaBreachRowDTO {
  stage: string;
  thresholdHours: number;
  totalOrders: number;
  breachedCount: number;
  breachRate: number | null;
}

// Thresholds are fixed defaults documented in the backend handler, not yet a tenant-configurable
// setting — a real simplification, disclosed rather than hidden.
export interface SlaBreachDTO {
  rows: SlaBreachRowDTO[];
}

// holdReasons wraps the usual breakdown with an aging view — how long *currently* on-hold orders
// have been sitting, bucketed the same way courier reconciliation's COD aging is.
export interface HoldReasonsDTO {
  breakdown: AnalyticsBreakdownDTO;
  aging: CodAgingBucketDTO[];
}

export interface RtoLossDTO {
  totalLoss: number;
  breakdown: AnalyticsBreakdownDTO;
}

// Order-level view of the return pipeline — returnedProducts is per-SKU and rtoLoss is purely the
// cost side; this is "how many orders, which stage of RTO Initiated/QC Pending/Returned they're
// currently sitting in, and which courier/store they're coming from." returnRate is orders
// returned as a share of every order that ever left Processing (Ready for Pickup or later), the
// same denominator returnedProducts uses at the unit level.
export interface OrderReturnReportDTO {
  totalCount: number;
  totalValue: number;
  returnRate: number | null;
  byStage: AnalyticsBreakdownDTO;
  byCourier: AnalyticsBreakdownDTO;
  byStore: AnalyticsBreakdownDTO;
}

// --- Reports (Analytics > Reports) ---
// A small, fixed set of print/export-oriented reports, distinct from the Analytics dashboard
// cards above — these render as flat tables meant for CSV/A4-PDF export, not charts.

// Opening/closing stock ledger per product variant for a date range. `open`/`close` are derived
// (current onHand minus movements after the range, minus movements within it — see
// getStockReport), not stored balances; ZetSales has no daily stock-snapshot table. `poReturn` is
// always 0 — there's no movement reason representing stock returned to a supplier yet. `quality`
// is always '-' — no such attribute exists in the product/variant schema.
export interface StockReportRowDTO {
  itemName: string;
  sku: string | null;
  size: string;
  color: string;
  quality: string;
  open: number;
  proSale: number;
  buyUnit: number;
  saleUnit: number;
  returnUnit: number;
  lossUnit: number;
  poReturn: number;
  close: number;
}

export interface StockReportDTO {
  warehouseName: string;
  rows: StockReportRowDTO[];
}

// One row per (order, line item) within confirmed/pending courier handovers in the date range —
// productName/productSku are ';'-joined when an order has multiple line items, since this is a
// flat export table rather than a nested manifest view.
export interface CourierHandoverOrdersReportRowDTO {
  date: string;
  brand: string;
  customerName: string;
  orderNumber: string;
  courier: string;
  productName: string;
  productSku: string;
  qty: number;
  totalQty: number;
}

export interface CourierHandoverOrdersReportDTO {
  rows: CourierHandoverOrdersReportRowDTO[];
}

// Units handed over to couriers in the date range, aggregated per SKU across every handover.
export interface CourierHandoverItemsReportRowDTO {
  itemName: string;
  sku: string | null;
  size: string;
  color: string;
  quality: string;
  unit: number;
}

export interface CourierHandoverItemsReportDTO {
  rows: CourierHandoverItemsReportRowDTO[];
}

// Per (order, line item) financial breakdown for every handover manifest in the date range —
// subTotal/discount/totalAmount/advance/deliveryCharge/cod repeat on every line-item row of a
// multi-item order (flat export table, not a nested invoice). `cod` is what's actually left to
// collect on delivery (order total minus any advance already taken), zero for non-COD orders.
export interface CourierHandoverFinancialReportRowDTO {
  date: string;
  brand: string;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  sku: string;
  price: number;
  qty: number;
  lineTotal: number;
  totalQty: number;
  subTotal: number;
  discount: number;
  totalAmount: number;
  advance: number;
  deliveryCharge: number;
  cod: number;
  courier: string;
}

export interface CourierHandoverFinancialReportDTO {
  rows: CourierHandoverFinancialReportRowDTO[];
}

// Per (order, line item) for orders currently in the return/RTO leg (RTO Initiated, QC Pending, or
// finalized Returned), matched by when the order most recently entered one of those stages —
// `finalOnly=true` narrows this to Returned only, for a "confirmed back to stock" view.
// itemDiscount is always 0 — ZetSales has no per-line-item discount, only an order-level one.
// `cod` is what was left to collect on delivery (0 for non-COD orders).
export interface CourierReturnReportRowDTO {
  invoiceNo: string;
  itemName: string;
  sku: string;
  invoiceDate: string | null;
  returnReceivedDate: string | null;
  courier: string;
  quantity: number;
  itemPrice: number;
  itemDiscount: number;
  deliveryCharge: number;
  cod: number;
  status: string;
}

export interface CourierReturnReportDTO {
  rows: CourierReturnReportRowDTO[];
}

// Orders with a nonzero advance payment, created in the selected period. totalAmountWithDiscount
// is subtotal minus discount (product value only, excluding delivery); totalReceivableAmount is
// the full order total (includes delivery). billDate is order-creation date; invoiceDate is when
// the invoice was issued (falls back to billDate if no invoice yet) — kept distinct since they can
// genuinely differ.
export interface AdvancePaymentReportRowDTO {
  invoiceDate: string;
  billDate: string;
  brand: string;
  customerName: string;
  customerPhone: string;
  orderNumber: string;
  totalAmountWithDiscount: number;
  deliveryCharge: number;
  totalReceivableAmount: number;
  advance: number;
  paymentChannel: string;
}

export interface AdvancePaymentReportDTO {
  rows: AdvancePaymentReportRowDTO[];
}

// Per-product lead/confirmation funnel for orders created in the selected period. totalLead is
// every order containing this product; totalRoLead excludes ones cancelled as Spam/Duplicate
// (ZetSales' closest equivalent to "real order" lead filtering). confirmed counts orders whose
// history ever logged a 'Confirmed' entry (so a later cancellation doesn't erase that it was once
// confirmed). confirmationPercent = confirmed / totalRoLead, as a percentage.
export interface ProductConfirmationReportRowDTO {
  productTitle: string;
  totalLead: number;
  totalRoLead: number;
  confirmed: number;
  holdAndPending: number;
  preOrder: number;
  confirmationPercent: number;
  confirmationCancel: number;
  delivered: number;
  inTransit: number;
}

export interface ProductConfirmationReportDTO {
  rows: ProductConfirmationReportRowDTO[];
}

// Per-product cancellation breakdown, pivoted by cancelReason, for orders cancelled in the
// selected period. otherReasons folds every reason that isn't one of the other named buckets
// ('Customer changed mind', 'Wrong address', 'Out of stock', 'Other', or unset).
export interface CancelledOrdersReportRowDTO {
  productTitle: string;
  fakeOrder: number;
  doubleOrder: number;
  fraudCustomer: number;
  noResponse: number;
  priceIssue: number;
  badCustomer: number;
  otherReasons: number;
  totalCancel: number;
}

export interface CancelledOrdersReportDTO {
  rows: CancelledOrdersReportRowDTO[];
}

// Date-wise rollup of every courier handover manifest in the selected range, bucketed by each
// order's CURRENT stage (not its stage at handover time) — Delivered, Cancel/Return (Cancelled,
// RTO Initiated, QC Pending, or Returned), Partial Del., or still In-Transit. successRate is
// Delivered as a share of totalHandover.
export interface CourierHandoverStatusReportRowDTO {
  date: string;
  totalHandover: number;
  delivered: number;
  cancelReturn: number;
  partialDelivered: number;
  inTransit: number;
  successRate: number;
}

export interface CourierHandoverStatusReportDTO {
  rows: CourierHandoverStatusReportRowDTO[];
}

// Per-product delivery outcome for every order in a courier handover manifest in the selected
// range — the courier-outcome counterpart to ProductConfirmationReportDTO (which covers the
// pre-courier confirmation funnel instead). `totalCod` sums each order's full COD-due amount on
// every line of that order (same convention as CourierHandoverFinancialReportDTO), not a
// per-line-item split.
export interface CourierProductDeliveryReportRowDTO {
  productTitle: string;
  totalOrders: number;
  delivered: number;
  returned: number;
  cancelled: number;
  inTransit: number;
  totalCod: number;
  successRate: number;
  returnRate: number;
}

export interface CourierProductDeliveryReportDTO {
  rows: CourierProductDeliveryReportRowDTO[];
}

// Per-order profit breakdown, scoped by CONFIRM date (the 'Confirmed' history entry's timestamp,
// not order-creation date). `buyAmount` (COGS) is 0 until the order reaches Delivered/Partial
// Delivered — ZetSales recognizes COGS at delivery, same convention used by getMarginWaterfall/
// getRtoLoss elsewhere — so `totalProfitAmount` for an order still in transit only reflects the
// delivery-fee markup, not product margin, until it's actually delivered. No exchange/return-value
// fields — ZetSales has no product-exchange concept and no distinct tracked "value returned"
// separate from COGS/write-off accounting, so those would only ever show as dead zero columns.
export interface ConfirmDateSaleProfitReportRowDTO {
  billDate: string | null;
  brand: string;
  billNumber: string;
  receiverName: string;
  courier: string;
  orderStatus: string;
  paidAmount: number;
  deliveryFeeBill: number;
  deliveryFeeCourier: number;
  deliveryFeeProfit: number;
  discountAmount: number;
  codAmount: number;
  saleAmount: number;
  buyAmount: number;
  totalProfitAmount: number;
}

export interface ConfirmDateSaleProfitReportDTO {
  rows: ConfirmDateSaleProfitReportRowDTO[];
}

// Per-agent order/unit funnel for the selected period. ZetSales has no persistent "assigned
// agent" field (its call queue uses a transient claim, not a permanent assignment — see
// OrderClaimDTO), so `assignOrder`/`assignUnit` is the closest honest equivalent: every order this
// agent took ANY action on (confirm, hold, cancel, note, etc.) in the period, from that order's
// history log — the same source EmployeeActivityDTO already uses. Every bucket below except
// `confirmedOrder` is a current-STAGE breakdown of that same "touched by this agent" order set
// (Order Created = still Pending/Flagged, Hold = On Hold, etc.) — `confirmedOrder` alone requires
// this specific agent to have logged the 'Confirmed' history entry, not just have touched the
// order some other way. Percentages aren't included here — computed client-side as each row's
// share of that column's grand total, since that's what stays correct after client-side filtering.
export interface EmployeeBaseReportRowDTO {
  employee: string;
  assignOrder: number;
  assignUnit: number;
  confirmedOrder: number;
  confirmedUnit: number;
  orderCreatedOrder: number;
  orderCreatedUnit: number;
  holdOrder: number;
  holdUnit: number;
  preOrderOrder: number;
  preOrderUnit: number;
  confirmationCancelOrder: number;
  confirmationCancelUnit: number;
  inTransitOrder: number;
  inTransitUnit: number;
  deliveredOrder: number;
  deliveredUnit: number;
  deliveryCancelOrder: number;
  deliveryCancelUnit: number;
  partiallyDeliveredOrder: number;
  partiallyDeliveredUnit: number;
}

export interface EmployeeBaseReportDTO {
  rows: EmployeeBaseReportRowDTO[];
}

// Sales grouped by Bangladesh district, detected from each order's free-text address (no
// structured district field exists on an order) — see bangladeshDistricts.ts for the keyword
// matching. Orders whose address matched no known district land under district: 'Unknown' rather
// than being silently dropped or guessed.
export interface DistrictSalesReportRowDTO {
  district: string;
  orderCount: number;
  revenue: number;
  delivered: number;
  rtoReturned: number;
  rtoRate: number | null;
}

export interface DistrictSalesReportDTO {
  rows: DistrictSalesReportRowDTO[];
}

// One row per purchase order in the selected period.
export interface PurchaseReportRowDTO {
  billDate: string;
  supplierName: string;
  billNumber: string;
  items: number;
  totalUnit: number;
  billAmount: number;
  remark: string;
}

export interface PurchaseReportDTO {
  rows: PurchaseReportRowDTO[];
}

// One row per line item within each purchase order in the selected period — poNumber is included
// so the frontend can group consecutive rows under a per-PO subtotal, same as the reference
// report's "ORDER TOTAL" rows. lineTotal is derived (quantity × unitPrice) — purchaseOrders has no
// stored per-line total, only the PO-level `subtotal`/`total`.
export interface PurchaseItemDetailsReportRowDTO {
  poNumber: string;
  date: string;
  supplier: string;
  itemName: string;
  sku: string | null;
  unit: number;
  unitPrice: number;
  lineTotal: number;
}

export interface PurchaseItemDetailsReportDTO {
  rows: PurchaseItemDetailsReportRowDTO[];
}

// Running debit/credit ledger for one supplier. `debit` (money spent) comes from real
// inventoryMovements data (Opening balance + Incoming Stock, the only two reasons that reliably
// carry a supplierId — see suppliersController.ts). `credit` (money actually paid to the
// supplier) is always 0 — ZetSales has no supplier-payment feature/collection yet, so there's
// nothing to report there; this isn't a rounding artifact, there's no data source at all.
export interface SupplierLedgerReportRowDTO {
  date: string;
  docNo: string;
  type: string;
  remark: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface SupplierLedgerReportDTO {
  supplierName: string;
  rows: SupplierLedgerReportRowDTO[];
}

// Flat list of expenses in the selected period. There's no "code" field on an expense — category
// is the only classifier ZetSales tracks (deliberately free text, not an enum).
export interface ExpenseReportRowDTO {
  date: string;
  category: string;
  remark: string;
  amount: number;
}

export interface ExpenseReportDTO {
  rows: ExpenseReportRowDTO[];
}

// A simplified income/expense statement built from the same real aggregations
// getProfitAndLoss (accountingController.ts) already computes — revenue, COGS-derived gross
// profit, and expenses grouped by category. There's no Assets/Liability/Capital tracking anywhere
// in ZetSales (no such collection or field exists), so those rows are intentionally left out
// rather than shown as a fabricated 0.00.
export interface IncomeExpenseReportRowDTO {
  label: string;
  amount: number | null;
  kind: 'section' | 'item' | 'summary';
}

export interface IncomeExpenseReportDTO {
  rows: IncomeExpenseReportRowDTO[];
}

// Per-courier cash reconciliation — same computation as getCourierReconciliation
// (analyticsController.ts), reused here as its own report rather than a re-shaped Analytics DTO
// (this file's own convention). `deliveredCodAmount`/`due` are LIFETIME running balances, not
// scoped to the report's date range — a courier's outstanding balance carries forward, so a
// period-scoped number would misrepresent what's actually owed. `due` = deliveredCodAmount −
// courierCharges − returnCharges − paid (settlements you've recorded in Integrations).
export interface CourierReconciliationReportRowDTO {
  provider: string;
  displayName: string;
  deliveredCodAmount: number;
  courierCharges: number;
  returnCharges: number;
  expectedReceivable: number;
  paid: number;
  due: number;
}

export interface CourierReconciliationReportDTO {
  rows: CourierReconciliationReportRowDTO[];
}

// One row per individual COD-amount edit in the selected period (a shippingFee/discount change
// that moved an order's total after it was placed) — the order-level detail behind the "COD
// change log" Analytics card, which only shows totals grouped by editor. oldAmount/newAmount are
// parsed from the same "৳X → ৳Y" history detail string that card already reads.
export interface CodChangeLogReportRowDTO {
  date: string;
  orderNumber: string;
  changedBy: string;
  oldAmount: number;
  newAmount: number;
  delta: number;
}

export interface CodChangeLogReportDTO {
  rows: CodChangeLogReportRowDTO[];
}

// One row per individual inventory adjustment (damage, loss, cycle-count correction, receiving
// discrepancy, etc.) in the selected period — the event-level detail behind the "Inventory
// adjustments" Analytics card, which only shows totals grouped by reason. Routine sales/returns
// and warehouse-to-warehouse transfers aren't included, same scope as that card.
export interface InventoryAdjustmentReportRowDTO {
  date: string;
  itemName: string;
  sku: string | null;
  warehouseName: string;
  reason: string;
  quantity: number;
  value: number;
  note: string;
  recordedBy: string;
}

export interface InventoryAdjustmentReportDTO {
  rows: InventoryAdjustmentReportRowDTO[];
}

export interface MarginWaterfallStepDTO {
  label: string;
  value: number;
}

export interface MarginWaterfallDTO {
  steps: MarginWaterfallStepDTO[];
  netProfit: number;
}

export interface CohortRetentionRowDTO {
  cohortMonth: string;
  newCustomers: number;
  retained30d: number | null;
  retained60d: number | null;
  retained90d: number | null;
}

// Ignores the date-range filter above it, same reasoning as topCustomers/rfmSegments/
// customersByZone — a cohort's retention is a lifetime fact about that cohort, not something a
// 30-day window can answer without cutting cohorts off mid-measurement.
export interface CohortRetentionDTO {
  rows: CohortRetentionRowDTO[];
}

export interface BlocklistHitRateDTO {
  totalOrders: number;
  blockedHits: number;
  hitRate: number | null;
  valueBlocked: number;
  series: AnalyticsSeriesDTO;
}

export interface RescheduleEffectivenessDTO {
  totalRescheduled: number;
  convertedCount: number;
  conversionRate: number | null;
  breakdown: AnalyticsBreakdownDTO;
}

// --- Ad Performance (manual ad-cost calculator) ---

export type AdChannel = 'Meta' | 'TikTok' | 'Google' | 'Other';

export interface AdCostEntryDTO {
  id: string;
  productId: string;
  productTitle: string;
  channel: AdChannel;
  amount: number;
  date: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AdPerformanceProductRowDTO {
  productId: string;
  productTitle: string;
  spend: number;
  confirmedOrders: number;
  deliveredOrders: number;
  cpa: number | null;
  costPerDelivered: number | null;
  revenue: number;
  roas: number | null;
}

export interface AdPerformanceSummaryDTO {
  totalSpend: number;
  totalConfirmedOrders: number;
  totalDeliveredOrders: number;
  blendedCpa: number | null;
  blendedCostPerDelivered: number | null;
}

export interface AdPerformanceChannelSpendDTO {
  channel: AdChannel;
  spend: number;
}

export interface AdPerformanceReportDTO {
  summary: AdPerformanceSummaryDTO;
  byProduct: AdPerformanceProductRowDTO[];
  byChannel: AdPerformanceChannelSpendDTO[];
}

// --- Ad account connections (OAuth) ---

export type AdAccountPlatform = 'meta' | 'tiktok' | 'google';
export type AdAccountStatus = 'connected' | 'error';

export interface AdAccountDTO {
  id: string;
  platform: AdAccountPlatform;
  externalAccountId: string;
  displayName: string;
  status: AdAccountStatus;
  lastSyncedAt: string | null;
  createdAt: string;
}

// --- Ad campaign creation ("Unified Campaign") ---

export interface AdCreativeAssetDTO {
  id: string;
  type: 'image' | 'video';
  url: string;
  fileName: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
}

export type AdCampaignGoal = 'maximize_conversions' | 'maximize_value';
export type AdCampaignPlatformStatus = 'pending' | 'creating' | 'paused' | 'active' | 'failed';

export interface AdCampaignPlatformStatusDTO {
  adAccountId: string;
  status: AdCampaignPlatformStatus;
  externalCampaignId: string | null;
  error: string | null;
  updatedAt: string;
}

export interface AdCampaignDTO {
  id: string;
  name: string;
  productId: string | null;
  productTitle: string | null;
  destinationUrl: string;
  goal: AdCampaignGoal;
  budgetAmount: number;
  budgetType: 'daily' | 'total';
  assetIds: string[];
  headlines: string[];
  descriptions: string[];
  primaryText: string;
  platforms: {
    meta: AdCampaignPlatformStatusDTO | null;
    google: AdCampaignPlatformStatusDTO | null;
    tiktok: AdCampaignPlatformStatusDTO | null;
  };
  createdBy: string | null;
  createdAt: string;
}

export interface CreateAdCampaignPayload {
  productId?: string;
  productTitle?: string;
  destinationUrl: string;
  goal: AdCampaignGoal;
  budgetAmount: number;
  budgetType: 'daily' | 'total';
  assetIds: string[]; // shared pool — used as-is for Meta/TikTok's own dynamic creative
  headlines: string[]; // min 3
  descriptions: string[]; // min 2
  primaryText: string; // doubles as Google's "long headline"
  platforms: AdAccountPlatform[]; // which connected platforms to publish to
  // Google Performance Max needs specific, correctly-shaped image slots (not just "an image") —
  // required only when 'google' is included in `platforms`.
  googleMarketingImageAssetId?: string; // landscape, >=1.91:1
  googleSquareImageAssetId?: string; // 1:1
  googleLogoAssetId?: string; // 1:1
  // Google's BUSINESS_NAME asset — the frontend auto-fills this from the logged-in user's own
  // businessName (UserDTO) rather than asking the user to type it again.
  businessName?: string;
}

// --- HRM (Human Resource Management) ---

export type HrmEmployeeStatus = 'active' | 'onLeave' | 'suspended' | 'terminated';

export interface HrmDepartmentDTO {
  id: string;
  name: string;
  description: string | null;
  employeeCount: number;
  createdAt: string;
}

export interface HrmEmployeeDTO {
  id: string;
  employeeCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  departmentName: string | null;
  shiftId: string | null;
  shiftName: string | null;
  // Defaults to the assigned shift's own times when a shift is picked, but can be customized per
  // employee from there — e.g. two people on "Morning Shift" who actually start 30 minutes apart.
  // Falls back to the shift's times (or the tenant's default office hours) when null.
  shiftStartTime: string | null; // "HH:mm", 24h
  shiftEndTime: string | null; // "HH:mm", 24h
  designation: string;
  status: HrmEmployeeStatus;
  joinDate: string;
  monthlySalary: number;
  address: string | null;
  emergencyContact: string | null;
  notes: string | null;
  // Whether a self-service punch PIN has been set — the PIN itself is never returned to the client.
  hasPin: boolean;
  createdAt: string;
  updatedAt: string;
}

export type HrmAttendanceStatus = 'present' | 'absent' | 'late' | 'halfDay' | 'onLeave';

// How an attendance record was captured — 'pin' is today's self-service punch page;
// 'biometric' is reserved for a future fingerprint/face device hitting the same punch endpoints.
export type HrmAttendanceSource = 'manual' | 'pin' | 'biometric';

export interface HrmBreakDTO {
  start: string;
  end: string | null;
}

export interface HrmAttendanceDTO {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  status: HrmAttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  breaks: HrmBreakDTO[];
  hoursWorked: number | null;
  note: string | null;
  source: HrmAttendanceSource | null;
}

// --- Self-service punch page (no login — PIN-gated, tenant resolved from subdomain) ---

export type HrmPunchState = 'notCheckedIn' | 'checkedIn' | 'onBreak' | 'checkedOut';
export type HrmPunchAction = 'checkIn' | 'breakStart' | 'breakEnd' | 'checkOut';

export interface HrmPublicEmployeeDTO {
  id: string;
  name: string;
  employeeCode: string;
}

export interface HrmPunchStatusDTO {
  employeeId: string;
  employeeName: string;
  date: string;
  state: HrmPunchState;
  checkIn: string | null;
  checkOut: string | null;
  breaks: HrmBreakDTO[];
}

export type HrmLeaveType = 'sick' | 'casual' | 'annual' | 'unpaid' | 'other';
export type HrmLeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface HrmLeaveRequestDTO {
  id: string;
  employeeId: string;
  employeeName: string;
  type: HrmLeaveType;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: HrmLeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export type HrmPayrollStatus = 'draft' | 'paid';

export interface HrmPayrollDTO {
  id: string;
  employeeId: string;
  employeeName: string;
  month: string; // YYYY-MM
  baseSalary: number;
  bonus: number;
  deductions: number;
  unpaidLeaveDays: number;
  overtimeHours: number;
  overtimePay: number;
  undertimeHours: number;
  undertimeDeduction: number;
  netPay: number;
  status: HrmPayrollStatus;
  paidAt: string | null;
  generatedAt: string;
}

export interface HrmDashboardDTO {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  absentToday: number;
  onLeaveToday: number;
  pendingLeaveRequests: number;
  departmentBreakdown: { departmentName: string; count: number }[];
  monthlyPayrollTotal: number;
}

// --- HRM settings (office hours, weekly off days, overtime/wage terms) ---
// One doc per tenant, drives both the payroll overtime/undertime calculation and the Attendance
// tab's sense of what a "full day" is. `weeklyOffDays` uses JS's Date#getDay() convention
// (0=Sunday..6=Saturday); an empty array means the business never has a weekly off day.
export interface HrmSettingsDTO {
  // Single office-hours window — ignored for scheduling once multiShift is on, but kept as the
  // fallback for any employee not assigned to a specific shift.
  officeStartTime: string; // "HH:mm", 24h
  officeEndTime: string; // "HH:mm", 24h
  weeklyOffDays: number[];
  overtimeMultiplier: number; // e.g. 1.5 = time-and-a-half
  workingDaysPerMonth: number; // used to derive a daily/hourly rate from monthlySalary
  payrollNotes: string; // free-form wage terms, e.g. pay date, approval rules
  multiShift: boolean; // when true, each employee's own assigned shift defines their scheduled hours
  // null until the setup wizard is finished or explicitly skipped — drives whether HrmPage
  // auto-opens the onboarding wizard. Never cleared by a later settings edit.
  onboardedAt: string | null;
  updatedAt: string;
}

export type HrmSettingsInput = Partial<Omit<HrmSettingsDTO, 'updatedAt' | 'onboardedAt'>> & { markOnboarded?: boolean };

// --- Shifts (used when HrmSettingsDTO.multiShift is on) ---
export interface HrmShiftDTO {
  id: string;
  name: string;
  startTime: string; // "HH:mm", 24h
  endTime: string; // "HH:mm", 24h
  createdAt: string;
}

export const HRM_SHIFT_PRESETS = ['Morning Shift', 'Day Shift', 'Evening Shift', 'Night Shift'] as const;

// Common department names offered as one-click add suggestions during HRM setup — purely a
// frontend convenience list, not enforced or referenced anywhere server-side.
export const HRM_DEPARTMENT_PRESETS = [
  'Sales',
  'Marketing',
  'Warehouse Operations',
  'Customer Support',
  'Finance & Accounts',
  'Human Resources',
  'IT',
  'Delivery & Logistics',
  'Procurement',
  'Management',
] as const;
