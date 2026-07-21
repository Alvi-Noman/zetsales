import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, CheckCircle2, Loader2, Lock } from 'lucide-react';
import clsx from 'clsx';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { resetPassword } from '../../lib/passwordResetApi';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const hasMinLength = password.length >= 8;
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit = hasMinLength && password === confirmPassword && !submitting;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <AuthLayout>
        <div className="mb-2 text-2xl font-bold tracking-tight text-slate-900">Link not available</div>
        <p className="mt-1.5 text-sm text-slate-500">This reset link is missing its token. Request a new one below.</p>
        <Link to="/forgot-password" className="mt-6 inline-block text-sm font-semibold text-indigo-600 hover:text-indigo-700">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 size={22} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Password updated</h2>
          <p className="mt-1.5 text-sm text-slate-500">You can now sign in with your new password.</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Go to sign in
          </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Set a new password</h2>
        <p className="mt-1.5 text-sm text-slate-500">Choose a new password for your account.</p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">New password</label>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          {password.length > 0 && (
            <div className={clsx('mt-1.5 flex items-center gap-1.5 text-xs', hasMinLength ? 'text-emerald-600' : 'text-slate-400')}>
              <Check size={12} />
              At least 8 characters
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirm new password</label>
          <div className="relative">
            <Lock size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          {mismatch && <p className="mt-1.5 text-xs font-medium text-rose-600">Passwords don't match.</p>}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          Reset password
        </button>
      </form>
    </AuthLayout>
  );
}
