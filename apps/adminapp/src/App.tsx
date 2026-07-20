import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminShell } from './layouts/AdminShell';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { TenantsPage } from './pages/tenants/TenantsPage';
import { TenantDetailPage } from './pages/tenants/TenantDetailPage';
import { TopProductsPage } from './pages/products/TopProductsPage';
import { BillingPage } from './pages/billing/BillingPage';
import { SupportPage } from './pages/support/SupportPage';
import { SystemHealthPage } from './pages/system/SystemHealthPage';
import { AuditLogPage } from './pages/audit/AuditLogPage';
import { AdminSettingsPage } from './pages/settings/AdminSettingsPage';
import { AdminAuthProvider, useAdminAuth } from './context/AuthContext';

function AppRoutes() {
  const { isAuthenticated } = useAdminAuth();

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/tenants" element={<TenantsPage />} />
        <Route path="/tenants/:id" element={<TenantDetailPage />} />
        <Route path="/products" element={<TopProductsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/support" element={<SupportPage />} />
        <Route path="/system" element={<SystemHealthPage />} />
        <Route path="/audit" element={<AuditLogPage />} />
        <Route path="/settings" element={<AdminSettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AdminAuthProvider>
      <AppRoutes />
    </AdminAuthProvider>
  );
}
