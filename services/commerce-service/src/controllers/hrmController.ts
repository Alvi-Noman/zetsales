import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import { hashPin } from '../utils/crypto.js';
import type { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import type {
  HrmAttendanceDTO,
  HrmAttendanceStatus,
  HrmDashboardDTO,
  HrmDepartmentDTO,
  HrmEmployeeDTO,
  HrmEmployeeStatus,
  HrmLeaveRequestDTO,
  HrmLeaveStatus,
  HrmLeaveType,
  HrmPayrollDTO,
} from '@zetsales/shared';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function totalBreakMs(breaks: { start: Date | string; end: Date | string | null }[] | undefined): number {
  if (!breaks) return 0;
  return breaks.reduce((sum, b) => {
    if (!b.end) return sum;
    return sum + (new Date(b.end).getTime() - new Date(b.start).getTime());
  }, 0);
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T00:00:00.000Z`);
  const to = new Date(`${toDate}T00:00:00.000Z`);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

// --- Departments ---

function toDepartmentDTO(doc: any, employeeCount: number): HrmDepartmentDTO {
  return {
    id: doc._id.toString(),
    name: doc.name,
    description: doc.description ?? null,
    employeeCount,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date(doc.createdAt).toISOString(),
  };
}

export async function listDepartments(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const db = getDb();
  const [departments, employees] = await Promise.all([
    db.collection('hrmDepartments').find({ tenantId }).sort({ name: 1 }).toArray(),
    db.collection('hrmEmployees').find({ tenantId, status: { $ne: 'terminated' } }).project({ departmentId: 1 }).toArray(),
  ]);
  const counts = new Map<string, number>();
  for (const e of employees) {
    if (!e.departmentId) continue;
    counts.set(e.departmentId, (counts.get(e.departmentId) ?? 0) + 1);
  }
  const dtos = departments.map((d) => toDepartmentDTO(d, counts.get(d._id.toString()) ?? 0));
  res.json({ success: true, departments: dtos });
}

export async function createDepartment(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { name, description } = (req.body ?? {}) as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ success: false, message: 'Department name is required.' });
    return;
  }
  const doc = { tenantId, name: name.trim(), description: description?.trim() || null, createdAt: new Date() };
  const result = await getDb().collection('hrmDepartments').insertOne(doc);
  res.status(201).json({ success: true, department: toDepartmentDTO({ ...doc, _id: result.insertedId }, 0) });
}

export async function updateDepartment(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { name, description } = (req.body ?? {}) as { name?: string; description?: string };
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name.trim();
  if (description !== undefined) update.description = description?.trim() || null;
  await getDb()
    .collection('hrmDepartments')
    .updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: update });
  res.json({ success: true });
}

export async function deleteDepartment(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  await getDb().collection('hrmDepartments').deleteOne({ _id: new ObjectId(req.params.id), tenantId });
  await getDb()
    .collection('hrmEmployees')
    .updateMany({ tenantId, departmentId: req.params.id }, { $set: { departmentId: null, departmentName: null } });
  res.json({ success: true });
}

// --- Employees ---

function toEmployeeDTO(doc: any): HrmEmployeeDTO {
  return {
    id: doc._id.toString(),
    employeeCode: doc.employeeCode,
    name: doc.name,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    departmentId: doc.departmentId ?? null,
    departmentName: doc.departmentName ?? null,
    designation: doc.designation,
    status: doc.status,
    joinDate: doc.joinDate,
    monthlySalary: doc.monthlySalary,
    address: doc.address ?? null,
    emergencyContact: doc.emergencyContact ?? null,
    notes: doc.notes ?? null,
    hasPin: !!doc.pinHash,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date(doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date(doc.updatedAt).toISOString(),
  };
}

export async function listEmployees(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const status = typeof req.query.status === 'string' ? (req.query.status as HrmEmployeeStatus) : undefined;
  const departmentId = typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

  const match: Record<string, unknown> = { tenantId };
  if (status) match.status = status;
  if (departmentId) match.departmentId = departmentId;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    match.$or = [{ name: rx }, { employeeCode: rx }, { designation: rx }, { email: rx }, { phone: rx }];
  }

  const docs = await getDb().collection('hrmEmployees').find(match).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, employees: docs.map(toEmployeeDTO) });
}

async function nextEmployeeCode(tenantId: string): Promise<string> {
  const count = await getDb().collection('hrmEmployees').countDocuments({ tenantId });
  return `EMP-${String(count + 1).padStart(4, '0')}`;
}

export async function createEmployee(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const body = (req.body ?? {}) as Partial<HrmEmployeeDTO>;
  if (!body.name?.trim() || !body.designation?.trim()) {
    res.status(400).json({ success: false, message: 'Name and designation are required.' });
    return;
  }

  let departmentName: string | null = null;
  if (body.departmentId) {
    const dept = await getDb().collection('hrmDepartments').findOne({ _id: new ObjectId(body.departmentId), tenantId });
    departmentName = dept?.name ?? null;
  }

  const now = new Date();
  const doc = {
    tenantId,
    employeeCode: await nextEmployeeCode(tenantId),
    name: body.name.trim(),
    email: body.email?.trim() || null,
    phone: body.phone?.trim() || null,
    departmentId: body.departmentId ?? null,
    departmentName,
    designation: body.designation.trim(),
    status: (body.status as HrmEmployeeStatus) ?? 'active',
    joinDate: body.joinDate ?? todayStr(),
    monthlySalary: Number(body.monthlySalary) || 0,
    address: body.address?.trim() || null,
    emergencyContact: body.emergencyContact?.trim() || null,
    notes: body.notes?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  const result = await getDb().collection('hrmEmployees').insertOne(doc);
  res.status(201).json({ success: true, employee: toEmployeeDTO({ ...doc, _id: result.insertedId }) });
}

export async function updateEmployee(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const body = (req.body ?? {}) as Partial<HrmEmployeeDTO>;
  const update: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) update.name = body.name.trim();
  if (body.email !== undefined) update.email = body.email?.trim() || null;
  if (body.phone !== undefined) update.phone = body.phone?.trim() || null;
  if (body.designation !== undefined) update.designation = body.designation.trim();
  if (body.status !== undefined) update.status = body.status;
  if (body.joinDate !== undefined) update.joinDate = body.joinDate;
  if (body.monthlySalary !== undefined) update.monthlySalary = Number(body.monthlySalary) || 0;
  if (body.address !== undefined) update.address = body.address?.trim() || null;
  if (body.emergencyContact !== undefined) update.emergencyContact = body.emergencyContact?.trim() || null;
  if (body.notes !== undefined) update.notes = body.notes?.trim() || null;
  if (body.departmentId !== undefined) {
    update.departmentId = body.departmentId || null;
    if (body.departmentId) {
      const dept = await getDb().collection('hrmDepartments').findOne({ _id: new ObjectId(body.departmentId), tenantId });
      update.departmentName = dept?.name ?? null;
    } else {
      update.departmentName = null;
    }
  }

  await getDb()
    .collection('hrmEmployees')
    .updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: update });
  res.json({ success: true });
}

export async function deleteEmployee(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  await getDb().collection('hrmEmployees').deleteOne({ _id: new ObjectId(req.params.id), tenantId });
  res.json({ success: true });
}

// Sets/resets the employee's self-service punch PIN (see hrmPunchController.ts) — the plaintext
// PIN is never stored or returned, only its hash. Also clears any lockout from prior failed
// attempts, since a freshly-set PIN invalidates whatever was being brute-forced.
export async function setEmployeePin(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { pin } = (req.body ?? {}) as { pin?: string };
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    res.status(400).json({ success: false, message: 'PIN must be 4-6 digits.' });
    return;
  }
  const result = await getDb()
    .collection('hrmEmployees')
    .updateOne(
      { _id: new ObjectId(req.params.id), tenantId },
      { $set: { pinHash: hashPin(pin), pinFailedAttempts: 0, pinLockedUntil: null } }
    );
  if (result.matchedCount === 0) {
    res.status(404).json({ success: false, message: 'Employee not found.' });
    return;
  }
  res.json({ success: true });
}

export async function clearEmployeePin(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  await getDb()
    .collection('hrmEmployees')
    .updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: { pinHash: null, pinFailedAttempts: 0, pinLockedUntil: null } });
  res.json({ success: true });
}

// --- Attendance ---

function toAttendanceDTO(doc: any): HrmAttendanceDTO {
  return {
    id: doc._id.toString(),
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    date: doc.date,
    status: doc.status,
    checkIn: doc.checkIn ? new Date(doc.checkIn).toISOString() : null,
    checkOut: doc.checkOut ? new Date(doc.checkOut).toISOString() : null,
    breaks: (doc.breaks ?? []).map((b: any) => ({
      start: new Date(b.start).toISOString(),
      end: b.end ? new Date(b.end).toISOString() : null,
    })),
    hoursWorked: doc.hoursWorked ?? null,
    note: doc.note ?? null,
    source: doc.source ?? null,
  };
}

export async function listAttendance(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const date = typeof req.query.date === 'string' ? req.query.date : todayStr();
  const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
  const match: Record<string, unknown> = { tenantId, date };
  if (employeeId) match.employeeId = employeeId;
  const docs = await getDb().collection('hrmAttendance').find(match).sort({ employeeName: 1 }).toArray();
  res.json({ success: true, attendance: docs.map(toAttendanceDTO) });
}

async function upsertAttendance(tenantId: string, employeeId: string, date: string, set: Record<string, unknown>) {
  const employee = await getDb().collection('hrmEmployees').findOne({ _id: new ObjectId(employeeId), tenantId });
  if (!employee) return null;
  await getDb()
    .collection('hrmAttendance')
    .updateOne(
      { tenantId, employeeId, date },
      { $set: { ...set, employeeName: employee.name }, $setOnInsert: { tenantId, employeeId, date } },
      { upsert: true }
    );
  return getDb().collection('hrmAttendance').findOne({ tenantId, employeeId, date });
}

export async function checkIn(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { employeeId } = (req.body ?? {}) as { employeeId?: string };
  if (!employeeId) {
    res.status(400).json({ success: false, message: 'employeeId is required.' });
    return;
  }
  const doc = await upsertAttendance(tenantId, employeeId, todayStr(), { status: 'present', checkIn: new Date(), source: 'manual' });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Employee not found.' });
    return;
  }
  res.json({ success: true, attendance: toAttendanceDTO(doc) });
}

export async function checkOut(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { employeeId } = (req.body ?? {}) as { employeeId?: string };
  if (!employeeId) {
    res.status(400).json({ success: false, message: 'employeeId is required.' });
    return;
  }
  const existing = await getDb().collection('hrmAttendance').findOne({ tenantId, employeeId, date: todayStr() });
  const checkOutAt = new Date();
  const hoursWorked = existing?.checkIn
    ? Math.round(((checkOutAt.getTime() - new Date(existing.checkIn).getTime() - totalBreakMs(existing.breaks)) / 3_600_000) * 100) / 100
    : null;
  const doc = await upsertAttendance(tenantId, employeeId, todayStr(), { checkOut: checkOutAt, hoursWorked, source: 'manual' });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Employee not found.' });
    return;
  }
  res.json({ success: true, attendance: toAttendanceDTO(doc) });
}

export async function markAttendance(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { employeeId, date, status, note } = (req.body ?? {}) as {
    employeeId?: string;
    date?: string;
    status?: HrmAttendanceStatus;
    note?: string;
  };
  if (!employeeId || !date || !status) {
    res.status(400).json({ success: false, message: 'employeeId, date, and status are required.' });
    return;
  }
  const doc = await upsertAttendance(tenantId, employeeId, date, { status, note: note?.trim() || null, source: 'manual' });
  if (!doc) {
    res.status(404).json({ success: false, message: 'Employee not found.' });
    return;
  }
  res.json({ success: true, attendance: toAttendanceDTO(doc) });
}

// --- Leave requests ---

function toLeaveDTO(doc: any): HrmLeaveRequestDTO {
  return {
    id: doc._id.toString(),
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    type: doc.type,
    fromDate: doc.fromDate,
    toDate: doc.toDate,
    days: doc.days,
    reason: doc.reason,
    status: doc.status,
    decidedBy: doc.decidedBy ?? null,
    decidedAt: doc.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date(doc.createdAt).toISOString(),
  };
}

export async function listLeaveRequests(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const status = typeof req.query.status === 'string' ? (req.query.status as HrmLeaveStatus) : undefined;
  const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
  const match: Record<string, unknown> = { tenantId };
  if (status) match.status = status;
  if (employeeId) match.employeeId = employeeId;
  const docs = await getDb().collection('hrmLeaveRequests').find(match).sort({ createdAt: -1 }).toArray();
  res.json({ success: true, leaveRequests: docs.map(toLeaveDTO) });
}

export async function createLeaveRequest(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { employeeId, type, fromDate, toDate, reason } = (req.body ?? {}) as {
    employeeId?: string;
    type?: HrmLeaveType;
    fromDate?: string;
    toDate?: string;
    reason?: string;
  };
  if (!employeeId || !type || !fromDate || !toDate || !reason?.trim()) {
    res.status(400).json({ success: false, message: 'employeeId, type, fromDate, toDate, and reason are required.' });
    return;
  }
  const employee = await getDb().collection('hrmEmployees').findOne({ _id: new ObjectId(employeeId), tenantId });
  if (!employee) {
    res.status(404).json({ success: false, message: 'Employee not found.' });
    return;
  }
  const doc = {
    tenantId,
    employeeId,
    employeeName: employee.name,
    type,
    fromDate,
    toDate,
    days: daysBetween(fromDate, toDate),
    reason: reason.trim(),
    status: 'pending' as HrmLeaveStatus,
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date(),
  };
  const result = await getDb().collection('hrmLeaveRequests').insertOne(doc);
  res.status(201).json({ success: true, leaveRequest: toLeaveDTO({ ...doc, _id: result.insertedId }) });
}

export async function decideLeaveRequest(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { status } = (req.body ?? {}) as { status?: 'approved' | 'rejected' };
  if (status !== 'approved' && status !== 'rejected') {
    res.status(400).json({ success: false, message: 'status must be approved or rejected.' });
    return;
  }
  await getDb()
    .collection('hrmLeaveRequests')
    .updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: { status, decidedBy: req.user!.email, decidedAt: new Date() } });
  res.json({ success: true });
}

export async function cancelLeaveRequest(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  await getDb()
    .collection('hrmLeaveRequests')
    .updateOne({ _id: new ObjectId(req.params.id), tenantId, status: 'pending' }, { $set: { status: 'cancelled' } });
  res.json({ success: true });
}

// --- Payroll ---

function toPayrollDTO(doc: any): HrmPayrollDTO {
  return {
    id: doc._id.toString(),
    employeeId: doc.employeeId,
    employeeName: doc.employeeName,
    month: doc.month,
    baseSalary: doc.baseSalary,
    bonus: doc.bonus,
    deductions: doc.deductions,
    unpaidLeaveDays: doc.unpaidLeaveDays,
    netPay: doc.netPay,
    status: doc.status,
    paidAt: doc.paidAt ? new Date(doc.paidAt).toISOString() : null,
    generatedAt: doc.generatedAt?.toISOString?.() ?? new Date(doc.generatedAt).toISOString(),
  };
}

export async function listPayroll(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  const match: Record<string, unknown> = { tenantId };
  if (month) match.month = month;
  const docs = await getDb().collection('hrmPayroll').find(match).sort({ generatedAt: -1 }).toArray();
  res.json({ success: true, payroll: docs.map(toPayrollDTO) });
}

// Generates one draft payroll row per active employee for the given month (idempotent — running
// it again for the same month just re-derives unpaid-leave deductions from current leave data,
// it does not duplicate rows or touch ones already marked paid).
export async function generatePayroll(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const { month } = (req.body ?? {}) as { month?: string };
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ success: false, message: 'month is required in YYYY-MM format.' });
    return;
  }

  const db = getDb();
  const employees = await db.collection('hrmEmployees').find({ tenantId, status: { $ne: 'terminated' } }).toArray();
  const monthStart = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const unpaidLeaves = await db
    .collection('hrmLeaveRequests')
    .find({ tenantId, type: 'unpaid', status: 'approved', fromDate: { $lte: monthEnd }, toDate: { $gte: monthStart } })
    .toArray();
  const unpaidDaysByEmployee = new Map<string, number>();
  for (const leave of unpaidLeaves) {
    unpaidDaysByEmployee.set(leave.employeeId, (unpaidDaysByEmployee.get(leave.employeeId) ?? 0) + leave.days);
  }

  const results: HrmPayrollDTO[] = [];
  for (const employee of employees) {
    const employeeId = employee._id.toString();
    const existing = await db.collection('hrmPayroll').findOne({ tenantId, employeeId, month });
    if (existing?.status === 'paid') {
      results.push(toPayrollDTO(existing));
      continue;
    }
    const unpaidLeaveDays = unpaidDaysByEmployee.get(employeeId) ?? 0;
    const dailyRate = employee.monthlySalary / 30;
    const deductions = Math.round(dailyRate * unpaidLeaveDays * 100) / 100;
    const netPay = Math.max(0, Math.round((employee.monthlySalary - deductions) * 100) / 100);
    const doc = {
      tenantId,
      employeeId,
      employeeName: employee.name,
      month,
      baseSalary: employee.monthlySalary,
      bonus: existing?.bonus ?? 0,
      deductions,
      unpaidLeaveDays,
      netPay,
      status: 'draft' as const,
      paidAt: null,
      generatedAt: new Date(),
    };
    await db.collection('hrmPayroll').updateOne({ tenantId, employeeId, month }, { $set: doc }, { upsert: true });
    const saved = await db.collection('hrmPayroll').findOne({ tenantId, employeeId, month });
    results.push(toPayrollDTO(saved));
  }

  res.json({ success: true, payroll: results });
}

export async function markPayrollPaid(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  await getDb()
    .collection('hrmPayroll')
    .updateOne({ _id: new ObjectId(req.params.id), tenantId }, { $set: { status: 'paid', paidAt: new Date() } });
  res.json({ success: true });
}

// --- Dashboard ---

export async function getHrmDashboard(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user!.tenantId!;
  const db = getDb();
  const date = todayStr();
  const month = date.slice(0, 7);

  const [employees, todayAttendance, pendingLeaveCount, departments, monthPayroll] = await Promise.all([
    db.collection('hrmEmployees').find({ tenantId }).project({ status: 1, departmentName: 1 }).toArray(),
    db.collection('hrmAttendance').find({ tenantId, date }).project({ status: 1 }).toArray(),
    db.collection('hrmLeaveRequests').countDocuments({ tenantId, status: 'pending' }),
    db.collection('hrmDepartments').find({ tenantId }).project({ name: 1 }).toArray(),
    db.collection('hrmPayroll').find({ tenantId, month }).project({ netPay: 1 }).toArray(),
  ]);

  const activeEmployees = employees.filter((e) => e.status === 'active').length;
  const presentToday = todayAttendance.filter((a) => a.status === 'present' || a.status === 'late' || a.status === 'halfDay').length;
  const absentToday = todayAttendance.filter((a) => a.status === 'absent').length;
  const onLeaveToday = todayAttendance.filter((a) => a.status === 'onLeave').length;

  const deptCounts = new Map<string, number>();
  for (const e of employees) {
    if (e.status === 'terminated') continue;
    const name = e.departmentName ?? 'Unassigned';
    deptCounts.set(name, (deptCounts.get(name) ?? 0) + 1);
  }
  for (const d of departments) {
    if (!deptCounts.has(d.name)) deptCounts.set(d.name, 0);
  }

  const dto: HrmDashboardDTO = {
    totalEmployees: employees.length,
    activeEmployees,
    presentToday,
    absentToday,
    onLeaveToday,
    pendingLeaveRequests: pendingLeaveCount,
    departmentBreakdown: [...deptCounts.entries()].map(([departmentName, count]) => ({ departmentName, count })),
    monthlyPayrollTotal: Math.round(monthPayroll.reduce((sum, p) => sum + p.netPay, 0) * 100) / 100,
  };

  res.json({ success: true, dashboard: dto });
}
