import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { OrdersPage } from './pages/orders/OrdersPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ToastProvider } from './components/ui/ToastProvider';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './pages/auth/LoginPage';
import { SignupPage } from './pages/auth/SignupPage';
import { OnboardingPage } from './pages/onboarding/OnboardingPage';
import { IntegrationsPage } from './pages/integrations/IntegrationsPage';
import { ProductsPage } from './pages/products/ProductsPage';
import { AddProductPage } from './pages/products/AddProductPage';
import { EditProductPage } from './pages/products/EditProductPage';
import { NAV_ITEMS, NAV_FOOTER_ITEMS } from './nav/navigation';

const routeEntries = new Map<string, string>();
[...NAV_ITEMS, ...NAV_FOOTER_ITEMS].forEach((item) => {
  routeEntries.set(item.path, item.label);
  item.children?.forEach((child) => routeEntries.set(child.path, child.label));
});
routeEntries.delete('/orders');
routeEntries.delete('/integrations');
routeEntries.delete('/products');

function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-white">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <FullScreenLoader />;

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!user.isOnboarded) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Navigate to="/orders" replace />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<AddProductPage />} />
        <Route path="/products/:id/edit" element={<EditProductPage />} />
        {[...routeEntries.entries()].map(([path, label]) => (
          <Route key={path} path={path} element={<PlaceholderPage title={label} />} />
        ))}
        <Route path="*" element={<Navigate to="/orders" replace />} />
      </Route>
    </Routes>
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
