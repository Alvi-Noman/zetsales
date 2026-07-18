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
];
// The subset of modules that a tenant must explicitly "install" (see AppsPage /
// appsController) before they're usable at all — independent of and in addition to
// the role check below. Everything else is a "core" module: visible whenever the
// signed-in user's role permits it, no install step needed.
export const PLUGIN_MODULES = ['fraudChecker', 'callCenter', 'adPerformance', 'customerService', 'zetSalesAds', 'hrm'];
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
];
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
];
export const ROLE_DEFINITIONS = {
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
export function canWriteModule(role, module) {
    const definition = role ? ROLE_DEFINITIONS[role] : ROLE_DEFINITIONS.owner;
    if (!definition.canWrite)
        return false;
    return definition.writableModules ? definition.writableModules.includes(module) : true;
}
export const INVOICE_FONT_OPTIONS = ['Helvetica', 'Times New Roman', 'Georgia', 'Arial', 'Courier New'];
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
];
export const COURIER_STATUS_BUCKET_LABEL = {
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
const STEADFAST_STATUS_BUCKETS = {
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
const PATHAO_STATUS_BUCKETS = {
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
export function bucketForCourierStatus(courierPartner, courierStatus) {
    if (!courierStatus)
        return 'awaiting_sync';
    const key = courierStatus.trim().toLowerCase().replace(/\s+/g, '_');
    const table = courierPartner === 'Steadfast' ? STEADFAST_STATUS_BUCKETS : courierPartner === 'Pathao' ? PATHAO_STATUS_BUCKETS : null;
    return table?.[key] ?? 'other';
}
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
];
