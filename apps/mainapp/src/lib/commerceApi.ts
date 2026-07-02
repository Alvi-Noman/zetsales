import type { BulkOrderResultDTO, CancelReason, HoldReason, OrderDTO, OrderRiskDTO, OrderStage, OrderStatsDTO, OrderTabKey, OrderTrendsDTO, ProductDTO, ProductPushResultDTO, StoreDTO } from '@zetsales/shared';
import { api } from './api';

export async function getCapabilities() {
  const res = await api.get('/commerce/capabilities');
  return res.data as { success: boolean; shopifyOAuthEnabled: boolean };
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
  return res.data as { success: boolean; products: ProductDTO[]; total: number; page: number; pageSize: number };
}

export interface ProductWritePayload {
  title: string;
  image?: string;
  price: number;
  sku?: string;
  inventory?: number;
}

export async function createProduct(payload: ProductWritePayload & { storeIds: string[] }) {
  const res = await api.post('/commerce/products', payload);
  return res.data as { success: boolean; results: ProductPushResultDTO[] };
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

export async function updateProduct(id: string, payload: ProductWritePayload) {
  const res = await api.patch(`/commerce/products/${id}`, payload);
  return res.data as { success: boolean; results: ProductPushResultDTO[] };
}

export async function deleteProduct(id: string, storeIds: string[]) {
  const res = await api.delete(`/commerce/products/${id}`, { data: { storeIds } });
  return res.data as { success: boolean; results: ProductPushResultDTO[] };
}

export interface ListOrdersParams {
  storeId?: string;
  tab?: OrderTabKey;
  paymentStatus?: string;
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
  courierPartner?: string | null;
  courierTrackingId?: string | null;
  deliveryZone?: string | null;
  shippingFee?: number;
  incrementCallAttempt?: boolean;
}

export async function updateOrder(id: string, payload: UpdateOrderPayload) {
  const res = await api.patch(`/commerce/orders/${id}`, payload);
  return res.data as { success: boolean; order: OrderDTO };
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
