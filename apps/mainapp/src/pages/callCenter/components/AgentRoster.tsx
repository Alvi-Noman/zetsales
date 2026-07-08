import clsx from 'clsx';
import type { CallCenterAgentDTO, TeamRole } from '@zetsales/shared';
import { avatarFromName } from '../../../components/orders/avatar';
import { formatMinutes } from '../../../analytics/format';

const ROLE_BADGE: Record<TeamRole, string> = {
  owner: 'bg-indigo-50 text-indigo-700',
  admin: 'bg-violet-50 text-violet-700',
  manager: 'bg-blue-50 text-blue-700',
  agent: 'bg-amber-50 text-amber-700',
  viewer: 'bg-slate-100 text-slate-600',
};

const STATUS_META: Record<CallCenterAgentDTO['status'], { label: string; dot: string; text: string; pulse?: boolean }> = {
  onCall: { label: 'On call', dot: 'bg-indigo-500', text: 'text-indigo-600', pulse: true },
  available: { label: 'Available', dot: 'bg-emerald-500', text: 'text-emerald-600' },
  offline: { label: 'Offline', dot: 'bg-slate-300', text: 'text-slate-400' },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return formatMinutes(seconds / 60);
}

interface AgentRosterProps {
  agents: CallCenterAgentDTO[];
  nowMs: number;
}

const STATUS_ORDER: Record<CallCenterAgentDTO['status'], number> = { onCall: 0, available: 1, offline: 2 };

export function AgentRoster({ agents, nowMs }: AgentRosterProps) {
  const sorted = [...agents].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.email.localeCompare(b.email));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Live agent status</h2>
        <span className="text-xs text-slate-400">{agents.length} team member{agents.length === 1 ? '' : 's'}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">No confirmation agents on this team yet.</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {sorted.map((agent) => {
            const meta = STATUS_META[agent.status];
            const since = new Date(agent.statusSince).getTime();
            const durationSeconds = Math.max(0, (nowMs - since) / 1000);
            const name = agent.email.split('@')[0];
            const avatar = avatarFromName(name);
            return (
              <div key={agent.email} className="flex items-center gap-3 px-4 py-3">
                <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white', avatar.color)}>
                  {avatar.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-slate-800">{name}</p>
                    <span className={clsx('shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide', ROLE_BADGE[agent.role])}>
                      {agent.role}
                    </span>
                    {agent.isYou && <span className="shrink-0 text-[10px] font-medium text-slate-400">(you)</span>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={clsx('relative flex h-1.5 w-1.5 rounded-full', meta.dot)}>
                      {meta.pulse && <span className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', meta.dot)} />}
                    </span>
                    <span className={clsx('text-[11.5px] font-medium', meta.text)}>{meta.label}</span>
                    <span className="text-[11px] text-slate-400">· {formatDuration(durationSeconds)}</span>
                  </div>
                </div>
                <div className="hidden shrink-0 gap-4 text-right text-[11px] text-slate-500 sm:flex">
                  <div>
                    <p className="font-semibold tabular-nums text-slate-800">{agent.callsToday}</p>
                    <p className="text-slate-400">calls</p>
                  </div>
                  <div>
                    <p className="font-semibold tabular-nums text-emerald-600">{agent.confirmedToday}</p>
                    <p className="text-slate-400">confirmed</p>
                  </div>
                  <div>
                    <p className="font-semibold tabular-nums text-rose-500">{agent.failedToday}</p>
                    <p className="text-slate-400">failed</p>
                  </div>
                  <div>
                    <p className="font-semibold tabular-nums text-slate-800">{formatMinutes(agent.avgTimeToConfirmMinutes)}</p>
                    <p className="text-slate-400">avg confirm</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
