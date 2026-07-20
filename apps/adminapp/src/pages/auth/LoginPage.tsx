import { useState, type FormEvent } from 'react';
import { ShieldCheck, Lock, User, AlertCircle } from 'lucide-react';
import { useAdminAuth } from '../../context/AuthContext';

export function LoginPage() {
  const { login } = useAdminAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const ok = login(username, password);
    setError(!ok);
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/30">
            <ShieldCheck size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">ZetSales Control Center</h1>
            <p className="mt-1 text-sm text-slate-400">Platform administration — authorized personnel only</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="zs-card space-y-4 p-6">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Username</label>
            <div className="relative">
              <User size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Admin"
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400">Password</label>
            <div className="relative">
              <Lock size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="h-10 w-full rounded-lg border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm text-slate-100 placeholder-slate-600 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">
              <AlertCircle size={14} />
              Invalid username or password.
            </div>
          )}

          <button
            type="submit"
            className="h-10 w-full rounded-lg bg-indigo-500 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition-colors hover:bg-indigo-400"
          >
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-slate-600">
          Access to this console is logged and audited.
        </p>
      </div>
    </div>
  );
}
