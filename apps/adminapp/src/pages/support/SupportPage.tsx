import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { SUPPORT_TICKETS, formatRelativeTime, type SupportTicket } from '../../lib/mockData';

const PRIORITY_TONE: Record<SupportTicket['priority'], 'red' | 'amber' | 'sky' | 'slate'> = {
  urgent: 'red',
  high: 'amber',
  medium: 'sky',
  low: 'slate',
};

const STATUS_TONE: Record<SupportTicket['status'], 'sky' | 'amber' | 'emerald'> = {
  open: 'sky',
  pending: 'amber',
  resolved: 'emerald',
};

export function SupportPage() {
  return (
    <div className="pb-10">
      <PageHeader title="Support" description="Tickets raised by tenants across the platform" />

      <div className="px-6 pt-6">
        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Ticket</th>
                <th className="px-5 py-3 font-medium">Tenant</th>
                <th className="px-5 py-3 font-medium">Priority</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Assignee</th>
                <th className="px-5 py-3 font-medium">Opened</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {SUPPORT_TICKETS.map((t) => (
                <tr key={t.id} className="transition-colors hover:bg-slate-900/70">
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-200">{t.subject}</div>
                    <div className="text-xs text-slate-500">{t.id}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{t.tenantName}</td>
                  <td className="px-5 py-3">
                    <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-400">{t.assignee}</td>
                  <td className="px-5 py-3 text-slate-500">{formatRelativeTime(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
