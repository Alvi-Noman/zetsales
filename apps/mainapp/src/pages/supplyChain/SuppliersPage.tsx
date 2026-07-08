import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Boxes, Landmark, Package, Plus, RefreshCw, Search, Truck, Users } from 'lucide-react';
import clsx from 'clsx';
import { createSupplierRecord, listSupplierOverviews, type SupplierOverviewDTO, type SupplierPaymentType } from '../../lib/commerceApi';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';

function money(value: number) {
  const sign = value < 0 ? '-' : '';
  return `${sign}৳${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = 'slate',
}: {
  icon: typeof Package;
  label: string;
  value: string;
  tone?: 'slate' | 'emerald' | 'indigo';
}) {
  const toneClass = { slate: 'bg-slate-100 text-slate-500', emerald: 'bg-emerald-50 text-emerald-600', indigo: 'bg-indigo-50 text-indigo-600' }[tone];
  return (
    <div className="min-w-[160px] flex-1 border-r border-slate-200 px-4 py-3 last:border-r-0">
      <div className="flex items-center gap-2">
        <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg', toneClass)}>
          <Icon size={15} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-2 text-xl font-bold tabular-nums text-slate-900">{value}</div>
    </div>
  );
}

type SortKey = 'name' | 'totalSpend' | 'shipmentCount' | 'totalUnits' | 'lastTransactionAt' | 'leadTimeDays';

function AddSupplierModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [paymentType, setPaymentType] = useState<SupplierPaymentType>('prepaid');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setPhone('');
      setEmail('');
      setLeadTimeDays('');
      setPaymentTerms('');
      setPaymentType('prepaid');
      setNote('');
    }
  }, [open]);

  const canSave = name.trim().length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createSupplierRecord({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        leadTimeDays: leadTimeDays.trim() ? Number(leadTimeDays) : undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        paymentType,
        note: note.trim() || undefined,
      });
      toast.push('Supplier added.', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || 'Could not save this supplier.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add supplier" subtitle="Every shipment and opening balance you tie to them rolls up here." widthClass="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ABC Garments" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Lead time (days)</label>
            <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Payment terms</label>
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. Net 30" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">How do you pay this supplier?</label>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setPaymentType('prepaid')}
              className={clsx('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', paymentType === 'prepaid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
            >
              Prepaid
            </button>
            <button
              type="button"
              onClick={() => setPaymentType('credit')}
              className={clsx('flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors', paymentType === 'credit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
            >
              On credit
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {paymentType === 'prepaid'
              ? "You pay upfront before a shipment ships — it'll show as cash already spent, in transit."
              : "You pay after the shipment arrives — it'll show as money you still owe."}
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Note</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Add supplier'}
        </button>
      </div>
    </Modal>
  );
}

export function SuppliersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<SupplierOverviewDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalSpend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [addOpen, setAddOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listSupplierOverviews();
      setSuppliers(res.suppliers);
    } catch {
      toast.push('Could not load suppliers.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const rows = useMemo(() => {
    const filtered = search.trim() ? suppliers.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase())) : suppliers;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'lastTransactionAt') cmp = (a.lastTransactionAt ?? '').localeCompare(b.lastTransactionAt ?? '');
      else if (sortKey === 'leadTimeDays') cmp = (a.leadTimeDays ?? -1) - (b.leadTimeDays ?? -1);
      else cmp = a[sortKey] - b[sortKey];
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [suppliers, search, sortKey, sortDir]);

  const totals = useMemo(
    () => ({
      count: suppliers.length,
      totalSpend: suppliers.reduce((sum, s) => sum + s.totalSpend, 0),
      totalShipments: suppliers.reduce((sum, s) => sum + s.shipmentCount, 0),
    }),
    [suppliers]
  );

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <button onClick={() => toggleSort(sortKeyName)} className="flex items-center gap-1 text-left hover:text-slate-700">
      {label}
      {sortKey === sortKeyName ? sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : <ArrowUpDown size={11} className="text-slate-300" />}
    </button>
  );

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Suppliers</h1>
          <p className="mt-1 text-sm text-slate-500">Every transaction with every supplier, in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : undefined} /> Refresh
          </button>
          <button onClick={() => setAddOpen(true)} className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700">
            <Plus size={14} /> Add supplier
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && suppliers.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading suppliers...</div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap rounded-xl border border-slate-200 bg-white">
              <MetricCard icon={Users} label="Suppliers" value={String(totals.count)} tone="slate" />
              <MetricCard icon={Landmark} label="Total spend" value={money(totals.totalSpend)} tone="indigo" />
              <MetricCard icon={Truck} label="Shipments logged" value={String(totals.totalShipments)} tone="emerald" />
            </div>

            <div className="relative max-w-xs">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search suppliers..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
              />
            </div>

            {suppliers.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-16 text-center">
                <Boxes size={28} className="text-slate-300" />
                <p className="text-sm font-medium text-slate-600">No suppliers yet</p>
                <p className="max-w-sm text-xs text-slate-400">
                  Suppliers picked during an Opening balance or Incoming Stock entry show up here automatically, or add one directly.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-400">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold">
                        <SortHeader label="Name" sortKeyName="name" />
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        <SortHeader label="Total spend" sortKeyName="totalSpend" />
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        <SortHeader label="Shipments" sortKeyName="shipmentCount" />
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        <SortHeader label="Units received" sortKeyName="totalUnits" />
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        <SortHeader label="Lead time" sortKeyName="leadTimeDays" />
                      </th>
                      <th className="px-4 py-2.5 text-right font-semibold">
                        <SortHeader label="Last transaction" sortKeyName="lastTransactionAt" />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((s) => (
                      <tr key={s.id} onClick={() => navigate(`/suppliers/${s.id}`)} className="cursor-pointer hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{s.name}</p>
                          <p className="text-xs text-slate-400">{s.phone || s.email || '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">{money(s.totalSpend)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{s.shipmentCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">{s.totalUnits}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-500">{s.leadTimeDays != null ? `${s.leadTimeDays}d` : '—'}</td>
                        <td className="px-4 py-3 text-right text-slate-500">{s.lastTransactionAt ? new Date(s.lastTransactionAt).toLocaleDateString() : 'Never'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <AddSupplierModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => void load()} />
    </div>
  );
}
