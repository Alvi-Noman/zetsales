import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { requestPasswordReset } from '../../lib/passwordResetApi';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      // Always shows the same success state regardless of whether the email matched an
      // account — the backend responds identically either way to avoid leaking that.
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout>
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 size={22} className="text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Check your email</h2>
          <p className="mt-1.5 text-sm text-slate-500">
            If an account exists for <span className="font-medium text-slate-700">{email}</span>, we've sent a link to reset your password.
          </p>
          <Link to="/login" className="mt-6 text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Forgot your password?</h2>
        <p className="mt-1.5 text-sm text-slate-500">Enter your email and we'll send you a reset link.</p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
          <div className="relative">
            <Mail size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@business.com"
              className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          Send reset link
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it?{' '}
        <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
