export interface UserDTO {
    id: string;
    email: string;
    isVerified: boolean;
    tenantId: string | null;
    isOnboarded: boolean;
    businessName: string | null;
    role: TeamRole | null;
}
export type TeamRole = 'owner' | 'admin' | 'manager' | 'agent' | 'viewer';
export declare const MODULE_KEYS: readonly ["home", "orders", "products", "inventory", "customers", "adPerformance", "customerService", "supplyChain", "accounting", "professionalServices", "hr", "analytics", "discounts", "content", "integrations", "team", "settings"];
export type ModuleKey = (typeof MODULE_KEYS)[number];
export interface RoleDefinition {
    role: TeamRole;
    label: string;
    description: string;
    modules: ModuleKey[];
    canManageTeam: boolean;
    canWrite: boolean;
}
export declare const ROLE_DEFINITIONS: Record<TeamRole, RoleDefinition>;
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
export type BusinessType = 'Fashion & Apparel' | 'Electronics' | 'Beauty & Cosmetics' | 'Home & Living' | 'Grocery & Food' | 'Other';
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
export type CourierProvider = 'steadfast' | 'pathao';
export type CourierStatus = 'connected' | 'error';
export interface CourierAccountDTO {
    id: string;
    provider: CourierProvider;
    displayName: string;
    status: CourierStatus;
    webhookUrl: string;
    webhookSecret: string;
    deliveryChargeRate: number | null;
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
    customerName: string | null;
    consignmentId: string | null;
    itemCount: number;
    total: number;
    createdAt: string;
}
export interface CourierHandoverOrderRowDTO {
    orderId: string;
    orderNumber: string;
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
    continueSellingWhenOutOfStock: boolean;
}
export interface ProductDTO {
    id: string;
    storeId: string;
    externalId: string;
    title: string;
    description: string | null;
    category: string | null;
    images: string[];
    options: ProductOptionDTO[];
    variants: ProductVariantDTO[];
    updatedAt: string;
    groupId: string | null;
}
export interface ProductVariantInputDTO {
    sku?: string;
    price: number;
    compareAtPrice?: number;
    optionValues: string[];
    continueSellingWhenOutOfStock?: boolean;
}
export interface ProductWritePayload {
    title: string;
    description?: string;
    category?: string;
    images: string[];
    options: ProductOptionDTO[];
    variants: ProductVariantInputDTO[];
}
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
export type OrderStage = 'Pending' | 'Flagged' | 'Confirmed' | 'Processing' | 'Shipped' | 'Out for Delivery' | 'RTO Initiated' | 'QC Pending' | 'Delivered' | 'Partial Delivered' | 'Returned' | 'Cancelled' | 'On Hold';
export type OrderPaymentStatus = 'COD Pending' | 'Advance Paid' | 'Paid' | 'Collected' | 'Refunded' | 'Failed';
export type CallOutcome = 'Confirmed' | 'Rescheduled' | 'Customer Cancelled' | 'No Answer' | 'Wrong Number' | 'Switched Off' | 'Busy';
export type HoldReason = 'Payment verification pending' | 'Address needs confirmation' | 'Stock check needed' | 'Customer requested reschedule' | 'Awaiting customer response' | 'Stock shortfall found' | 'Customer unreachable for delivery' | 'Address unclear to courier' | 'Courier delay' | 'Attempting redelivery' | 'Courier dispute' | 'Customer says they never refused it' | 'Other';
export type CancelReason = 'Customer unreachable' | 'Customer changed mind' | 'Duplicate order' | 'Out of stock' | 'Fraud suspected' | 'Wrong address' | 'Price/payment dispute' | 'Blocked customer' | 'Other';
export type RiskLabel = 'Trusted' | 'Normal' | 'Risky' | 'New Customer';
export type PaymentMethod = 'Cash on Delivery' | 'bKash' | 'Nagad' | 'Rocket' | 'Card' | 'Other';
export type CourierPartner = 'Steadfast' | 'Pathao';
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
    by?: string | null;
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
    discount: number;
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
    rescheduledFor: string | null;
    isPriorityCall: boolean;
    priorityNote: string | null;
    isCustomerBlocked: boolean;
    courierPartner: CourierPartner | null;
    courierTrackingId: string | null;
    courierConsignmentId: string | null;
    courierStatus: string | null;
    courierSyncedAt: string | null;
    courierCharge: number | null;
    deliveryZone: string | null;
    callAttempts: number;
    history: OrderTimelineEventDTO[];
    returnLocation: {
        warehouseId: string;
        warehouseName: string;
        bin: string;
    } | null;
    fulfillmentWarehouseId: string | null;
    fulfillmentWarehouseName: string | null;
    cogsTotal: number | null;
    createdAt: string;
    updatedAt: string;
}
export type OrderTabKey = 'all' | 'priority' | 'pending' | 'confirmed' | 'processing' | 'shipped' | 'returning' | 'delivered' | 'codDue' | 'hold' | 'cancelled';
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
export type AnalyticsCardKey = 'orderFunnel' | 'confirmationPerformance' | 'salesOverTime' | 'aovOverTime' | 'salesByStore' | 'topProducts' | 'fulfillmentTime' | 'courierPerformance' | 'deliveryZones' | 'cancelReasons' | 'holdReasons' | 'newVsReturning' | 'topCustomers' | 'rfmSegments' | 'riskSegments' | 'customersByZone' | 'grossProfitOverTime' | 'profitByProduct' | 'salesByPaymentMethod' | 'discountsOverTime' | 'codCashflow' | 'abcAnalysis' | 'sellThrough' | 'stockoutCancellations' | 'itemsBoughtTogether' | 'returnedProducts' | 'weeklyPatterns' | 'partialDeliveryRate' | 'channelPerformance' | 'inventoryAdjustments' | 'inventoryThroughput' | 'shippingAndTracking' | 'newCustomerRevenue' | 'netSalesOverTime' | 'profitByCourier' | 'profitByZone' | 'deadStock' | 'duplicateOrders' | 'courierReconciliation' | 'marketingRoas' | 'addressQuality' | 'slaBreach' | 'callOutcomes' | 'flagReasons' | 'rescheduleEffectiveness' | 'blocklistHitRate' | 'rtoLoss' | 'marginWaterfall' | 'cohortRetention' | 'productPerformance' | 'confirmedSalesOverTime' | 'paymentStatusBreakdown' | 'employeeActivity' | 'productCourierHistory' | 'dailyLeadQuantity' | 'codChangeLog' | 'handoverSales';
export type AnalyticsCategory = 'Sales' | 'Orders' | 'Delivery' | 'Customers' | 'Finance' | 'Inventory';
export interface AnalyticsLayoutCardDTO {
    key: AnalyticsCardKey;
    hidden: boolean;
}
export interface AnalyticsLayoutDTO {
    cards: AnalyticsLayoutCardDTO[];
}
export interface MetricWithTrendDTO {
    value: number;
    trend: number | null;
}
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
export interface AnalyticsSeriesDTO {
    granularity: TrendGranularity;
    current: AnalyticsSeriesWindowDTO;
    comparison: AnalyticsSeriesWindowDTO;
    totalCurrent: number;
    totalComparison: number;
    trend: number | null;
}
export interface AnalyticsBreakdownRowDTO {
    key: string;
    label: string;
    count: number;
    value: number;
    percentage: number;
    cumulativePercentage: number;
    secondaryRate: number | null;
    secondaryValue: number | null;
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
    deliveredRate: number | null;
    rtoRate: number | null;
    compositeScore: number | null;
}
export interface ConfirmationPerformanceDTO {
    totalPending: number;
    totalConfirmed: number;
    confirmationRate: number | null;
    avgTimeToConfirmMinutes: number | null;
    avgTimeToFirstContactMinutes: number | null;
    avgCallAttempts: number | null;
    callAttemptsDistribution: {
        attempts: number;
        count: number;
    }[];
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
    current: {
        from: string;
        to: string;
        points: NewVsReturningPointDTO[];
    };
    comparison: {
        from: string;
        to: string;
        points: NewVsReturningPointDTO[];
    };
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
    cancelRate: number | null;
    rtoOrders: number;
    rtoUnits: number;
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
    avgDaysToCollect: number | null;
    series: AnalyticsSeriesDTO;
    collectedSeries: AnalyticsSeriesDTO;
}
export interface StockoutCancellationsDTO {
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
    current: {
        from: string;
        to: string;
        points: NewCustomerRevenuePointDTO[];
    };
    comparison: {
        from: string;
        to: string;
        points: NewCustomerRevenuePointDTO[];
    };
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
}
export interface DuplicateOrdersDTO {
    groups: DuplicateOrderGroupDTO[];
}
export interface CourierReconciliationRowDTO {
    provider: string;
    displayName: string;
    deliveredCodAmount: number;
    courierCharges: number;
    expectedReceivable: number;
    paid: number;
    due: number;
}
export interface CodAgingBucketDTO {
    label: string;
    count: number;
    value: number;
}
export interface CourierReconciliationDTO {
    rows: CourierReconciliationRowDTO[];
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
export interface SlaBreachDTO {
    rows: SlaBreachRowDTO[];
}
export interface HoldReasonsDTO {
    breakdown: AnalyticsBreakdownDTO;
    aging: CodAgingBucketDTO[];
}
export interface RtoLossDTO {
    totalLoss: number;
    breakdown: AnalyticsBreakdownDTO;
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
    assetIds: string[];
    headlines: string[];
    descriptions: string[];
    primaryText: string;
    platforms: AdAccountPlatform[];
    googleMarketingImageAssetId?: string;
    googleSquareImageAssetId?: string;
    googleLogoAssetId?: string;
    businessName?: string;
}
