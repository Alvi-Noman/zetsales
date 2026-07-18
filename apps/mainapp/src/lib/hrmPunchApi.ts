import axios from "axios";
import type { HrmPublicEmployeeDTO, HrmPunchAction, HrmPunchStatusDTO } from "@zetsales/shared";

// A separate axios instance from ./api — the punch page is unauthenticated (no login, no
// cookie), and its tenant is resolved server-side from the subdomain, so this deliberately
// doesn't share the main api client's auth-error handling or credentials behavior.
const punchApi = axios.create({ baseURL: "/api/v1", withCredentials: false });

punchApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.message || err.message || "Something went wrong";
    return Promise.reject(new Error(message));
  }
);

export async function listPunchEmployees() {
  const res = await punchApi.get("/commerce/public/hrm/employees");
  return res.data.employees as HrmPublicEmployeeDTO[];
}

export async function getPunchStatus(employeeId: string, pin: string) {
  const res = await punchApi.post("/commerce/public/hrm/punch/status", { employeeId, pin });
  return res.data.status as HrmPunchStatusDTO;
}

export async function submitPunchAction(employeeId: string, pin: string, action: HrmPunchAction) {
  const res = await punchApi.post("/commerce/public/hrm/punch/action", { employeeId, pin, action });
  return res.data.status as HrmPunchStatusDTO;
}
