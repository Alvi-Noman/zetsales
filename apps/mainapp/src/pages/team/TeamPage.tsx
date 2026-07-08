import { useEffect, useMemo, useState } from 'react';
import { Ban, Copy, RefreshCw, ShieldCheck, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_DEFINITIONS, type ModuleKey, type TeamInviteDTO, type TeamMemberDTO, type TeamRole } from '@zetsales/shared';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/ui/ToastProvider';
import { InviteMemberModal } from '../../components/team/InviteMemberModal';
import { listMembers, listInvites, updateMemberRole, removeMember, resendInvite, revokeInvite } from '../../lib/teamApi';
import { NAV_ITEMS, NAV_FOOTER_ITEMS } from '../../nav/navigation';

const MODULE_LABELS: Record<ModuleKey, string> = Object.fromEntries(
  [...NAV_ITEMS, ...NAV_FOOTER_ITEMS].map((item) => [item.module, item.label])
) as Record<ModuleKey, string>;

const ROLE_BADGE: Record<TeamRole, string> = {
  owner: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  admin: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  manager: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  agent: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  viewer: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

function Avatar({ email }: { email: string }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-sm font-semibold text-white">
      {email.charAt(0).toUpperCase()}
    </div>
  );
}

export function TeamPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [members, setMembers] = useState<TeamMemberDTO[]>([]);
  const [invites, setInvites] = useState<TeamInviteDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const myRole = user?.role ?? 'owner';
  const canManageTeam = ROLE_DEFINITIONS[myRole].canManageTeam;
  const grantableRoles = useMemo<TeamRole[]>(() => (myRole === 'owner' ? ['admin', 'manager', 'agent', 'viewer'] : ['manager', 'agent', 'viewer']), [myRole]);

  const load = async () => {
    setLoading(true);
    try {
      const [memberList, inviteList] = await Promise.all([listMembers(), canManageTeam ? listInvites() : Promise.resolve([])]);
      setMembers(memberList);
      setInvites(inviteList);
    } catch {
      toast.push('Could not load your team.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canManageTarget = (member: TeamMemberDTO) => canManageTeam && !member.isYou && member.role !== 'owner' && !(myRole === 'admin' && member.role === 'admin');

  const handleRoleChange = async (member: TeamMemberDTO, role: TeamRole) => {
    const previous = member.role;
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role } : m)));
    try {
      await updateMemberRole(member.id, role);
      toast.push(`${member.email} is now ${ROLE_DEFINITIONS[role].label}.`);
    } catch (err) {
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: previous } : m)));
      toast.push(err instanceof Error ? err.message : 'Could not update this role.', 'info');
    }
  };

  const handleRemove = async (member: TeamMemberDTO) => {
    if (!window.confirm(`Remove ${member.email} from your team? They will lose access immediately.`)) return;
    setMembers((prev) => prev.filter((m) => m.id !== member.id));
    try {
      await removeMember(member.id);
      toast.push(`Removed ${member.email}.`);
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not remove this member.', 'info');
      void load();
    }
  };

  const handleResend = async (invite: TeamInviteDTO) => {
    try {
      const updated = await resendInvite(invite.id);
      setInvites((prev) => prev.map((i) => (i.id === invite.id ? updated : i)));
      toast.push(`Renewed the invite for ${invite.email}.`);
    } catch {
      toast.push('Could not renew this invite.', 'info');
    }
  };

  const handleRevoke = async (invite: TeamInviteDTO) => {
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    try {
      await revokeInvite(invite.id);
      toast.push(`Revoked the invite for ${invite.email}.`);
    } catch {
      toast.push('Could not revoke this invite.', 'info');
      void load();
    }
  };

  const handleCopyLink = async (invite: TeamInviteDTO) => {
    await navigator.clipboard.writeText(invite.inviteLink);
    toast.push('Invite link copied.');
  };

  const handleInvited = (invite: TeamInviteDTO) => {
    setInvites((prev) => [invite, ...prev.filter((i) => i.email !== invite.email)]);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Team</h1>
          <p className="mt-1 text-sm text-slate-500">Manage who has access to your workspace and what they can do.</p>
        </div>
        {canManageTeam && (
          <button
            onClick={() => setInviteModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <UserPlus size={14} /> Invite member
          </button>
        )}
      </div>

      <div className="flex-1 space-y-8 px-8 py-6">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Members</h2>
          {loading ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">Loading...</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar email={member.email} />
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-slate-800">
                        {member.email}
                        {member.isYou && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">You</span>}
                      </p>
                      <p className="text-xs text-slate-400">Joined {new Date(member.joinedAt ?? member.invitedAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {canManageTarget(member) ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member, e.target.value as TeamRole)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400"
                      >
                        {grantableRoles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_DEFINITIONS[r].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', ROLE_BADGE[member.role])}>
                        {ROLE_DEFINITIONS[member.role].label}
                      </span>
                    )}
                    {canManageTarget(member) && (
                      <button onClick={() => handleRemove(member)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                        <Ban size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {canManageTeam && (
          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Pending invites</h2>
            {invites.length === 0 ? (
              <p className="text-sm text-slate-400">No pending invites.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{invite.email}</p>
                      <p className="text-xs text-slate-400">
                        {invite.expired ? 'Expired' : `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`} · invited by {invite.invitedByEmail}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', ROLE_BADGE[invite.role])}>
                        {ROLE_DEFINITIONS[invite.role].label}
                      </span>
                      <button
                        onClick={() => handleCopyLink(invite)}
                        title="Copy invite link"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        onClick={() => handleResend(invite)}
                        title="Renew invite"
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        onClick={() => handleRevoke(invite)}
                        title="Revoke invite"
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Ban size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
            <ShieldCheck size={15} className="text-slate-400" /> Roles & permissions
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(Object.values(ROLE_DEFINITIONS) as (typeof ROLE_DEFINITIONS)[TeamRole][]).map((def) => (
              <div key={def.role} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <span className={clsx('rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', ROLE_BADGE[def.role])}>{def.label}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{def.description}</p>
                <p className="mt-2 text-[11px] text-slate-400">{def.modules.map((m) => MODULE_LABELS[m]).join(', ')}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <InviteMemberModal open={inviteModalOpen} onClose={() => setInviteModalOpen(false)} grantableRoles={grantableRoles} onInvited={handleInvited} />
    </div>
  );
}
