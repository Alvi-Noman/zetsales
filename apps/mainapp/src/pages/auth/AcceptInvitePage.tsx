import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Loader2, Lock } from 'lucide-react';
import clsx from 'clsx';
import { AuthLayout } from '../../components/auth/AuthLayout';
import { useAuth } from '../../context/AuthContext';
import { getInvitePreview, acceptInvite } from '../../lib/teamApi';
import { ROLE_DEFINITIONS, type AcceptInvitePreviewDTO } from '@zetsales/shared';

export function AcceptInvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [preview, setPreview] = useState<AcceptInvitePreviewDTO | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const hasMinLength = password.length >= 8;

  useEffect(() => {
    let cancelled = false;
    getInvitePreview(token)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch(() => {
        if (!cancelled) setPreview({ valid: false, reason: 'This invite link is not valid.' } as AcceptInvitePreviewDTO);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!hasMinLength) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await acceptInvite(token, password);
      await refresh();
      navigate('/home', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this invite.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingPreview) {
    return (
      <AuthLayout>
        <div className="flex items-center justify-center py-10">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div>
      </AuthLayout>
    );
  }

  if (!preview?.valid) {
    return (
      <AuthLayout>
        <div className="mb-2 text-2xl font-bold tracking-tight text-slate-900">Invite not available</div>
        <p className="mt-1.5 text-sm text-slate-500">{preview?.reason ?? 'This invite link is not valid.'}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Join {preview.businessName}</h2>
        <p className="mt-1.5 text-sm text-slate-500">
          You've been invited as <span className="font-semibold text-slate-700">{ROLE_DEFINITIONS[preview.role].label}</span>. Set a password to finish.
        </p>
      </div>

      {error && <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
          <input
            disabled
            value={preview.email}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 outline-none"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
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

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {submitting && <Loader2 size={15} className="animate-spin" />}
          Join workspace
        </button>
      </form>
    </AuthLayout>
  );
}
