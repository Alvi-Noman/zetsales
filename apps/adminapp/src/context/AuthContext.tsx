import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// Platform-operator console — a single super-admin login, not a per-tenant account. There is no
// backend for this yet, so the credential check is intentionally hardcoded here rather than wired
// to auth-service (which issues per-tenant sessions, not platform-level ones).
const ADMIN_USERNAME = 'Admin';
const ADMIN_PASSWORD = 'Killyourtv123_';
const SESSION_KEY = 'zetsales_admin_session';

interface AdminAuthContextValue {
  isAuthenticated: boolean;
  login: (username: string, password: string) => boolean;
  logout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth must be used within AdminAuthProvider');
  return ctx;
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === 'true'
  );

  const login = useCallback((username: string, password: string) => {
    const ok = username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setIsAuthenticated(true);
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setIsAuthenticated(false);
  }, []);

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}
