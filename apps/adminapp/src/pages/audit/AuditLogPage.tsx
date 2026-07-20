import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { AUDIT_LOG, type AuditLogEntry } from '../../lib/mockData';

const CATEGORY_TONE: Record<AuditLogEntry['category'], 'indigo' | 'red' | 'sky' | 'slate'> = {
  billing: 'indigo',
  security: 'red',
  tenant: 'sky',
  system: 'slate',
};

export function AuditLogPage() {
  return (
    <div className="pb-10">
      <PageHeader title="Audit Log" description="Every sensitive action taken on the platform, chronologically" />

      <div className="px-6 pt-6">
        <div className="zs-card divide-y divide-slate-800/70">
          {AUDIT_LOG.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <Badge tone={CATEGORY_TONE[entry.category]}>{entry.category}</Badge>
                <div>
                  <span className="text-sm text-slate-200">
                    <span className="font-medium">{entry.actor}</span> {entry.action.toLowerCase()}{' '}
                    <span className="font-medium text-slate-300">{entry.target}</span>
                  </span>
                </div>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
