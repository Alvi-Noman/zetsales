import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Building2, CalendarCheck2, ClipboardList, LayoutGrid, Settings as SettingsIcon, UserRound } from "lucide-react";
import clsx from "clsx";
import type { HrmAttendanceDTO, HrmDashboardDTO, HrmDepartmentDTO, HrmEmployeeDTO, HrmLeaveRequestDTO, HrmPayrollDTO, HrmSettingsDTO, HrmShiftDTO } from "@zetsales/shared";
import {
  getHrmDashboard,
  getHrmSettings,
  listHrmAttendance,
  listHrmDepartments,
  listHrmEmployees,
  listHrmLeaveRequests,
  listHrmPayroll,
  listHrmShifts,
} from "../../lib/hrmApi";
import { useToast } from "../../components/ui/ToastProvider";
import { OverviewTab } from "./components/OverviewTab";
import { EmployeesTab } from "./components/EmployeesTab";
import { DepartmentsTab } from "./components/DepartmentsTab";
import { AttendanceTab } from "./components/AttendanceTab";
import { LeaveTab } from "./components/LeaveTab";
import { PayrollTab } from "./components/PayrollTab";
import { SettingsTab } from "./components/SettingsTab";
import { HrmOnboardingWizard } from "./components/HrmOnboardingWizard";
import { PageTitle } from "../../components/layout/PageTitle";

type TabKey = "overview" | "employees" | "departments" | "attendance" | "leave" | "payroll" | "settings";

const TABS: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "employees", label: "Employees", icon: UserRound },
  { key: "departments", label: "Departments", icon: Building2 },
  { key: "attendance", label: "Attendance", icon: CalendarCheck2 },
  { key: "leave", label: "Leave", icon: ClipboardList },
  { key: "payroll", label: "Payroll", icon: Banknote },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

export function HrmPage() {
  const toast = useToast();
  const [tab, setTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);

  const [dashboard, setDashboard] = useState<HrmDashboardDTO | null>(null);
  const [employees, setEmployees] = useState<HrmEmployeeDTO[]>([]);
  const [departments, setDepartments] = useState<HrmDepartmentDTO[]>([]);
  const [attendance, setAttendance] = useState<HrmAttendanceDTO[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<HrmLeaveRequestDTO[]>([]);
  const [payroll, setPayroll] = useState<HrmPayrollDTO[]>([]);
  const [settings, setSettings] = useState<HrmSettingsDTO | null>(null);
  const [shifts, setShifts] = useState<HrmShiftDTO[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);

  const [attendanceDate, setAttendanceDate] = useState(todayStr());
  const [payrollMonth, setPayrollMonth] = useState(currentMonth());

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dashboardRes, employeesRes, departmentsRes, attendanceRes, leaveRes, payrollRes, settingsRes, shiftsRes] = await Promise.all([
        getHrmDashboard(),
        listHrmEmployees(),
        listHrmDepartments(),
        listHrmAttendance({ date: attendanceDate }),
        listHrmLeaveRequests(),
        listHrmPayroll({ month: payrollMonth }),
        getHrmSettings(),
        listHrmShifts(),
      ]);
      setDashboard(dashboardRes);
      setEmployees(employeesRes);
      setDepartments(departmentsRes);
      setAttendance(attendanceRes);
      setLeaveRequests(leaveRes);
      setPayroll(payrollRes);
      setSettings(settingsRes);
      setShifts(shiftsRes);
      if (!settingsRes.onboardedAt) setWizardOpen(true);
    } catch {
      toast.push("Could not load HRM data.", "info");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceDate, payrollMonth]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeEmployees = useMemo(() => employees.filter((e) => e.status !== "terminated"), [employees]);

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header">
        <PageTitle>HRM</PageTitle>
        <p className="zs-page-description">Employees, attendance, leave, and payroll — all in one place.</p>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={clsx(
                  "flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
                  tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="zs-page-body">
        {tab === "overview" && <OverviewTab dashboard={dashboard} />}
        {tab === "employees" && (
          <EmployeesTab
            employees={employees}
            departments={departments}
            shifts={shifts}
            multiShift={settings?.multiShift ?? false}
            loading={loading}
            onChanged={() => void loadAll()}
          />
        )}
        {tab === "departments" && <DepartmentsTab departments={departments} loading={loading} onChanged={() => void loadAll()} />}
        {tab === "attendance" && (
          <AttendanceTab
            employees={employees}
            attendance={attendance}
            loading={loading}
            date={attendanceDate}
            onDateChange={setAttendanceDate}
            onChanged={() => void loadAll()}
            shifts={shifts}
            multiShift={settings?.multiShift ?? false}
          />
        )}
        {tab === "leave" && (
          <LeaveTab leaveRequests={leaveRequests} employees={activeEmployees} loading={loading} onChanged={() => void loadAll()} />
        )}
        {tab === "payroll" && (
          <PayrollTab payroll={payroll} loading={loading} month={payrollMonth} onMonthChange={setPayrollMonth} onChanged={() => void loadAll()} />
        )}
        {tab === "settings" && (
          <SettingsTab
            settings={settings}
            shifts={shifts}
            loading={loading}
            onChanged={() => void loadAll()}
            onRunSetupGuide={() => setWizardOpen(true)}
          />
        )}
      </div>

      <HrmOnboardingWizard
        open={wizardOpen}
        departments={departments}
        onDepartmentAdded={() => void loadAll()}
        shifts={shifts}
        onShiftAdded={() => void loadAll()}
        employees={employees}
        onEmployeeUpdated={() => void loadAll()}
        onFinished={() => {
          setWizardOpen(false);
          void loadAll();
        }}
      />
    </div>
  );
}
