import { PageHeader } from '../../components/ui/PageHeader';

export function AdminSettingsPage() {
  return (
    <div className="pb-10">
      <PageHeader title="Settings" description="Control center preferences" />

      <div className="grid grid-cols-1 gap-4 px-6 pt-6 xl:grid-cols-2">
        <div className="zs-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-white">Admin account</h3>
          <p className="mb-4 text-xs text-slate-500">Platform operator credentials for this console</p>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Username</dt>
              <dd className="font-medium text-slate-200">Admin</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium text-slate-200">Super Admin</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-500">Two-factor auth</dt>
              <dd className="font-medium text-amber-400">Not enabled</dd>
            </div>
          </dl>
        </div>

        <div className="zs-card p-5">
          <h3 className="mb-1 text-sm font-semibold text-white">Notifications</h3>
          <p className="mb-4 text-xs text-slate-500">What this console alerts you about</p>
          <div className="space-y-3 text-sm">
            {['New tenant signups', 'Failed payments', 'Security anomalies', 'Service degradation'].map((label) => (
              <label key={label} className="flex items-center justify-between">
                <span className="text-slate-300">{label}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-700 bg-slate-900 accent-indigo-500" />
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
