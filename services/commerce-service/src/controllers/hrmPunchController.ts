import type { Response } from 'express';
import { ObjectId } from 'mongodb';
import { getDb } from '../utils/db.js';
import { verifyPin } from '../utils/crypto.js';
import { totalBreakMs } from './hrmController.js';
import type { PublicTenantRequest } from '../middleware/publicTenantMiddleware.js';
import type { HrmPublicEmployeeDTO, HrmPunchAction, HrmPunchState, HrmPunchStatusDTO } from '@zetsales/shared';

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60_000;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function derivePunchState(doc: any): HrmPunchState {
  if (!doc?.checkIn) return 'notCheckedIn';
  if (doc.checkOut) return 'checkedOut';
  const openBreak = (doc.breaks ?? []).find((b: any) => !b.end);
  return openBreak ? 'onBreak' : 'checkedIn';
}

function toPunchStatusDTO(employeeName: string, employeeId: string, doc: any): HrmPunchStatusDTO {
  return {
    employeeId,
    employeeName,
    date: todayStr(),
    state: derivePunchState(doc),
    checkIn: doc?.checkIn ? new Date(doc.checkIn).toISOString() : null,
    checkOut: doc?.checkOut ? new Date(doc.checkOut).toISOString() : null,
    breaks: (doc?.breaks ?? []).map((b: any) => ({
      start: new Date(b.start).toISOString(),
      end: b.end ? new Date(b.end).toISOString() : null,
    })),
  };
}

export async function listPunchEmployees(req: PublicTenantRequest, res: Response) {
  const tenantId = req.tenant!.id;
  const docs = await getDb()
    .collection('hrmEmployees')
    .find({ tenantId, status: { $nin: ['terminated', 'suspended'] } })
    .project({ name: 1, employeeCode: 1 })
    .sort({ name: 1 })
    .toArray();
  const employees: HrmPublicEmployeeDTO[] = docs.map((d) => ({ id: d._id.toString(), name: d.name, employeeCode: d.employeeCode }));
  res.json({ success: true, employees });
}

// Shared by getPunchStatus and submitPunch — verifies PIN with a per-employee lockout (independent
// of IP, since a kiosk/shared network makes IP-based limits alone weak against a 4-6 digit PIN's
// small keyspace). Returns the employee doc on success, or null after writing an error response.
async function authenticatePunch(tenantId: string, employeeId: string, pin: string, res: Response): Promise<any | null> {
  const objectId = toObjectIdSafe(employeeId);
  if (!objectId) {
    res.status(404).json({ success: false, message: 'Employee not found or PIN not set. Ask your manager to set one up.' });
    return null;
  }
  const db = getDb();
  const employee = await db.collection('hrmEmployees').findOne({ _id: objectId, tenantId });
  if (!employee || !employee.pinHash) {
    res.status(404).json({ success: false, message: 'Employee not found or PIN not set. Ask your manager to set one up.' });
    return null;
  }
  if (employee.pinLockedUntil && new Date(employee.pinLockedUntil).getTime() > Date.now()) {
    res.status(423).json({ success: false, message: 'Too many incorrect PIN attempts. Try again in a few minutes.' });
    return null;
  }
  if (!verifyPin(pin, employee.pinHash)) {
    const attempts = (employee.pinFailedAttempts ?? 0) + 1;
    const update: Record<string, unknown> = { pinFailedAttempts: attempts };
    if (attempts >= PIN_MAX_ATTEMPTS) {
      update.pinLockedUntil = new Date(Date.now() + PIN_LOCKOUT_MS);
      update.pinFailedAttempts = 0;
    }
    await db.collection('hrmEmployees').updateOne({ _id: employee._id }, { $set: update });
    res.status(401).json({ success: false, message: 'Incorrect PIN.' });
    return null;
  }
  if (employee.pinFailedAttempts) {
    await db.collection('hrmEmployees').updateOne({ _id: employee._id }, { $set: { pinFailedAttempts: 0, pinLockedUntil: null } });
  }
  return employee;
}

// ObjectId parsing can throw on a malformed id — a public, unauthenticated endpoint must not 500
// on garbage input, so this normalizes a bad id into "not found" instead of an unhandled throw.
function toObjectIdSafe(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function getPunchStatus(req: PublicTenantRequest, res: Response) {
  const tenantId = req.tenant!.id;
  const { employeeId, pin } = (req.body ?? {}) as { employeeId?: string; pin?: string };
  if (!employeeId || !pin) {
    res.status(400).json({ success: false, message: 'employeeId and pin are required.' });
    return;
  }
  const employee = await authenticatePunch(tenantId, employeeId, pin, res);
  if (!employee) return;

  const attendance = await getDb().collection('hrmAttendance').findOne({ tenantId, employeeId, date: todayStr() });
  res.json({ success: true, status: toPunchStatusDTO(employee.name, employeeId, attendance) });
}

const VALID_TRANSITIONS: Record<HrmPunchAction, HrmPunchState> = {
  checkIn: 'notCheckedIn',
  breakStart: 'checkedIn',
  breakEnd: 'onBreak',
  checkOut: 'checkedIn',
};

export async function submitPunch(req: PublicTenantRequest, res: Response) {
  const tenantId = req.tenant!.id;
  const { employeeId, pin, action } = (req.body ?? {}) as { employeeId?: string; pin?: string; action?: HrmPunchAction };
  if (!employeeId || !pin || !action || !(action in VALID_TRANSITIONS)) {
    res.status(400).json({ success: false, message: 'employeeId, pin, and a valid action are required.' });
    return;
  }
  const employee = await authenticatePunch(tenantId, employeeId, pin, res);
  if (!employee) return;

  const db = getDb();
  const date = todayStr();
  const existing = await db.collection('hrmAttendance').findOne({ tenantId, employeeId, date });
  const currentState = derivePunchState(existing);
  if (currentState !== VALID_TRANSITIONS[action]) {
    res.status(409).json({ success: false, message: `Can't do that from the current state.` });
    return;
  }

  const now = new Date();
  const set: Record<string, unknown> = { source: 'pin' };
  if (action === 'checkIn') {
    set.status = 'present';
    set.checkIn = now;
  } else if (action === 'breakStart') {
    await db
      .collection('hrmAttendance')
      .updateOne({ tenantId, employeeId, date }, { $push: { breaks: { start: now, end: null } } as any, $set: { source: 'pin' } });
  } else if (action === 'breakEnd') {
    await db
      .collection('hrmAttendance')
      .updateOne({ tenantId, employeeId, date, 'breaks.end': null }, { $set: { 'breaks.$.end': now, source: 'pin' } });
  } else if (action === 'checkOut') {
    set.checkOut = now;
    set.hoursWorked = Math.round(((now.getTime() - new Date(existing!.checkIn).getTime() - totalBreakMs(existing!.breaks)) / 3_600_000) * 100) / 100;
  }

  if (action === 'checkIn' || action === 'checkOut') {
    await db
      .collection('hrmAttendance')
      .updateOne({ tenantId, employeeId, date }, { $set: set, $setOnInsert: { tenantId, employeeId, date, employeeName: employee.name, breaks: [] } }, { upsert: true });
  }

  const updated = await db.collection('hrmAttendance').findOne({ tenantId, employeeId, date });
  res.json({ success: true, status: toPunchStatusDTO(employee.name, employeeId, updated) });
}
