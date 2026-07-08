import type { AdAccountDTO, AdCampaignDTO, AdCreativeAssetDTO, CreateAdCampaignPayload, AdChannel, AdCostEntryDTO, AdPerformanceReportDTO, BulkOrderResultDTO, CallOutcome, CancelReason, CourierAccountDTO, CourierSettlementDTO, CourierHandoverDTO, CourierHandoverDetailDTO, EligibleHandoverOrderDTO, CustomerListDTO, CustomerDetailDTO, CustomerOrderRowDTO, HoldReason, OrderDTO, OrderRiskDTO, OrderStage, OrderStatsDTO, OrderTabKey, OrderTrendsDTO, ProductDTO, ProductListItemDTO, ProductPushResultDTO, ProductWritePayload, StoreDTO } from '@zetsales/shared';
import { api } from './api';

export async function getCapabilities() {
  const res = await api.get('/commerce/capabilities');
  return res.data as {
    success: boolean;
    shopifyOAuthEnabled: boolean;
    metaAdsOAuthEnabled: boolean;
    tiktokAdsOAuthEnabled: boolean;
    googleAdsOAuthEnabled: boolean;
  };
}

export async function listStores() {
  const res = await api.get('/commerce/stores');
  return res.data.stores as StoreDTO[];
}

export async function removeStore(storeId: string) {
  await api.delete(`/commerce/stores/${storeId}`);
}

export async function connectShopifyCustomApp(
  shopDomain: string,
  creds: { accessToken: string } | { clientId: string; clientSecret: string }
) {
  const res = await api.post('/commerce/stores/shopify/token', { shopDomain, ...creds });
  return res.data.store as StoreDTO;
}

export function shopifyOAuthStartUrl(shopDomain: string) {
  return `/api/v1/commerce/stores/shopify/oauth/start?shop=${encodeURIComponent(shopDomain)}`;
}

export async function connectWooKeys(siteUrl: string, consumerKey: string, consumerSecret: string) {
  const res = await api.post('/commerce/stores/woocommerce/keys', { siteUrl, consumerKey, consumerSecret });
  return res.data.store as StoreDTO;
}

export async function startWooAuth(siteUrl: string) {
  const res = await api.get('/commerce/stores/woocommerce/auth/start', { params: { siteUrl } });
  return res.data as { success: boolean; sessionId: string; authorizeUrl: string };
}

export async function wooAuthStatus(sessionId: string) {
  const res = await api.get(`/commerce/stores/woocommerce/auth/status/${sessionId}`);
  return res.data as { success: boolean; status: 'pending' | 'connected'; store?: StoreDTO };
}

// --- Courier Integration ---

export async function listCouriers() {
  const res = await api.get('/commerce/couriers');
  return res.data as { success: boolean; couriers: CourierAccountDTO[] };
}

export async function connectSteadfast(payload: { apiKey: string; secretKey: string; displayName?: string }) {
  const res = await api.post('/commerce/couriers/steadfast', payload);
  return res.data as { success: boolean; courier: CourierAccountDTO };
}

export async function connectPathao(payload: {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  storeId: string;
  displayName?: string;
}) {
  const res = await api.post('/commerce/couriers/pathao', payload);
  return res.data as { success: boolean; courier: CourierAccountDTO };
}

export async function removeCourier(courierId: string) {
  await api.delete(`/commerce/couriers/${courierId}`);
}

export async function regenerateCourierWebhookSecret(courierId: string) {
  const res = await api.post(`/commerce/couriers/${courierId}/regenerate-secret`, {});
  return res.data as { success: boolean; courier: CourierAccountDTO };
}

export async function updateCourierChargeRate(courierId: string, deliveryChargeRate: number | null) {
  const res = await api.patch(`/commerce/couriers/${courierId}/charge-rate`, { deliveryChargeRate });
  return res.data as { success: boolean; courier: CourierAccountDTO };
}

export async function listCourierSettlements(courierId: string) {
  const res = await api.get(`/commerce/couriers/${courierId}/settlements`);
  return res.data as { success: boolean; settlements: CourierSettlementDTO[] };
}

export async function createCourierSettlement(courierId: string, payload: { amount: number; settledAt: string; reference?: string; note?: string }) {
  const res = await api.post(`/commerce/couriers/${courierId}/settlements`, payload);
  return res.data as { success: boolean; settlement: CourierSettlementDTO };
}

export async function deleteCourierSettlement(settlementId: string) {
  await api.delete(`/commerce/couriers/settlements/${settlementId}`);
}

export async function listEligibleHandoverOrders(courierId: string) {
  const res = await api.get(`/commerce/couriers/${courierId}/eligible-handover-orders`);
  return res.data as { success: boolean; orders: EligibleHandoverOrderDTO[] };
}

export async function listCourierHandovers(courierId: string) {
  const res = await api.get(`/commerce/couriers/${courierId}/handovers`);
  return res.data as { success: boolean; handovers: CourierHandoverDTO[] };
}

export async function createCourierHandover(courierId: string, payload: { handoverDate: string; orderIds: string[]; note?: string }) {
  const res = await api.post(`/commerce/couriers/${courierId}/handovers`, payload);
  return res.data as { success: boolean; handover: CourierHandoverDTO };
}

export async function getCourierHandover(handoverId: string) {
  const res = await api.get(`/commerce/couriers/handovers/${handoverId}`);
  return res.data as { success: boolean; handover: CourierHandoverDetailDTO };
}

export async function confirmCourierHandover(handoverId: string, note?: string) {
  const res = await api.patch(`/commerce/couriers/handovers/${handoverId}/confirm`, { note });
  return res.data as { success: boolean; handover: CourierHandoverDTO };
}

export async function deleteCourierHandover(handoverId: string) {
  await api.delete(`/commerce/couriers/handovers/${handoverId}`);
}

export interface ListProductsParams {
  storeId?: string;
  search?: string;
  sortKey?: 'title' | 'price' | 'stock' | 'updated';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export async function listProducts(params: ListProductsParams = {}) {
  const res = await api.get('/commerce/products', { params });
  return res.data as { success: boolean; products: ProductListItemDTO[]; total: number; page: number; pageSize: number };
}

export async function createProduct(payload: ProductWritePayload & { storeIds: string[] }) {
  const res = await api.post('/commerce/products', payload);
  return res.data as { success: boolean; results: ProductPushResultDTO[] };
}

export async function uploadProductImages(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append('images', f));
  const res = await api.post('/commerce/products/uploads', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data as { success: boolean; urls: string[] };
}

export interface ProductStoreRef {
  storeId: string;
  displayName: string;
  platform: 'shopify' | 'woocommerce';
}

export async function getProduct(id: string) {
  const res = await api.get(`/commerce/products/${id}`);
  return res.data as { success: boolean; product: ProductDTO; ownStore: ProductStoreRef | null; siblings: ProductStoreRef[] };
}

export async function findProductByUrl(url: string) {
  const res = await api.get('/commerce/products/by-url', { params: { url } });
  return res.data as { success: boolean; product: { id: string; title: string } | null };
}

export async function updateProduct(id: string, payload: ProductWritePayload) {
  const res = await api.patch(`/commerce/products/${id}`, payload);
  return res.data as { success: boolean; results: ProductPushResultDTO[] };
}

export async function deleteProduct(id: string, storeIds: string[]) {
  const res = await api.delete(`/commerce/products/${id}`, { data: { storeIds } });
  return res.data as { success: boolean; results: ProductPushResultDTO[] };
}

// Keyed by productId+variantId (always unique), NOT sku: confirmed against the live catalog that
// 664 of 666 multi-variant products have two or more variants sharing the identical SKU (e.g. a
// product's "Black" and "White" variants both carrying the same SKU) — real data, not an edge
// case. sku/productTitle/variantLabel are denormalized display snapshots; the id pair is the
// source of truth, so a shared/duplicate SKU can never merge two distinct variants' stock.
export interface InventoryLevelDTO {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  productTitle: string | null;
  productImage: string | null;
  variantLabel: string | null;
  warehouseId: string;
  warehouseName: string;
  bin: string;
  onHand: number;
  reserved: number;
  inbound: number;
  unitCost: number | null;
  // Weighted-average landed cost of whatever's still marked `inbound` (not yet received) — kept
  // separate from `unitCost` (the onHand average) so a new shipment logged at a different price
  // never corrupts the valuation of stock already on hand.
  pendingUnitCost: number | null;
  reorderPoint: number | null;
  updatedAt: string;
  createdAt: string;
}

export interface InventoryMovementDTO {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  productTitle: string | null;
  variantLabel: string | null;
  warehouseId: string;
  warehouseName: string;
  bin: string;
  quantityBefore: number;
  quantityAfter: number;
  delta: number;
  quantity: number;
  unitCost: number | null;
  valueDelta: number | null;
  reason: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export type SupplierPaymentType = 'prepaid' | 'credit';

export interface SupplierDTO {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  leadTimeDays: number | null;
  paymentTerms: string | null;
  // 'prepaid' — cash already left the business before the shipment ships, so open shipments from
  // this supplier are inventory-in-transit, not a debt. 'credit' — genuinely owed, unpaid. Defaults
  // to 'prepaid' server-side for any supplier that's never had this set.
  paymentType: SupplierPaymentType;
  note: string | null;
  createdAt: string;
}

export interface InventorySkuOptionDTO {
  productId: string;
  variantId: string;
  sku: string | null;
  productTitle: string;
  productImage: string | null;
  variantLabel: string;
}

export async function listInventory() {
  const res = await api.get('/commerce/inventory');
  return res.data as { success: boolean; levels: InventoryLevelDTO[]; movements: InventoryMovementDTO[]; velocityByVariantId: Record<string, number> };
}

export interface ListMovementsParams {
  search?: string;
  reason?: string;
  warehouseId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export async function listMovements(params: ListMovementsParams = {}) {
  const res = await api.get('/commerce/inventory/movements', { params });
  return res.data as { success: boolean; movements: InventoryMovementDTO[]; total: number; page: number; pageSize: number; reasons: string[] };
}

export async function listInventorySkuOptions(search?: string) {
  const res = await api.get('/commerce/inventory/skus', { params: { search } });
  return res.data as { success: boolean; options: InventorySkuOptionDTO[] };
}

export async function listBins(warehouseId: string) {
  const res = await api.get('/commerce/inventory/bins', { params: { warehouseId } });
  return res.data as { success: boolean; bins: string[] };
}

export interface WarehouseDTO {
  id: string;
  name: string;
  bins: string[];
  // Bins genuinely in use (a real count, shipment, or the QC holding location Returns to process
  // creates on its own) that were never manually added via Manage warehouses — read-only here.
  systemBins: string[];
  createdAt: string;
  updatedAt: string;
}

export async function listWarehouses() {
  const res = await api.get('/commerce/warehouses');
  return res.data as { success: boolean; warehouses: WarehouseDTO[] };
}

export async function createWarehouse(name: string) {
  const res = await api.post('/commerce/warehouses', { name });
  return res.data as { success: boolean; warehouse: WarehouseDTO };
}

export async function renameWarehouse(id: string, name: string) {
  const res = await api.patch(`/commerce/warehouses/${id}`, { name });
  return res.data as { success: boolean; warehouse: WarehouseDTO };
}

export async function deleteWarehouse(id: string) {
  const res = await api.delete(`/commerce/warehouses/${id}`);
  return res.data as { success: boolean; message?: string };
}

export async function addWarehouseBin(id: string, name: string) {
  const res = await api.post(`/commerce/warehouses/${id}/bins`, { name });
  return res.data as { success: boolean; warehouse: WarehouseDTO };
}

export async function removeWarehouseBin(id: string, name: string) {
  const res = await api.post(`/commerce/warehouses/${id}/bins/remove`, { name });
  return res.data as { success: boolean; warehouse: WarehouseDTO };
}

export interface DeliveryZoneDTO {
  id: string;
  name: string;
  createdAt: string;
}

export async function listDeliveryZones() {
  const res = await api.get('/commerce/delivery-zones');
  return res.data as { success: boolean; zones: DeliveryZoneDTO[] };
}

// Reused for both "pick an existing zone" and "type a brand new one" — the backend quietly returns
// the existing match instead of erroring on a case-insensitive collision, so calling this with a
// name that already exists (just typed differently) is always safe.
export async function createDeliveryZone(name: string) {
  const res = await api.post('/commerce/delivery-zones', { name });
  return res.data as { success: boolean; zone: DeliveryZoneDTO };
}

export async function deleteDeliveryZone(id: string) {
  const res = await api.delete(`/commerce/delivery-zones/${id}`);
  return res.data as { success: boolean; message?: string };
}

export async function setInventoryReorderPoint(levelId: string, reorderPoint: number | null) {
  const res = await api.patch(`/commerce/inventory/levels/${levelId}`, { reorderPoint });
  return res.data as { success: boolean; level: InventoryLevelDTO };
}

export async function receiveInboundStock(levelId: string, quantity: number) {
  const res = await api.post(`/commerce/inventory/levels/${levelId}/receive-inbound`, { quantity });
  return res.data as { success: boolean; level: InventoryLevelDTO; movement: InventoryMovementDTO };
}

export type InboundWriteOffReason = 'Short-shipped by supplier' | 'Lost in transit' | 'Damaged on arrival' | 'Wrong entry';

export async function writeOffInboundStock(levelId: string, reason: InboundWriteOffReason) {
  const res = await api.post(`/commerce/inventory/levels/${levelId}/write-off-inbound`, { reason });
  return res.data as { success: boolean; level: InventoryLevelDTO; movement: InventoryMovementDTO; message?: string };
}

export interface ShrinkageReportDTO {
  totalUnitsLost: number;
  totalValueLost: number;
  // Recoveries: units/value logged under the dedicated "Found stock" reason, netted against the
  // gross totals above. The gross totals themselves are never altered — this is an additional
  // offset shown alongside them, not a rewrite of what was originally lost.
  recoveredUnits: number;
  recoveredValue: number;
  netUnitsLost: number;
  netValueLost: number;
  byReason: { reason: string; units: number; value: number }[];
  byVariant: { variantId: string | null; productTitle: string | null; variantLabel: string | null; units: number; value: number }[];
  movements: InventoryMovementDTO[];
}

export async function getShrinkageReport(params: { dateFrom?: string; dateTo?: string } = {}) {
  const res = await api.get('/commerce/inventory/shrinkage', { params });
  return res.data as { success: boolean } & ShrinkageReportDTO;
}

export interface OverdueShipmentDTO {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  productTitle: string | null;
  variantLabel: string | null;
  warehouseId: string;
  warehouseName: string;
  bin: string;
  supplierId: string | null;
  supplierName: string | null;
  quantityOutstanding: number;
  expectedAt: string;
  daysOverdue: number;
}

export async function getOverdueShipments() {
  const res = await api.get('/commerce/inventory/overdue-shipments');
  return res.data as { success: boolean; shipments: OverdueShipmentDTO[] };
}

export interface ReservationDTO {
  orderId: string;
  orderNumber: string;
  stage: string;
  customerName: string | null;
  quantity: number;
}

export async function getLevelReservations(levelId: string) {
  const res = await api.get(`/commerce/inventory/levels/${levelId}/reservations`);
  return res.data as { success: boolean; orders: ReservationDTO[] };
}

export interface CountContextDTO {
  onHand: number;
  physicallyAbsentQuantity: number;
  awaitingQcHereQuantity: number;
  expectedPhysicalCount: number;
  isMultiLocation: boolean;
}

export async function getCountContext(productId: string, variantId: string, warehouseId: string, bin: string) {
  const res = await api.get('/commerce/inventory/count-context', { params: { productId, variantId, warehouseId, bin } });
  return res.data as { success: boolean } & CountContextDTO;
}

export interface ReturnsPackageLineItemDTO {
  sku: string | null;
  variant: string | null;
  title: string;
  image: string | null;
  quantity: number;
}

export interface ReturnsPackageDTO {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  isPartial: boolean;
  lineItems: ReturnsPackageLineItemDTO[];
  waitingSince: string;
  // If true, this package's order is currently On Hold — still shown here (not silently hidden)
  // but shouldn't be actioned until it's resumed from the Orders page.
  isHeld: boolean;
  holdReason: string | null;
  // Where this order's stock actually shipped from — the same pickup point a courier's RTO
  // physically returns to. Null for orders placed before this was tracked, or whose SKU was never
  // matched to a tracked inventory location.
  fulfillmentWarehouseId: string | null;
  fulfillmentWarehouseName: string | null;
}

export async function getReturnsQueue(warehouseId?: string) {
  const res = await api.get('/commerce/inventory/returns-queue', { params: { warehouseId: warehouseId || undefined } });
  return res.data as { success: boolean; awaitingReceipt: ReturnsPackageDTO[]; awaitingQc: ReturnsPackageDTO[] };
}

export interface ReturnsPackageActionPayload {
  isPartial: boolean;
  location?: { warehouseId: string; warehouseName: string; bin: string };
}

export async function receiveReturnPackage(orderId: string, payload: ReturnsPackageActionPayload) {
  const res = await api.post(`/commerce/inventory/returns/${orderId}/receive`, payload);
  return res.data as { success: boolean; message?: string };
}

export interface QcResult {
  sku: string | null;
  variant: string | null;
  goodQuantity: number;
  badReason?: 'Damaged stock' | 'Lost in transit' | 'Wrong Product';
  receivedInstead?: { sku: string | null; variant: string; title: string } | null;
}

export interface ConfirmQcPayload {
  isPartial: boolean;
  results: QcResult[];
}

export async function confirmReturnPackageQc(orderId: string, payload: ConfirmQcPayload) {
  const res = await api.post(`/commerce/inventory/returns/${orderId}/confirm-qc`, payload);
  return res.data as { success: boolean; message?: string };
}

export interface ReceiveAndConfirmPayload {
  isPartial: boolean;
  location?: { warehouseId: string; warehouseName: string; bin: string };
  results: QcResult[];
}

export async function receiveAndConfirmReturnPackage(orderId: string, payload: ReceiveAndConfirmPayload) {
  const res = await api.post(`/commerce/inventory/returns/${orderId}/receive-and-confirm`, payload);
  return res.data as { success: boolean; message?: string };
}

export interface ManualReturnSearchResultDTO {
  orderId: string;
  orderNumber: string;
  customerName: string | null;
  deliveredAt: string;
  lineItems: ReturnsPackageLineItemDTO[];
}

export async function searchDeliveredOrders(query: string) {
  const res = await api.get('/commerce/inventory/returns/search', { params: { q: query } });
  return res.data as { success: boolean; orders: ManualReturnSearchResultDTO[] };
}

export async function processManualReturn(orderId: string, results: QcResult[]) {
  const res = await api.post(`/commerce/inventory/returns/${orderId}/manual-return`, { results });
  return res.data as { success: boolean; message?: string };
}

export type ReturnsWorkflow = 'combined' | 'separate';

export async function getInventorySettings() {
  const res = await api.get('/commerce/inventory/settings');
  return res.data as { success: boolean; settings: { returnsWorkflow: ReturnsWorkflow } };
}

export async function updateInventorySettings(returnsWorkflow: ReturnsWorkflow) {
  const res = await api.patch('/commerce/inventory/settings', { returnsWorkflow });
  return res.data as { success: boolean; settings: { returnsWorkflow: ReturnsWorkflow } };
}

export async function listSuppliers() {
  const res = await api.get('/commerce/suppliers');
  return res.data as { success: boolean; suppliers: SupplierDTO[] };
}

export async function createSupplier(payload: { name: string; phone?: string; email?: string; leadTimeDays?: number; paymentTerms?: string; paymentType?: SupplierPaymentType; note?: string }) {
  const res = await api.post('/commerce/suppliers', payload);
  return res.data as { success: boolean; supplier: SupplierDTO };
}

export interface InventoryCountPayload {
  productId: string;
  variantId: string;
  warehouseId: string;
  warehouseName: string;
  bin: string;
  quantity: number;
  reason: 'Opening balance' | 'Cycle count' | 'Manual adjustment' | 'Damaged stock' | 'Lost' | 'Wrong entry' | 'Found stock' | 'Transfer in';
  // Same landed-cost breakdown as Incoming Stock — an Opening balance is still real stock
  // with a real cost, just not framed as "a shipment."
  unitPrice?: number;
  shippingCost?: number;
  dutiesCost?: number;
  // Only meaningful when reason is 'Opening balance' — this is real purchased stock, so it can be
  // tied to the same supplier record Incoming Stock would use.
  supplierId?: string;
  supplierName?: string;
  note?: string;
}

export async function setInventoryCount(payload: InventoryCountPayload) {
  const res = await api.post('/commerce/inventory/count', payload);
  return res.data as { success: boolean; level: InventoryLevelDTO; movement: InventoryMovementDTO };
}

export interface InventoryInboundPayload {
  productId: string;
  variantId: string;
  warehouseId: string;
  warehouseName: string;
  bin: string;
  quantity: number;
  unitPrice?: number;
  shippingCost?: number;
  dutiesCost?: number;
  supplierId?: string;
  supplierName?: string;
  expectedAt?: string;
  note?: string;
}

export async function createInventoryInbound(payload: InventoryInboundPayload) {
  const res = await api.post('/commerce/inventory/inbound', payload);
  return res.data as { success: boolean; level: InventoryLevelDTO; movement: InventoryMovementDTO };
}

export interface TransferStockPayload {
  productId: string;
  variantId: string;
  fromWarehouseId: string;
  fromWarehouseName: string;
  fromBin: string;
  toWarehouseId: string;
  toWarehouseName: string;
  toBin: string;
  quantity: number;
  note?: string;
}

export async function transferStock(payload: TransferStockPayload) {
  const res = await api.post('/commerce/inventory/transfer', payload);
  return res.data as { success: boolean; source: InventoryLevelDTO; destination: InventoryLevelDTO };
}

export interface ListOrdersParams {
  storeId?: string;
  tab?: OrderTabKey;
  paymentStatus?: string;
  holdReason?: HoldReason;
  cancelReason?: CancelReason;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  amountMin?: number;
  amountMax?: number;
  callAttemptsMin?: number;
  courierPartner?: string;
  sortKey?: 'number' | 'total' | 'date' | 'updated';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export async function listOrders(params: ListOrdersParams = {}) {
  const res = await api.get('/commerce/orders', { params });
  return res.data as { success: boolean; orders: OrderDTO[]; total: number; page: number; pageSize: number };
}

export async function getOrder(id: string) {
  const res = await api.get(`/commerce/orders/${id}`);
  return res.data as { success: boolean; order: OrderDTO; risk: OrderRiskDTO };
}

export interface UpdateOrderPayload {
  stage?: OrderStage;
  resume?: boolean;
  holdReason?: HoldReason | null;
  cancelReason?: CancelReason | null;
  flagReason?: string | null;
  note?: string | null;
  rescheduledFor?: string | null;
  isPriorityCall?: boolean;
  priorityNote?: string | null;
  courierPartner?: string | null;
  courierTrackingId?: string | null;
  courierCharge?: number | null;
  deliveryZone?: string | null;
  shippingFee?: number;
  discount?: number;
  incrementCallAttempt?: boolean;
  callOutcome?: CallOutcome;
}

export async function updateOrder(id: string, payload: UpdateOrderPayload) {
  const res = await api.patch(`/commerce/orders/${id}`, payload);
  return res.data as { success: boolean; order: OrderDTO };
}

export async function markPaymentCollected(id: string) {
  const res = await api.post(`/commerce/orders/${id}/mark-collected`, {});
  return res.data as { success: boolean; order: OrderDTO };
}

export async function bulkMarkPaymentCollected(orderIds: string[]) {
  const res = await api.post('/commerce/orders/bulk/mark-collected', { orderIds });
  return res.data as { success: boolean; matchedCount: number; modifiedCount: number };
}

export interface PartialDeliverSplit {
  sku: string | null;
  variant: string | null;
  keptQuantity: number;
}

export async function markPartialDelivered(id: string, splits: PartialDeliverSplit[]) {
  const res = await api.post(`/commerce/orders/${id}/partial-deliver`, { splits });
  return res.data as { success: boolean; order: OrderDTO };
}

export async function blockCustomer(id: string, note: string | null) {
  const res = await api.post(`/commerce/orders/${id}/block-customer`, { note });
  return res.data as { success: boolean; message?: string };
}

export async function unblockCustomer(id: string) {
  const res = await api.post(`/commerce/orders/${id}/unblock-customer`, {});
  return res.data as { success: boolean; message?: string };
}

export async function getOrderStats(params: { storeId?: string; dateFrom?: string; dateTo?: string } = {}) {
  const res = await api.get('/commerce/orders/stats', { params });
  return res.data as { success: boolean } & OrderStatsDTO;
}

export async function getOrderTrends(params: { range: string; from?: string; to?: string; storeId?: string }) {
  const res = await api.get('/commerce/orders/trends', { params });
  return res.data as { success: boolean } & OrderTrendsDTO;
}

export async function bulkUpdateOrders(orderIds: string[], patch: UpdateOrderPayload) {
  const res = await api.patch('/commerce/orders/bulk', { orderIds, patch });
  return res.data as { success: boolean; results: BulkOrderResultDTO[] };
}

// --- Accounting & Finance ---

export interface ExpenseDTO {
  id: string;
  category: string;
  amount: number;
  date: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ExpensePayload {
  category: string;
  amount: number;
  date: string;
  note?: string;
}

export async function listExpenses(params: { dateFrom?: string; dateTo?: string } = {}) {
  const res = await api.get('/commerce/accounting/expenses', { params });
  return res.data as { success: boolean; expenses: ExpenseDTO[] };
}

export async function createExpense(payload: ExpensePayload) {
  const res = await api.post('/commerce/accounting/expenses', payload);
  return res.data as { success: boolean; expense: ExpenseDTO };
}

export async function deleteExpense(id: string) {
  const res = await api.delete(`/commerce/accounting/expenses/${id}`);
  return res.data as { success: boolean; message?: string };
}

export interface ProfitAndLossDTO {
  dateFrom: string;
  dateTo: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number | null;
  shrinkage: number;
  expensesByCategory: { category: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
  netMarginPct: number | null;
  trend: { month: string; revenue: number; cogs: number; profit: number }[];
}

export async function getProfitAndLoss(params: { dateFrom?: string; dateTo?: string } = {}) {
  const res = await api.get('/commerce/accounting/pnl', { params });
  return res.data as { success: boolean } & ProfitAndLossDTO;
}

// Purely informational, point-in-time (not date-ranged like the P&L above) — never folded into
// netProfit. See accountingController.ts's getCommittedToSuppliers for why the two totals mean
// different things: 'credit' suppliers' open shipments are a real unpaid liability, 'prepaid'
// suppliers' are cash already spent, just sitting as inventory still in transit.
export interface CommittedToSuppliersTotals {
  total: number;
  overdueTotal: number;
  shipmentCount: number;
  overdueShipmentCount: number;
}

export interface CommittedToSuppliersDTO {
  owedToSuppliers: CommittedToSuppliersTotals;
  prepaidInTransit: CommittedToSuppliersTotals;
  bySupplier: {
    supplierId: string | null;
    supplierName: string;
    paymentType: SupplierPaymentType;
    total: number;
    overdueTotal: number;
    shipmentCount: number;
  }[];
}

export async function getCommittedToSuppliers() {
  const res = await api.get('/commerce/accounting/committed-to-suppliers');
  return res.data as { success: boolean } & CommittedToSuppliersDTO;
}

// --- Ad Performance ---
// Ad-cost entries are stored as Accounting expenses under the hood (see
// adPerformanceController.ts), so logging one here also shows up in Accounting > Expenses and
// counts toward P&L — this is just a product/channel-aware view over the same data.

export interface AdCostPayload {
  productId: string;
  productTitle: string;
  channel: AdChannel;
  amount: number;
  date: string;
  note?: string;
}

export async function listAdCosts(params: { productId?: string; channel?: AdChannel; dateFrom?: string; dateTo?: string } = {}) {
  const res = await api.get('/commerce/marketing/ad-costs', { params });
  return res.data as { success: boolean; entries: AdCostEntryDTO[] };
}

export async function createAdCost(payload: AdCostPayload) {
  const res = await api.post('/commerce/marketing/ad-costs', payload);
  return res.data as { success: boolean; entry: AdCostEntryDTO };
}

export async function deleteAdCost(id: string) {
  const res = await api.delete(`/commerce/marketing/ad-costs/${id}`);
  return res.data as { success: boolean; message?: string };
}

export async function getAdPerformance(params: { storeId?: string; channel?: AdChannel; range: string; from?: string; to?: string }) {
  const res = await api.get('/commerce/marketing/ad-performance', { params });
  return res.data as { success: boolean; adPerformance: AdPerformanceReportDTO };
}

// --- Ad account connections (OAuth) ---

export async function listAdAccounts() {
  const res = await api.get('/commerce/marketing/ad-accounts');
  return res.data as { success: boolean; accounts: AdAccountDTO[] };
}

export async function removeAdAccount(id: string) {
  const res = await api.delete(`/commerce/marketing/ad-accounts/${id}`);
  return res.data as { success: boolean; message?: string };
}

export function metaAdsOAuthStartUrl() {
  return '/api/v1/commerce/marketing/ad-accounts/meta/oauth/start';
}

export function tiktokAdsOAuthStartUrl() {
  return '/api/v1/commerce/marketing/ad-accounts/tiktok/oauth/start';
}

export function googleAdsOAuthStartUrl() {
  return '/api/v1/commerce/marketing/ad-accounts/google/oauth/start';
}

// --- Ad campaign creation ("Unified Campaign") ---

export async function uploadAdCreatives(files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const res = await api.post('/commerce/marketing/ad-creatives/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return res.data as { success: boolean; assets: AdCreativeAssetDTO[] };
}

export async function listAdCreatives() {
  const res = await api.get('/commerce/marketing/ad-creatives');
  return res.data as { success: boolean; assets: AdCreativeAssetDTO[] };
}

export async function deleteAdCreative(id: string) {
  const res = await api.delete(`/commerce/marketing/ad-creatives/${id}`);
  return res.data as { success: boolean; message?: string };
}

export async function createCampaign(payload: CreateAdCampaignPayload) {
  const res = await api.post('/commerce/marketing/campaigns', payload);
  return res.data as { success: boolean; campaign: AdCampaignDTO; message?: string };
}

export async function listCampaigns() {
  const res = await api.get('/commerce/marketing/campaigns');
  return res.data as { success: boolean; campaigns: AdCampaignDTO[] };
}

export async function activateCampaign(id: string, platform: 'meta' | 'google' | 'tiktok') {
  const res = await api.post(`/commerce/marketing/campaigns/${id}/activate/${platform}`, {});
  return res.data as { success: boolean; message?: string };
}

export async function pauseCampaign(id: string, platform: 'meta' | 'google' | 'tiktok') {
  const res = await api.post(`/commerce/marketing/campaigns/${id}/pause/${platform}`, {});
  return res.data as { success: boolean; message?: string };
}

// ---- Suppliers: transaction history & spend analytics ----

export interface SupplierOverviewDTO extends SupplierDTO {
  totalSpend: number;
  totalUnits: number;
  shipmentCount: number;
  lastTransactionAt: string | null;
}

export async function listSupplierOverviews() {
  const res = await api.get('/commerce/supply-chain/suppliers');
  return res.data as { success: boolean; suppliers: SupplierOverviewDTO[] };
}

export async function getSupplier(id: string) {
  const res = await api.get(`/commerce/supply-chain/suppliers/${id}`);
  return res.data as { success: boolean; supplier: SupplierDTO };
}

// Same upsert-by-name logic as createSupplier() above, mounted under the supplyChain module gate
// instead of inventory — so the Suppliers page's own "Add supplier" works under its own permission,
// not borrowed from Inventory's.
export async function createSupplierRecord(payload: { name: string; phone?: string; email?: string; leadTimeDays?: number; paymentTerms?: string; paymentType?: SupplierPaymentType; note?: string }) {
  const res = await api.post('/commerce/supply-chain/suppliers', payload);
  return res.data as { success: boolean; supplier: SupplierDTO };
}

export interface SupplierUpdatePayload {
  name?: string;
  phone?: string;
  email?: string;
  leadTimeDays?: number | null;
  paymentTerms?: string;
  paymentType?: SupplierPaymentType;
  note?: string;
}

export async function updateSupplier(id: string, payload: SupplierUpdatePayload) {
  const res = await api.patch(`/commerce/supply-chain/suppliers/${id}`, payload);
  return res.data as { success: boolean; supplier?: SupplierDTO; message?: string };
}

export async function deleteSupplier(id: string) {
  const res = await api.delete(`/commerce/supply-chain/suppliers/${id}`);
  return res.data as { success: boolean; message?: string };
}

// Only ever 'Opening balance' or 'Incoming Stock' — the two events always correctly attributed to
// a supplier at the moment they're logged (see suppliersController.ts).
export interface SupplierTransactionDTO {
  id: string;
  reason: 'Opening balance' | 'Incoming Stock';
  createdAt: string;
  createdBy: string | null;
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  productTitle: string | null;
  variantLabel: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  bin: string | null;
  quantity: number;
  unitCost: number | null;
  valueDelta: number | null;
  unitPrice: number | null;
  shippingCostTotal: number | null;
  dutiesCostTotal: number | null;
  expectedAt: string | null;
  note: string | null;
}

export async function listSupplierTransactions(
  id: string,
  params: { dateFrom?: string; dateTo?: string; reason?: string; sku?: string; page?: number; pageSize?: number } = {}
) {
  const res = await api.get(`/commerce/supply-chain/suppliers/${id}/transactions`, { params });
  return res.data as { success: boolean; transactions: SupplierTransactionDTO[]; total: number; page: number; pageSize: number };
}

export interface SupplierWrittenOffBucket {
  units: number;
  value: number;
}

export interface SupplierSummaryDTO {
  dateFrom: string;
  dateTo: string;
  totalSpend: number;
  totalUnits: number;
  shipmentCount: number;
  openingBalanceCount: number;
  avgLandedCost: number | null;
  lastTransactionAt: string | null;
  // Fulfillment fields — of shipments logged in this range, how much has been received / is still
  // outstanding / was written off (as of right now, not necessarily during this exact window; see
  // the caption on the Supplier detail page). Pick "All time" as the range for a live snapshot.
  totalOrdered: number;
  totalReceived: number;
  outstandingUnits: number;
  outstandingValue: number;
  writtenOff: {
    shortShipped: SupplierWrittenOffBucket;
    lostInTransit: SupplierWrittenOffBucket;
    damagedOnArrival: SupplierWrittenOffBucket;
  };
  trend: { month: string; spend: number; units: number }[];
  topProducts: { productId: string | null; variantId: string | null; sku: string | null; productTitle: string | null; variantLabel: string | null; spend: number; units: number }[];
}

export async function getSupplierSummary(id: string, params: { dateFrom?: string; dateTo?: string } = {}) {
  const res = await api.get(`/commerce/supply-chain/suppliers/${id}/summary`, { params });
  return res.data as { success: boolean } & SupplierSummaryDTO;
}

export interface ShipmentDTO {
  id: string;
  createdAt: string;
  closedAt: string | null;
  status: 'open' | 'closed';
  productId: string | null;
  variantId: string | null;
  sku: string | null;
  productTitle: string | null;
  variantLabel: string | null;
  warehouseId: string | null;
  warehouseName: string | null;
  bin: string | null;
  quantityOrdered: number;
  quantityReceived: number;
  quantityWrittenOff: number;
  outstanding: number;
  writtenOffByReason: { shortShipped: number; lostInTransit: number; damagedOnArrival: number };
  unitCost: number | null;
  expectedAt: string | null;
}

export async function listSupplierShipments(
  id: string,
  params: { dateFrom?: string; dateTo?: string; status?: 'open' | 'closed'; page?: number; pageSize?: number } = {}
) {
  const res = await api.get(`/commerce/supply-chain/suppliers/${id}/shipments`, { params });
  return res.data as { success: boolean; shipments: ShipmentDTO[]; total: number; page: number; pageSize: number };
}

// ---- Customers: lifetime directory + per-customer profile, derived from orders grouped by phone ----

export async function listCustomers(params: { search?: string; storeId?: string } = {}) {
  const res = await api.get('/commerce/customers', { params });
  return res.data as { success: boolean; customers: CustomerListDTO };
}

export async function getCustomer(phone: string, params: { storeId?: string } = {}) {
  const res = await api.get(`/commerce/customers/${encodeURIComponent(phone)}`, { params });
  return res.data as { success: boolean; customer: CustomerDetailDTO };
}

export async function listCustomerOrders(phone: string) {
  const res = await api.get(`/commerce/customers/${encodeURIComponent(phone)}/orders`);
  return res.data as { success: boolean; orders: CustomerOrderRowDTO[] };
}
