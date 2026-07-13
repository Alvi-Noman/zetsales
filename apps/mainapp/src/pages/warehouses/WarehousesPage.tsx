import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Boxes,
  Building2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Warehouse as WarehouseIcon,
  Wallet,
  X,
} from 'lucide-react';
import {
  listWarehouses,
  createWarehouse,
  renameWarehouse,
  deleteWarehouse,
  addWarehouseBin,
  removeWarehouseBin,
  listInventory,
  type WarehouseDTO,
} from '../../lib/commerceApi';
import { useToast } from '../../components/ui/ToastProvider';
import { Modal } from '../../components/ui/Modal';
import { MetricCard } from '../inventory/InventoryPage';

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

interface WarehouseStats {
  onHand: number;
  inbound: number;
  value: number;
  skuCount: number;
}

function AddWarehouseModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    setName('');
    setAddress('');
    onClose();
  };

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createWarehouse(name.trim(), address.trim() || undefined);
      toast.push('Warehouse added.', 'success');
      close();
      onCreated();
    } catch (err) {
      toast.push((err as Error).message || 'Could not add this warehouse.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Add warehouse" subtitle="Add a real location. Bins can be set up afterward, from the warehouse list.">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Warehouse name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="e.g. Sylhet Storage"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">Address (optional)</label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. House 12, Road 4, Uttara, Dhaka"
            rows={3}
            className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <button
          onClick={() => void submit()}
          disabled={saving || !name.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={14} /> {saving ? 'Adding...' : 'Add warehouse'}
        </button>
      </div>
    </Modal>
  );
}

// Warehouses used to be a hardcoded list of three names that had nothing to do with any real
// business using this. Renaming, adding, or removing one here updates it everywhere else in
// Inventory. Bins are deliberately optional and de-emphasized (a small "+ Add bin" field, not a
// form) — most small businesses don't track shelf-level detail, and nothing here requires them to.
export function WarehousesPage() {
  const toast = useToast();
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [stats, setStats] = useState<Record<string, WarehouseStats>>({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newBinByWarehouse, setNewBinByWarehouse] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  // Reuses the existing /inventory endpoint rather than a dedicated warehouse-summary one — its
  // summary block is already computed server-side across the full matching set regardless of
  // pageSize, so a pageSize:1 request per warehouse is a cheap way to get real onHand/inbound/value
  // numbers without a new backend surface.
  const loadStats = async (list: WarehouseDTO[]) => {
    setStatsLoading(true);
    try {
      const results = await Promise.all(
        list.map(async (w) => {
          const res = await listInventory({ warehouseId: w.id, pageSize: 1 });
          return [w.id, { onHand: res.summary.onHand, inbound: res.summary.inbound, value: res.summary.value, skuCount: res.total }] as const;
        })
      );
      setStats(Object.fromEntries(results));
    } catch {
      // Stats are a bonus layer on top of the warehouse list itself — losing them shouldn't block
      // seeing or managing the warehouses, so this fails silently rather than toasting.
    } finally {
      setStatsLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await listWarehouses();
      setWarehouses(res.warehouses);
      void loadStats(res.warehouses);
    } catch {
      toast.push('Could not load warehouses.', 'info');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveRename = async (id: string) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      await renameWarehouse(id, name);
      void load();
    } catch (err) {
      toast.push((err as Error).message || 'Could not rename this warehouse.', 'info');
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await deleteWarehouse(id);
      if (!res.success) toast.push(res.message || 'Could not delete this warehouse.', 'info');
      else void load();
    } catch (err) {
      toast.push((err as Error).message || 'Could not delete this warehouse.', 'info');
    } finally {
      setBusyId(null);
    }
  };

  const addBin = async (id: string) => {
    const name = (newBinByWarehouse[id] ?? '').trim();
    if (!name) return;
    try {
      await addWarehouseBin(id, name);
      setNewBinByWarehouse((prev) => ({ ...prev, [id]: '' }));
      void load();
    } catch (err) {
      toast.push((err as Error).message || 'Could not add this bin.', 'info');
    }
  };

  const removeBin = async (id: string, name: string) => {
    try {
      await removeWarehouseBin(id, name);
      void load();
    } catch (err) {
      toast.push((err as Error).message || 'Could not remove this bin.', 'info');
    }
  };

  const filteredWarehouses = useMemo(
    () => warehouses.filter((w) => w.name.toLowerCase().includes(search.trim().toLowerCase())),
    [warehouses, search]
  );

  const totals = useMemo(() => {
    const values = Object.values(stats);
    return {
      warehouseCount: warehouses.length,
      binCount: warehouses.reduce((sum, w) => sum + w.bins.length + w.systemBins.length, 0),
      onHand: values.reduce((sum, s) => sum + s.onHand, 0),
      value: values.reduce((sum, s) => sum + s.value, 0),
    };
  }, [warehouses, stats]);

  return (
    <div className="px-4 py-4 lg:px-8 lg:py-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">Warehouses</h1>
        <p className="mt-0.5 text-sm text-slate-500">Every real location stock lives in — add them here, everything else in Inventory follows.</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard icon={Building2} label="Warehouses" value={totals.warehouseCount.toLocaleString()} detail={`${totals.warehouseCount === 1 ? 'location' : 'locations'}`} />
          <MetricCard icon={MapPin} label="Bins" value={totals.binCount.toLocaleString()} detail="shelf locations tracked" />
          <MetricCard icon={Boxes} label="On hand" value={totals.onHand.toLocaleString()} detail="units across all warehouses" tone="indigo" />
          <MetricCard icon={Wallet} label="Stock value" value={money(totals.value)} detail="at cost, across all warehouses" tone="emerald" />
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Warehouse list</h2>
              <p className="mt-1 text-xs text-slate-400">Bins are optional — only set them up if you actually track shelf-level detail.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search warehouses"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>
              <button
                onClick={() => setAddModalOpen(true)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={14} /> Add warehouse
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading warehouses...</div>
          ) : filteredWarehouses.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 px-8 text-center">
              <WarehouseIcon size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">{warehouses.length === 0 ? 'No warehouses yet' : 'No warehouses match your search'}</p>
              <p className="max-w-md text-sm text-slate-400">
                {warehouses.length === 0 ? 'Add your first real location above to start tracking stock by warehouse.' : 'Try a different search term.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredWarehouses.map((w) => {
                const s = stats[w.id];
                return (
                  <div key={w.id} className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {editingId === w.id ? (
                            <input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onBlur={() => void saveRename(w.id)}
                              onKeyDown={(e) => e.key === 'Enter' && void saveRename(w.id)}
                              className="h-8 flex-1 max-w-xs rounded-md border border-indigo-300 px-2 text-sm outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setEditingId(w.id);
                                setEditingName(w.name);
                              }}
                              className="group flex items-center gap-1.5 text-left text-sm font-semibold text-slate-900"
                            >
                              <WarehouseIcon size={14} className="text-slate-400" />
                              {w.name}
                              <Pencil size={11} className="text-slate-300 opacity-0 group-hover:opacity-100" />
                            </button>
                          )}
                        </div>
                        {w.address && (
                          <p className="mt-1 flex items-start gap-1 text-xs text-slate-400">
                            <MapPin size={12} className="mt-0.5 shrink-0" />
                            {w.address}
                          </p>
                        )}

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 sm:max-w-md">
                          <div>
                            <p className="font-bold tabular-nums text-slate-900">{statsLoading && !s ? '—' : (s?.skuCount ?? 0)}</p>
                            <p className="text-slate-400">SKUs here</p>
                          </div>
                          <div>
                            <p className="font-bold tabular-nums text-indigo-600">{statsLoading && !s ? '—' : (s?.onHand ?? 0)}</p>
                            <p className="text-slate-400">on hand</p>
                          </div>
                          <div>
                            <p className="font-bold tabular-nums text-amber-600">{statsLoading && !s ? '—' : (s?.inbound ?? 0)}</p>
                            <p className="text-slate-400">incoming</p>
                          </div>
                          <div>
                            <p className="font-bold tabular-nums text-emerald-600">{statsLoading && !s ? '—' : money(s?.value ?? 0)}</p>
                            <p className="text-slate-400">stock value</p>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {w.bins.map((bin) => (
                            <span key={bin} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {bin}
                              <button onClick={() => void removeBin(w.id, bin)} className="text-slate-400 hover:text-rose-600">
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                          {w.systemBins.map((bin) => (
                            <span
                              key={bin}
                              title="Already in use (e.g. a count, shipment, or the returns-holding location) — not manually added, so it can't be removed here."
                              className="flex items-center gap-1 rounded-full border border-dashed border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-600"
                            >
                              {bin}
                              <span className="text-[10px] text-indigo-400">in use</span>
                            </span>
                          ))}
                          <input
                            value={newBinByWarehouse[w.id] ?? ''}
                            onChange={(e) => setNewBinByWarehouse((prev) => ({ ...prev, [w.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && void addBin(w.id)}
                            placeholder="+ Add shelf/bin (optional)"
                            className="h-6 w-36 rounded-full border border-dashed border-slate-300 px-2 text-[11px] text-slate-600 outline-none focus:border-indigo-400"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => void remove(w.id)}
                        disabled={busyId === w.id}
                        title={s && s.onHand + s.inbound > 0 ? 'This warehouse still has stock — removing it may not be allowed.' : 'Remove this warehouse'}
                        className={clsx(
                          'shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40'
                        )}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <AddWarehouseModal open={addModalOpen} onClose={() => setAddModalOpen(false)} onCreated={() => void load()} />
    </div>
  );
}
