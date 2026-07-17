import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./layouts/AppShell";
import { OrdersPage } from "./pages/orders/OrdersPage";
import { DispatchPage } from "./pages/dispatch/DispatchPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { ToastProvider } from "./components/ui/ToastProvider";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { OnboardingPage } from "./pages/onboarding/OnboardingPage";
import IntegrationsPage from "./pages/integrations/IntegrationsPage";
import { CustomerServicePage } from "./pages/customerService/CustomerServicePage";
import { ProductsPage } from "./pages/products/ProductsPage";
import { AddProductPage } from "./pages/products/AddProductPage";
import { EditProductPage } from "./pages/products/EditProductPage";
import { InventoryPage } from "./pages/inventory/InventoryPage";
import { WarehousesPage } from "./pages/warehouses/WarehousesPage";
import { PreOrderListPage } from "./pages/preOrders/PreOrderListPage";
import { ReturnsPage } from "./pages/returns/ReturnsPage";
import { PrintOutPage } from "./pages/printOut/PrintOutPage";
import { InvoiceTemplatesPage } from "./pages/printOut/InvoiceTemplatesPage";
import { HomePage } from "./pages/home/HomePage";
import { AccountingPage } from "./pages/accounting/AccountingPage";
import { SuppliersPage } from "./pages/supplyChain/SuppliersPage";
import { SupplierDetailPage } from "./pages/supplyChain/SupplierDetailPage";
import { DeliveryPartnersPage } from "./pages/supplyChain/DeliveryPartnersPage";
import { CustomersPage } from "./pages/customers/CustomersPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { TeamPage } from "./pages/team/TeamPage";
import { AcceptInvitePage } from "./pages/auth/AcceptInvitePage";
import { AnalyticsEntryPage } from "./pages/analytics/AnalyticsEntryPage";
import { AnalyticsDetailPage } from "./pages/analytics/AnalyticsDetailPage";
import { AdPerformancePage } from "./pages/adPerformance/AdPerformancePage";
import { CallCenterPage } from "./pages/callCenter/CallCenterPage";
import { AppHostPage } from "./pages/apps/AppHostPage";
import { AppsPage } from "./pages/settings/AppsPage";
import { AppDetailPage } from "./pages/settings/AppDetailPage";
import { ZetSalesAdsPage } from "./pages/zetsalesAds/ZetSalesAdsPage";
import { NAV_ITEMS, NAV_FOOTER_ITEMS } from "./nav/navigation";
import { ROLE_DEFINITIONS, type ModuleKey } from "@zetsales/shared";

const routeEntries = new Map<string, string>();
[...NAV_ITEMS, ...NAV_FOOTER_ITEMS].forEach((item) => {
  routeEntries.set(item.path, item.label);
  item.children?.forEach((child) => routeEntries.set(child.path, child.label));
});
routeEntries.delete("/home");
routeEntries.delete("/orders");
routeEntries.delete("/dispatch");
routeEntries.delete("/integrations");
routeEntries.delete("/products");
routeEntries.delete("/inventory");
routeEntries.delete("/messages");
routeEntries.delete("/team");
routeEntries.delete("/accounting");
routeEntries.delete("/suppliers");
routeEntries.delete("/customers");
routeEntries.delete("/analytics");
routeEntries.delete("/ad-performance");
routeEntries.delete("/call-center");
routeEntries.delete("/delivery-partners");
routeEntries.delete("/settings/apps");
routeEntries.delete("/zetsales-ads");

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-white">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (loading || !user?.isOnboarded || !user.businessUrl) return;
    if (window.location.origin === user.businessUrl) return;

    const authEntryPaths = new Set(["/", "/login", "/signup", "/onboarding"]);
    const nextPath = authEntryPaths.has(location.pathname)
      ? "/home"
      : `${location.pathname}${location.search}${location.hash}`;
    window.location.assign(`${user.businessUrl}${nextPath}`);
  }, [loading, location.hash, location.pathname, location.search, user]);

  if (loading) return <FullScreenLoader />;

  if (user?.isOnboarded && user.businessUrl && window.location.origin !== user.businessUrl) {
    return <FullScreenLoader />;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!user.isOnboarded) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/invite/:token" element={<AcceptInvitePage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route
          path="/dispatch"
          element={
            <ModuleRoute module="dispatch">
              <DispatchPage />
            </ModuleRoute>
          }
        />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/messages" element={<CustomerServicePage />} />
        <Route
          path="/customer-service"
          element={<Navigate to="/messages" replace />}
        />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<AddProductPage />} />
        <Route path="/products/:id/edit" element={<EditProductPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/inventory/warehouses" element={<WarehousesPage />} />
        <Route path="/pre-orders" element={<PreOrderListPage />} />
        <Route
          path="/returns"
          element={
            <ModuleRoute module="returns">
              <ReturnsPage />
            </ModuleRoute>
          }
        />
        <Route path="/print-out" element={<PrintOutPage />} />
        <Route path="/print-out/templates" element={<InvoiceTemplatesPage />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
        <Route path="/delivery-partners" element={<DeliveryPartnersPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:phone" element={<CustomerDetailPage />} />
        <Route path="/analytics" element={<AnalyticsEntryPage />} />
        <Route path="/analytics/:cardKey" element={<AnalyticsDetailPage />} />
        <Route path="/ad-performance" element={<AdPerformancePage />} />
        <Route path="/call-center" element={<CallCenterPage />} />
        <Route path="/zetsales-ads" element={<ZetSalesAdsPage />} />
        <Route path="/settings/apps" element={<AppsPage />} />
        <Route path="/settings/apps/:appKey" element={<AppDetailPage />} />
        <Route path="/apps/:appKey" element={<AppHostPage />} />
        {[...routeEntries.entries()].map(([path, label]) => (
          <Route
            key={path}
            path={path}
            element={<PlaceholderPage title={label} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}

function ModuleRoute({
  module,
  children,
}: {
  module: ModuleKey;
  children: JSX.Element;
}) {
  const { user } = useAuth();
  const allowedModules = user?.role
    ? ROLE_DEFINITIONS[user.role].modules
    : ROLE_DEFINITIONS.owner.modules;
  return allowedModules.includes(module) ? (
    children
  ) : (
    <Navigate to="/home" replace />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </AuthProvider>
  );
}
