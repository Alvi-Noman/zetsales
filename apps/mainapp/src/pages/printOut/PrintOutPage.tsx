import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { CalendarClock, ClipboardList, Package, Printer, Search, Wallet, X } from 'lucide-react';
import type { InvoiceTemplateDTO, OrderDTO, OrderStage } from '@zetsales/shared';
import { listReadyToPrintOrders, listPrintTemplates, listAllInventoryLevels, listWarehouses, type WarehouseDTO } from '../../lib/commerceApi';
import { STAGE_LABEL, STAGE_TONE } from '../../components/orders/orderTone';
import { PrintOrderModal, type PrintDocType } from '../../components/orders/PrintOrderModal';
import { MetricCard, ageLabel } from '../inventory/InventoryPage';
import { buildBinLookup, type BinLookup } from '../../components/orders/binLookup';
import { Select } from '../../components/ui/Select';

const DOC_TYPE_OPTIONS: { value: PrintDocType; label: string }[] = [
  { value: 'combined', label: 'Invoice + Slips' },
  { value: 'invoice', label: 'Invoices only' },
  { value: 'packingSlip', label: 'Packing slips only' },
];

type StageFilter = 'all' | Extract<OrderStage, 'Confirmed' | 'Processing'>;

export function PrintOutPage() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<InvoiceTemplateDTO[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [docType, setDocType] = useState<PrintDocType>('combined');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [binLookup, setBinLookup] = useState<BinLookup | undefined>(undefined);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<StageFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [ordersRes, templatesRes] = await Promise.all([listReadyToPrintOrders(), listPrintTemplates()]);
      setOrders(ordersRes.orders);
      setTotal(ordersRes.total);
      setSelectedIds(new Set(ordersRes.orders.map((o) => o.id)));
      setTemplates(templatesRes.templates);
      const defaultTemplate = templatesRes.templates.find((t) => t.isDefault);
      if (defaultTemplate) setSelectedTemplateId(defaultTemplate.id);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void listAllInventoryLevels().then((levels) => setBinLookup(buildBinLookup(levels)));
    void listWarehouses().then((res) => setWarehouses(res.warehouses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const oldestWaiting = useMemo(() => {
    if (orders.length === 0) return null;
    const oldest = orders.reduce((a, b) => (new Date(a.createdAt) < new Date(b.createdAt) ? a : b));
    return ageLabel(oldest.createdAt);
  }, [orders]);

  const totalUnits = useMemo(() => orders.reduce((sum, o) => sum + o.lineItems.reduce((s, li) => s + li.quantity, 0), 0), [orders]);
  const totalValue = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasActiveFilters = search.trim() !== '' || stageFilter !== 'all' || dateFrom !== '' || dateTo !== '' || warehouseFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setStageFilter('all');
    setDateFrom('');
    setDateTo('');
    setWarehouseFilter('all');
  };

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    return orders.filter((o) => {
      if (stageFilter !== 'all' && o.stage !== stageFilter) return false;
      if (warehouseFilter === 'unassigned' && o.fulfillmentWarehouseId !== null) return false;
      if (warehouseFilter !== 'all' && warehouseFilter !== 'unassigned' && o.fulfillmentWarehouseId !== warehouseFilter) return false;
      const createdAt = new Date(o.createdAt);
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      if (q) {
        const haystack = `${o.number} ${o.customerName ?? ''} ${o.customerPhone ?? ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [orders, search, stageFilter, dateFrom, dateTo, warehouseFilter]);

  const filteredSelectedCount = filteredOrders.filter((o) => selectedIds.has(o.id)).length;
  const allFilteredSelected = filteredOrders.length > 0 && filteredSelectedCount === filteredOrders.length;

  const toggleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredOrders.forEach((o) => {
        if (allFilteredSelected) next.delete(o.id);
        else next.add(o.id);
      });
      return next;
    });
  };

  const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  return (
    <div className="px-4 py-4 lg:px-8 lg:py-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-slate-900">Print Out</h1>
        <p className="mt-0.5 text-sm text-slate-500">Everything confirmed and ready to pack — pick a template, select orders, and print.</p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard icon={ClipboardList} label="Ready to print" value={total.toLocaleString()} detail="confirmed / processing orders" tone={total > 0 ? 'amber' : 'emerald'} />
          <MetricCard icon={Package} label="Units" value={totalUnits.toLocaleString()} detail="across those orders" tone="indigo" />
          <MetricCard icon={Wallet} label="Order value" value={`৳${totalValue.toLocaleString()}`} detail="not yet printed" tone="emerald" />
          <MetricCard icon={CalendarClock} label="Oldest waiting" value={oldestWaiting ?? '—'} detail="since confirmation" />
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Ready to print</h2>
              <p className="mt-1 text-xs text-slate-400">Select which orders to include, choose a template and document type, then print.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedTemplateId}
                onChange={setSelectedTemplateId}
                options={
                  templates.length === 0
                    ? [{ value: '', label: 'Default layout' }]
                    : templates.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? ' (default)' : ''}` }))
                }
              />
              <Select value={docType} onChange={(v) => setDocType(v as PrintDocType)} options={DOC_TYPE_OPTIONS} />
              <button
                onClick={() => setModalOpen(true)}
                disabled={selectedIds.size === 0}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Printer size={14} /> Print ({selectedIds.size})
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Order #, customer, phone"
                className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
              />
            </div>
            <Select
              value={stageFilter}
              onChange={(v) => setStageFilter(v as StageFilter)}
              options={[
                { value: 'all', label: 'All stages' },
                { value: 'Confirmed', label: STAGE_LABEL.Confirmed },
                { value: 'Processing', label: STAGE_LABEL.Processing },
              ]}
            />
            <Select
              value={warehouseFilter}
              onChange={setWarehouseFilter}
              options={[
                { value: 'all', label: 'All warehouses' },
                ...warehouses.map((w) => ({ value: w.id, label: w.name })),
                { value: 'unassigned', label: 'Unassigned' },
              ]}
            />
            <div className="flex items-center gap-1.5 text-sm text-slate-400">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
              />
              <span>to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
              />
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                <X size={14} /> Clear filters
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading orders ready to print...</div>
          ) : orders.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 px-8 text-center">
              <Printer size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">Nothing to print right now</p>
              <p className="max-w-md text-sm text-slate-400">Every confirmed order has already been printed, or nothing's been confirmed yet.</p>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 px-8 text-center">
              <Search size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">No orders match your filters</p>
              <button onClick={clearFilters} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">Clear filters</button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {filteredSelectedCount} of {filteredOrders.length} selected
                {hasActiveFilters && orders.length !== filteredOrders.length && (
                  <span className="font-normal text-slate-400">(filtered from {orders.length})</span>
                )}
              </div>
              <div className="divide-y divide-slate-100">
                {filteredOrders.map((order) => {
                  const itemCount = order.lineItems.reduce((s, li) => s + li.quantity, 0);
                  const firstItem = order.lineItems[0];
                  return (
                    <div key={order.id} className="flex items-center gap-3 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelected(order.id)}
                        className="h-4 w-4 shrink-0 rounded border-slate-300"
                      />
                      {firstItem?.image ? (
                        <img src={firstItem.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100">
                          <Package size={14} className="text-slate-400" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{order.number}</p>
                        <p className="truncate text-xs text-slate-400">{order.customerName ?? 'Unknown customer'} · {itemCount} item{itemCount === 1 ? '' : 's'}</p>
                      </div>
                      <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset', STAGE_TONE[order.stage])}>
                        {STAGE_LABEL[order.stage]}
                      </span>
                      <div className="w-24 shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-slate-900">{order.currency} {order.total.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-400">{ageLabel(order.createdAt)} ago</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <PrintOrderModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        orders={selectedOrders}
        docType={docType}
        binLookup={binLookup}
        template={selectedTemplate}
        onOrdersProcessed={() => {
          setModalOpen(false);
          void load();
        }}
      />
    </div>
  );
}
