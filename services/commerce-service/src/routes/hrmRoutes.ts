import { Router } from 'express';
import { requireAuth, requireTenant, requirePlugin, requireModule } from '../middleware/authMiddleware.js';
import {
  getHrmDashboard,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  setEmployeePin,
  clearEmployeePin,
  listAttendance,
  checkIn,
  checkOut,
  markAttendance,
  listLeaveRequests,
  createLeaveRequest,
  decideLeaveRequest,
  cancelLeaveRequest,
  listPayroll,
  generatePayroll,
  markPayrollPaid,
} from '../controllers/hrmController.js';

const router: Router = Router();
const guard = [requireAuth, requireTenant, requirePlugin('hrm'), requireModule('hrm')] as const;

router.get('/hrm/dashboard', ...guard, getHrmDashboard);

router.get('/hrm/departments', ...guard, listDepartments);
router.post('/hrm/departments', ...guard, createDepartment);
router.patch('/hrm/departments/:id', ...guard, updateDepartment);
router.delete('/hrm/departments/:id', ...guard, deleteDepartment);

router.get('/hrm/employees', ...guard, listEmployees);
router.post('/hrm/employees', ...guard, createEmployee);
router.patch('/hrm/employees/:id', ...guard, updateEmployee);
router.delete('/hrm/employees/:id', ...guard, deleteEmployee);
router.post('/hrm/employees/:id/pin', ...guard, setEmployeePin);
router.delete('/hrm/employees/:id/pin', ...guard, clearEmployeePin);

router.get('/hrm/attendance', ...guard, listAttendance);
router.post('/hrm/attendance/check-in', ...guard, checkIn);
router.post('/hrm/attendance/check-out', ...guard, checkOut);
router.post('/hrm/attendance/mark', ...guard, markAttendance);

router.get('/hrm/leave-requests', ...guard, listLeaveRequests);
router.post('/hrm/leave-requests', ...guard, createLeaveRequest);
router.patch('/hrm/leave-requests/:id/decision', ...guard, decideLeaveRequest);
router.delete('/hrm/leave-requests/:id', ...guard, cancelLeaveRequest);

router.get('/hrm/payroll', ...guard, listPayroll);
router.post('/hrm/payroll/generate', ...guard, generatePayroll);
router.patch('/hrm/payroll/:id/pay', ...guard, markPayrollPaid);

export default router;
