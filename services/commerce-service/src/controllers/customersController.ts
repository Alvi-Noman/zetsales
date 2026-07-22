import type { Response } from 'express';
import { getDb } from '../utils/db.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type { CustomerRowDTO, CustomerListDTO, CustomerDetailDTO, CustomerOrderRowDTO } from '@zetsales/shared';
import { computeCustomerLifetimeStats, classifyRfmSegment, successRateOf, riskLabelOf, attachBlockedFlag } from './analyticsController.js';

// A customer "directory" the same way SuppliersPage is a supplier directory — lifetime, all-time
// facts (no date-range filter), derived by grouping orders on customerPhone since there's no
// dedicated Customer collection in this app. Reuses analyticsController's exact classification
// logic (RFM segment, risk label) so a customer's badge here always matches what Analytics shows.
export async function listCustomers(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const stats = await computeCustomerLifetimeStats(tenantId, storeId);
  const filtered = search ? stats.filter((s) => s.phone.toLowerCase().includes(search) || (s.name ?? '').toLowerCase().includes(search)) : stats;
  const blockedPhones = await attachBlockedFlag(tenantId, filtered.map((s) => s.phone));

  const rows: CustomerRowDTO[] = filtered.map((row) => ({
    phone: row.phone,
    name: row.name,
    orderCount: row.orderCount,
    totalSpend: row.totalSpend,
    deliveredRate: successRateOf(row),
    lastOrderAt: row.lastOrderAt.toISOString(),
    riskLabel: riskLabelOf(row),
    segment: classifyRfmSegment(row),
    isBlocked: blockedPhones.has(row.phone),
  }));

  const repeatCustomers = stats.filter((s) => s.orderCount >= 2);
  const totalLifetimeValue = stats.reduce((s, r) => s + r.totalSpend, 0);
  const repeatRevenue = repeatCustomers.reduce((s, r) => s + r.totalSpend, 0);

  const dto: CustomerListDTO = {
    rows,
    summary: {
      totalCustomers: stats.length,
      repeatCount: repeatCustomers.length,
      repeatRevenueShare: totalLifetimeValue > 0 ? Math.round((repeatRevenue / totalLifetimeValue) * 1000) / 10 : null,
      totalLifetimeValue,
    },
  };
  res.json({ success: true, customers: dto });
}

export async function getCustomer(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const phone = decodeURIComponent(req.params.phone);
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;

  const stats = await computeCustomerLifetimeStats(tenantId, storeId, phone);
  const row = stats[0];
  if (!row) {
    res.status(404).json({ success: false, message: 'Customer not found.' });
    return;
  }

  const db = getDb();
  const [firstOrders, recentOrders, blockedPhones] = await Promise.all([
    db.collection('orders').find({ tenantId, customerPhone: phone }).sort({ createdAt: 1 }).limit(1).toArray(),
    db.collection('orders').find({ tenantId, customerPhone: phone }).sort({ createdAt: -1 }).limit(1).toArray(),
    attachBlockedFlag(tenantId, [phone]),
  ]);
  const recentOrder = recentOrders[0];

  const dto: CustomerDetailDTO = {
    phone: row.phone,
    name: row.name,
    email: recentOrder?.customerEmail ?? null,
    address: recentOrder?.address ?? null,
    orderCount: row.orderCount,
    totalSpend: row.totalSpend,
    deliveredRate: successRateOf(row),
    riskLabel: riskLabelOf(row),
    segment: classifyRfmSegment(row),
    isBlocked: blockedPhones.has(phone),
    firstOrderAt: new Date(firstOrders[0].createdAt).toISOString(),
    lastOrderAt: row.lastOrderAt.toISOString(),
    recentOrderId: recentOrder._id.toString(),
  };
  res.json({ success: true, customer: dto });
}

export async function listCustomerOrders(req: AuthenticatedRequest, res: Response) {
  const db = getDb();
  const tenantId = req.user!.tenantId!;
  const phone = decodeURIComponent(req.params.phone);
  const orders = await db.collection('orders').find({ tenantId, customerPhone: phone }).sort({ createdAt: -1 }).limit(200).toArray();

  const rows: CustomerOrderRowDTO[] = orders.map((o) => ({
    orderId: o._id.toString(),
    number: o.number,
    createdAt: new Date(o.createdAt).toISOString(),
    stage: o.stage,
    paymentStatus: o.paymentStatus,
    total: o.total,
  }));
  res.json({ success: true, orders: rows });
}
