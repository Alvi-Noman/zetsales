export const MODULE_KEYS = [
    'home',
    'orders',
    'products',
    'inventory',
    'preOrders',
    'printOut',
    'customers',
    'adPerformance',
    'customerService',
    'callCenter',
    'fraudChecker',
    'supplyChain',
    'accounting',
    'analytics',
    'integrations',
    'team',
    'settings',
];
// The subset of modules that a tenant must explicitly "install" (see PluginsPage /
// pluginsController) before they're usable at all — independent of and in addition to
// the role check below. Everything else is a "core" module: visible whenever the
// signed-in user's role permits it, no install step needed.
export const PLUGIN_MODULES = ['fraudChecker', 'callCenter', 'adPerformance', 'customerService'];
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
        description: 'Runs day-to-day operations across orders, catalog, and stock.',
        modules: [
            'home',
            'orders',
            'products',
            'inventory',
            'preOrders',
            'printOut',
            'customers',
            'adPerformance',
            'customerService',
            'callCenter',
            'fraudChecker',
            'supplyChain',
            'analytics',
        ],
        canManageTeam: false,
        canWrite: true,
    },
    agent: {
        role: 'agent',
        label: 'Order Agent',
        description: 'Confirms orders and handles customer conversations.',
        modules: ['home', 'orders', 'customerService', 'callCenter', 'customers'],
        canManageTeam: false,
        canWrite: true,
    },
    viewer: {
        role: 'viewer',
        label: 'Viewer',
        description: 'Read-only access for reporting and oversight.',
        modules: ['home', 'orders', 'products', 'inventory', 'preOrders', 'customers', 'analytics'],
        canManageTeam: false,
        canWrite: false,
    },
};
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
