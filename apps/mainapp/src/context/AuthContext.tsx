import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { OnboardingPayload, UserDTO } from '@zetsales/shared';
import { api } from '../lib/api';

interface AuthContextValue {
  user: UserDTO | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserDTO>;
  signup: (email: string, password: string) => Promise<UserDTO>;
  logout: () => Promise<void>;
  completeOnboarding: (payload: OnboardingPayload) => Promise<UserDTO>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    setUser(res.data.user);
    return res.data.user as UserDTO;
  };

  const signup = async (email: string, password: string) => {
    const res = await api.post('/auth/signup', { email, password });
    setUser(res.data.user);
    return res.data.user as UserDTO;
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
  };

  const completeOnboarding = async (payload: OnboardingPayload) => {
    const res = await api.post('/auth/onboarding', payload);
    setUser(res.data.user);
    return res.data.user as UserDTO;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, completeOnboarding, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
