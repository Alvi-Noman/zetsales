import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { inviteMember } from '../../lib/teamApi';
import { useToast } from '../ui/ToastProvider';
import { ROLE_DEFINITIONS, type TeamInviteDTO, type TeamRole } from '@zetsales/shared';

interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  grantableRoles: TeamRole[];
  onInvited: (invite: TeamInviteDTO) => void;
}

export function InviteMemberModal({ open, onClose, grantableRoles, onInvited }: InviteMemberModalProps) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>(grantableRoles[0] ?? 'viewer');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<TeamInviteDTO | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClose = () => {
    setEmail('');
    setRole(grantableRoles[0] ?? 'viewer');
    setError('');
    setResult(null);
    setCopied(false);
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    setSubmitting(true);
    try {
      const invite = await inviteMember(email.trim(), role);
      setResult(invite);
      onInvited(invite);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this invite.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.inviteLink);
    setCopied(true);
    toast.push('Invite link copied.');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={handleClose} title="Invite a team member" subtitle="They'll set their own password and sign in on their own.">
      {result ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700">
            Invite created for <span className="font-semibold">{result.email}</span> as {ROLE_DEFINITIONS[result.role].label}.
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Invite link</label>
            <p className="mb-2 text-xs text-slate-400">No email is sent yet — share this link with them directly. It expires in 7 days.</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={result.inviteLink}
                onFocus={(e) => e.target.select()}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 outline-none"
              />
              <button
                onClick={handleCopy}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email address</label>
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@business.com"
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Role</label>
            <div className="space-y-2">
              {grantableRoles.map((r) => (
                <label
                  key={r}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
                    role === r ? 'border-indigo-400 bg-indigo-50/60' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-indigo-600" />
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{ROLE_DEFINITIONS[r].label}</p>
                    <p className="text-xs text-slate-400">{ROLE_DEFINITIONS[r].description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">{error}</div>}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting && <Loader2 size={15} className="animate-spin" />}
            Create invite link
          </button>
        </div>
      )}
    </Modal>
  );
}
