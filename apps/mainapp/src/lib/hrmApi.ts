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
  HrmSettingsDTO,
  HrmSettingsInput,
} from "@zetsales/shared";
import { api } from "./api";

export async function getHrmDashboard() {
  const res = await api.get("/commerce/hrm/dashboard");
  return res.data.dashboard as HrmDashboardDTO;
}

// --- Settings ---

export async function getHrmSettings() {
  const res = await api.get("/commerce/hrm/settings");
  return res.data.settings as HrmSettingsDTO;
}

export async function updateHrmSettings(input: HrmSettingsInput) {
  const res = await api.patch("/commerce/hrm/settings", input);
  return res.data.settings as HrmSettingsDTO;
}

// --- Departments ---

export async function listHrmDepartments() {
  const res = await api.get("/commerce/hrm/departments");
  return res.data.departments as HrmDepartmentDTO[];
}

export async function createHrmDepartment(input: { name: string; description?: string }) {
  const res = await api.post("/commerce/hrm/departments", input);
  return res.data.department as HrmDepartmentDTO;
}

export async function updateHrmDepartment(id: string, input: { name?: string; description?: string }) {
  await api.patch(`/commerce/hrm/departments/${id}`, input);
}

export async function deleteHrmDepartment(id: string) {
  await api.delete(`/commerce/hrm/departments/${id}`);
}

// --- Employees ---

export interface HrmEmployeeFilters {
  status?: HrmEmployeeStatus;
  departmentId?: string;
  search?: string;
}

export async function listHrmEmployees(filters?: HrmEmployeeFilters) {
  const res = await api.get("/commerce/hrm/employees", { params: filters });
  return res.data.employees as HrmEmployeeDTO[];
}

export type HrmEmployeeInput = Partial<
  Pick<
    HrmEmployeeDTO,
    | "name"
    | "email"
    | "phone"
    | "departmentId"
    | "designation"
    | "status"
    | "joinDate"
    | "monthlySalary"
    | "address"
    | "emergencyContact"
    | "notes"
  >
>;

export async function createHrmEmployee(input: HrmEmployeeInput) {
  const res = await api.post("/commerce/hrm/employees", input);
  return res.data.employee as HrmEmployeeDTO;
}

export async function updateHrmEmployee(id: string, input: HrmEmployeeInput) {
  await api.patch(`/commerce/hrm/employees/${id}`, input);
}

export async function deleteHrmEmployee(id: string) {
  await api.delete(`/commerce/hrm/employees/${id}`);
}

export async function setHrmEmployeePin(id: string, pin: string) {
  await api.post(`/commerce/hrm/employees/${id}/pin`, { pin });
}

export async function clearHrmEmployeePin(id: string) {
  await api.delete(`/commerce/hrm/employees/${id}/pin`);
}

// --- Attendance ---

export async function listHrmAttendance(params?: { date?: string; from?: string; to?: string; employeeId?: string }) {
  const res = await api.get("/commerce/hrm/attendance", { params });
  return res.data.attendance as HrmAttendanceDTO[];
}

export async function hrmCheckIn(employeeId: string) {
  const res = await api.post("/commerce/hrm/attendance/check-in", { employeeId });
  return res.data.attendance as HrmAttendanceDTO;
}

export async function hrmCheckOut(employeeId: string) {
  const res = await api.post("/commerce/hrm/attendance/check-out", { employeeId });
  return res.data.attendance as HrmAttendanceDTO;
}

export async function markHrmAttendance(input: { employeeId: string; date: string; status: HrmAttendanceStatus; note?: string }) {
  const res = await api.post("/commerce/hrm/attendance/mark", input);
  return res.data.attendance as HrmAttendanceDTO;
}

// --- Leave requests ---

export async function listHrmLeaveRequests(params?: { status?: HrmLeaveStatus; employeeId?: string }) {
  const res = await api.get("/commerce/hrm/leave-requests", { params });
  return res.data.leaveRequests as HrmLeaveRequestDTO[];
}

export async function createHrmLeaveRequest(input: { employeeId: string; type: HrmLeaveType; fromDate: string; toDate: string; reason: string }) {
  const res = await api.post("/commerce/hrm/leave-requests", input);
  return res.data.leaveRequest as HrmLeaveRequestDTO;
}

export async function decideHrmLeaveRequest(id: string, status: "approved" | "rejected") {
  await api.patch(`/commerce/hrm/leave-requests/${id}/decision`, { status });
}

export async function cancelHrmLeaveRequest(id: string) {
  await api.delete(`/commerce/hrm/leave-requests/${id}`);
}

// --- Payroll ---

export async function listHrmPayroll(params?: { month?: string }) {
  const res = await api.get("/commerce/hrm/payroll", { params });
  return res.data.payroll as HrmPayrollDTO[];
}

export async function generateHrmPayroll(month: string) {
  const res = await api.post("/commerce/hrm/payroll/generate", { month });
  return res.data.payroll as HrmPayrollDTO[];
}

export async function markHrmPayrollPaid(id: string) {
  await api.patch(`/commerce/hrm/payroll/${id}/pay`);
}
