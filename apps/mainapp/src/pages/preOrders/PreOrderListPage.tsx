import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Boxes,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Package,
  PackageCheck,
  PackagePlus,
  Pencil,
  Search,
  Target,
  Truck,
} from "lucide-react";
import {
  listStockShortfalls,
  listPreOrderTargets,
  setPreOrderTarget,
  listSuppliers,
  listWarehouses,
  getOpenShipments,
  createInventoryInboundBulk,
  setInventoryCount,
  listBins,
  type StockShortfallRowDTO,
  type StockShortfallLocationDTO,
  type StockShortfallsSummaryDTO,
  type SupplierDTO,
  type WarehouseDTO,
  type OpenShipmentDTO,
  type InventoryLevelDTO,
  type InventoryInboundPayload,
} from "../../lib/commerceApi";
import type { PreOrderTargetDTO } from "@zetsales/shared";
import { STAGE_LABEL } from "../../components/orders/orderTone";
import { useToast } from "../../components/ui/ToastProvider";
import {
  MetricCard,
  IncomingCell,
  ageLabel,
  BinPicker,
  hasRealBins,
} from "../inventory/InventoryPage";
import { Select } from "../../components/ui/Select";

const PAGE_SIZE = 50;

function skuKey(productId: string | null, variantId: string | null) {
  return `${productId ?? ""}::${variantId ?? ""}`;
}

function daysSince(iso: string | null) {
  if (!iso) return null;
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000)),
  );
}

function AgingBadge({ days }: { days: number | null }) {
  if (days == null) return null;
  const tone =
    days >= 21
      ? "bg-rose-50 text-rose-700"
      : days >= 10
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-500";
  return (
    <span
      className={clsx(
        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        tone,
      )}
    >
      {days === 0 ? "today" : `${days}d waiting`}
    </span>
  );
}

function TargetProgress({
  shortageNow,
  target,
  onSave,
}: {
  shortageNow: number;
  target: number | null;
  onSave: (value: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(target ?? ""));
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <form
        className="flex items-center gap-1.5"
        onSubmit={async (e) => {
          e.preventDefault();
          const value = Number(draft);
          if (!Number.isFinite(value) || value <= 0) return;
          setSaving(true);
          await onSave(Math.round(value));
          setSaving(false);
          setEditing(false);
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setEditing(false)}
          type="number"
          min={1}
          className="h-6 w-16 rounded-md border border-slate-200 px-1.5 text-[11px] outline-none focus:border-indigo-400"
        />
        <button
          type="submit"
          disabled={saving}
          className="text-[11px] font-semibold text-indigo-600 hover:underline"
        >
          {saving ? "..." : "Save"}
        </button>
      </form>
    );
  }

  if (!target) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-indigo-600"
      >
        <Target size={10} /> Set import target
      </button>
    );
  }

  const pct = Math.min(100, Math.round((shortageNow / target) * 100));
  const ready = shortageNow >= target;
  return (
    <button
      onClick={() => setEditing(true)}
      className="group block w-full max-w-[140px] text-left"
    >
      <div className="flex items-center justify-between text-[10px]">
        <span
          className={clsx(
            "font-bold tabular-nums",
            ready ? "text-emerald-600" : "text-slate-500",
          )}
        >
          {shortageNow}/{target} to import
        </span>
        <Pencil
          size={9}
          className="text-slate-300 opacity-0 group-hover:opacity-100"
        />
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx(
            "h-full rounded-full",
            ready ? "bg-emerald-500" : "bg-indigo-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {ready && (
        <p className="mt-0.5 text-[9px] font-semibold text-emerald-600">
          Ready to import
        </p>
      )}
    </button>
  );
}

// When exactly one row is selected and it's already stocked at exactly one location, default the
// warehouse/bin fields to that location instead of "first warehouse / Unassigned" — this is almost
// always a top-up of stock that's already sitting somewhere specific, not a brand-new location, and
// silently defaulting to Unassigned made "Add to stock"/"Add incoming" quietly create a second,
// disconnected location entry for the same SKU instead of adding to the one already tracked. Stays
// generic ("first warehouse") once more than one row or more than one existing location is involved
// — there's no single right guess left to make.
function defaultLocationFor(
  rows: StockShortfallRowDTO[],
  warehouses: WarehouseDTO[],
): { warehouseId: string; bin: string } {
  const onlyLocation =
    rows.length === 1 && rows[0].locations.length === 1
      ? rows[0].locations[0]
      : null;
  return {
    warehouseId: onlyLocation?.warehouseId ?? warehouses[0]?.id ?? "",
    bin: onlyLocation?.bin ?? "Unassigned",
  };
}

interface BulkIncomingModalProps {
  rows: StockShortfallRowDTO[];
  suppliers: SupplierDTO[];
  warehouses: WarehouseDTO[];
  onClose: () => void;
  onDone: () => void;
}

function BulkIncomingModal({
  rows,
  suppliers,
  warehouses,
  onClose,
  onDone,
}: BulkIncomingModalProps) {
  const toast = useToast();
  const defaultLocation = useMemo(
    () => defaultLocationFor(rows, warehouses),
    [rows, warehouses],
  );
  const [warehouseId, setWarehouseId] = useState(defaultLocation.warehouseId);
  const [bin, setBin] = useState(defaultLocation.bin);
  const [supplierId, setSupplierId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      rows.map((r) => [
        skuKey(r.productId, r.variantId),
        Math.max(1, r.orderNeed || r.shortageNow || 1),
      ]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  const [binOptions, setBinOptions] = useState<string[]>([]);
  const [binsLoaded, setBinsLoaded] = useState(false);
  useEffect(() => {
    setBinsLoaded(false);
    if (!warehouseId) return;
    void listBins(warehouseId).then((res) => {
      setBinOptions(res.bins);
      setBinsLoaded(true);
    });
  }, [warehouseId]);
  const usesBins = binsLoaded && hasRealBins(binOptions);

  const submit = async () => {
    if (!selectedWarehouse) return;
    setSubmitting(true);
    try {
      const supplier = suppliers.find((s) => s.id === supplierId);
      const items: InventoryInboundPayload[] = rows
        .filter((r) => r.productId && r.variantId)
        .map((r) => ({
          productId: r.productId!,
          variantId: r.variantId!,
          warehouseId: selectedWarehouse.id,
          warehouseName: selectedWarehouse.name,
          bin: bin.trim() || "Unassigned",
          quantity: Math.max(
            1,
            Math.round(quantities[skuKey(r.productId, r.variantId)] || 1),
          ),
          supplierId: supplier?.id,
          supplierName: supplier?.name,
        }));
      const res = await createInventoryInboundBulk(items);
      const failed = res.results.filter((r) => !r.success).length;
      toast.push(
        failed > 0
          ? `Logged ${items.length - failed} of ${items.length} — ${failed} failed.`
          : "Incoming stock logged.",
        failed > 0 ? "info" : "success",
      );
      onDone();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not log incoming stock.",
        "info",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-sm font-bold text-slate-900">
          Import stock for {rows.length} SKU{rows.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          One shipment, arriving at the same warehouse from the same supplier.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className={usesBins ? undefined : "col-span-2"}>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Warehouse
            </label>
            <Select
              value={warehouseId}
              onChange={(v) => {
                setWarehouseId(v);
                setBin("Unassigned");
              }}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </div>
          {usesBins && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Shelf/Bin
              </label>
              <BinPicker value={bin} onChange={setBin} options={binOptions} />
            </div>
          )}
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Supplier (optional)
            </label>
            <Select
              value={supplierId}
              onChange={setSupplierId}
              options={[
                { value: "", label: "No supplier selected" },
                ...suppliers.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((r) => {
            const key = skuKey(r.productId, r.variantId);
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {r.productTitle ?? r.sku}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {r.variantLabel ?? r.sku}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={quantities[key]}
                  onChange={(e) =>
                    setQuantities((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value),
                    }))
                  }
                  className="h-8 w-20 shrink-0 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !warehouseId}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            <Truck size={14} /> Add incoming
          </button>
        </div>
      </div>
    </div>
  );
}

// For staff who already have the stock in hand (not "on the way") and just want it counted —
// same rows/warehouse/bin UI as BulkIncomingModal, but writes straight to onHand via the same
// 'Restock' count reason New Count uses (see InventoryPage.tsx), instead of the inbound→receive
// two-step. Pre-orders recompute off live onHand the same load() already triggers on completion,
// so a pre-order becomes packable immediately, same as it would after receiving an inbound shipment.
function BulkAddToStockModal({
  rows,
  warehouses,
  onClose,
  onDone,
}: Omit<BulkIncomingModalProps, "suppliers">) {
  const toast = useToast();
  const defaultLocation = useMemo(
    () => defaultLocationFor(rows, warehouses),
    [rows, warehouses],
  );
  const [warehouseId, setWarehouseId] = useState(defaultLocation.warehouseId);
  const [bin, setBin] = useState(defaultLocation.bin);
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      rows.map((r) => [
        skuKey(r.productId, r.variantId),
        Math.max(1, r.orderNeed || r.shortageNow || 1),
      ]),
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const selectedWarehouse = warehouses.find((w) => w.id === warehouseId);

  const [binOptions, setBinOptions] = useState<string[]>([]);
  const [binsLoaded, setBinsLoaded] = useState(false);
  useEffect(() => {
    setBinsLoaded(false);
    if (!warehouseId) return;
    void listBins(warehouseId).then((res) => {
      setBinOptions(res.bins);
      setBinsLoaded(true);
    });
  }, [warehouseId]);
  const usesBins = binsLoaded && hasRealBins(binOptions);

  const submit = async () => {
    if (!selectedWarehouse) return;
    setSubmitting(true);
    try {
      const eligible = rows.filter((r) => r.productId && r.variantId);
      const results = await Promise.allSettled(
        eligible.map((r) => {
          const existingOnHand =
            r.locations.find(
              (l) =>
                l.warehouseId === selectedWarehouse.id && l.bin === bin.trim(),
            )?.onHand ?? 0;
          const enteredQty = Math.max(
            1,
            Math.round(quantities[skuKey(r.productId, r.variantId)] || 1),
          );
          return setInventoryCount({
            productId: r.productId!,
            variantId: r.variantId!,
            warehouseId: selectedWarehouse.id,
            warehouseName: selectedWarehouse.name,
            bin: bin.trim() || "Unassigned",
            quantity: existingOnHand + enteredQty,
            reason: "Restock",
          });
        }),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      toast.push(
        failed > 0
          ? `Added ${eligible.length - failed} of ${eligible.length} — ${failed} failed.`
          : "Added to stock.",
        failed > 0 ? "info" : "success",
      );
      onDone();
    } catch (err) {
      toast.push((err as Error).message || "Could not add to stock.", "info");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <h2 className="text-sm font-bold text-slate-900">
          Add stock for {rows.length} SKU{rows.length === 1 ? "" : "s"}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Already have it in hand — adds straight to on-hand stock, no
          incoming/receive step.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className={usesBins ? undefined : "col-span-2"}>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Warehouse
            </label>
            <Select
              value={warehouseId}
              onChange={(v) => {
                setWarehouseId(v);
                setBin("Unassigned");
              }}
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
          </div>
          {usesBins && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                Shelf/Bin
              </label>
              <BinPicker value={bin} onChange={setBin} options={binOptions} />
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {rows.map((r) => {
            const key = skuKey(r.productId, r.variantId);
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {r.productTitle ?? r.sku}
                  </p>
                  <p className="truncate text-[11px] text-slate-400">
                    {r.variantLabel ?? r.sku}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={quantities[key]}
                  onChange={(e) =>
                    setQuantities((prev) => ({
                      ...prev,
                      [key]: Number(e.target.value),
                    }))
                  }
                  className="h-8 w-20 shrink-0 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !warehouseId}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
          >
            <Boxes size={14} /> Add to stock
          </button>
        </div>
      </div>
    </div>
  );
}

export function PreOrderListPage() {
  const toast = useToast();
  const [rows, setRows] = useState<StockShortfallRowDTO[]>([]);
  const [summary, setSummary] = useState<StockShortfallsSummaryDTO>({
    skuCount: 0,
    affectedOrderCount: 0,
    shortageUnits: 0,
    orderUnits: 0,
    incomingCoverageUnits: 0,
  });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Record<string, PreOrderTargetDTO>>({});
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [openShipments, setOpenShipments] = useState<OpenShipmentDTO[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [addToStockModalOpen, setAddToStockModalOpen] = useState(false);
  // Mobile-only: "Pre-ordered by" starts collapsed to a one-line summary per row — the full
  // order/customer list is a lot of vertical space to spend by default on a phone screen. Desktop
  // (lg+) always shows it expanded, same as before this existed.
  const [expandedOrdersKeys, setExpandedOrdersKeys] = useState<Set<string>>(new Set());

  const load = async (searchValue = search, targetPage = 1) => {
    setLoading(true);
    try {
      const res = await listStockShortfalls({
        search: searchValue.trim() || undefined,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setRows(res.rows);
      setSummary(res.summary);
      setTotal(res.total);
      setPage(targetPage);
      setLoaded(true);
    } catch {
      toast.push("Could not load pre-orders.", "info");
    } finally {
      setLoading(false);
    }
  };

  const refreshShipments = () =>
    void getOpenShipments().then((res) => setOpenShipments(res.shipments));

  useEffect(() => {
    void load();
    refreshShipments();
    void listPreOrderTargets().then((res) =>
      setTargets(
        Object.fromEntries(
          res.targets.map((t) => [skuKey(t.productId, t.variantId), t]),
        ),
      ),
    );
    void listSuppliers().then((res) => setSuppliers(res.suppliers));
    void listWarehouses().then((res) => setWarehouses(res.warehouses));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const handle = setTimeout(() => void load(search, 1), 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const shipmentKey = (s: {
    productId: string | null;
    variantId: string | null;
    warehouseId: string;
    bin: string;
  }) => `${s.productId}::${s.variantId}::${s.warehouseId}::${s.bin}`;
  const openShipmentsByLevelKey = useMemo(() => {
    const map = new Map<string, OpenShipmentDTO[]>();
    for (const s of openShipments) {
      const key = shipmentKey(s);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [openShipments]);
  const overdueDaysByLevelKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of openShipments) {
      if (s.daysOverdue == null) continue;
      const key = shipmentKey(s);
      map.set(key, Math.max(map.get(key) ?? 0, s.daysOverdue));
    }
    return map;
  }, [openShipments]);

  const levelForLocation = (
    row: StockShortfallRowDTO,
    location: StockShortfallLocationDTO,
  ): InventoryLevelDTO => ({
    id: location.id,
    productId: row.productId,
    variantId: row.variantId,
    sku: row.sku,
    productTitle: row.productTitle,
    productImage: row.productImage,
    variantLabel: row.variantLabel,
    warehouseId: location.warehouseId,
    warehouseName: location.warehouseName,
    bin: location.bin,
    onHand: location.onHand,
    reserved: location.reserved,
    inbound: location.inbound,
    unitCost: null,
    pendingUnitCost: null,
    reorderPoint: location.reorderPoint,
    updatedAt: new Date(0).toISOString(),
    createdAt: new Date(0).toISOString(),
  });

  function importSuggestion(row: StockShortfallRowDTO): {
    quantity: number;
    warehouseId: string;
  } {
    let restockTopUp = 0;
    let targetLocation: StockShortfallLocationDTO | null = null;
    for (const location of row.locations) {
      if (location.reorderPoint != null)
        restockTopUp += Math.max(
          0,
          location.reorderPoint - location.free - location.inbound,
        );
      if (!targetLocation || location.free < targetLocation.free)
        targetLocation = location;
    }
    return {
      quantity: Math.max(row.orderNeed, restockTopUp, 1),
      warehouseId: targetLocation?.warehouseId ?? warehouses[0]?.id ?? "",
    };
  }

  const readyToOrderCount = rows.filter((r) => {
    const t = targets[skuKey(r.productId, r.variantId)];
    return t && r.shortageNow >= t.targetQuantity;
  }).length;

  const rowKey = (row: StockShortfallRowDTO) =>
    skuKey(row.productId, row.variantId);
  const selectableRows = rows.filter((r) => r.productId && r.variantId);
  const selectedRows = selectableRows.filter((r) =>
    selectedKeys.has(rowKey(r)),
  );

  const toggleSelected = (row: StockShortfallRowDTO) => {
    const key = rowKey(row);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleOrdersExpanded = (key: string) => {
    setExpandedOrdersKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveTarget = async (row: StockShortfallRowDTO, value: number) => {
    if (!row.productId || !row.variantId) return;
    const res = await setPreOrderTarget(row.productId, row.variantId, value);
    setTargets((prev) => ({
      ...prev,
      [skuKey(row.productId, row.variantId)]: res.target,
    }));
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <h1 className="zs-page-title">Pre-Orders</h1>
        <p className="zs-page-description">
          Everything sold but not in stock yet — what's waiting, for how long,
          and what's ready to import.
        </p>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              Waiting {summary.affectedOrderCount.toLocaleString()}
            </span>
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500">
              Ready {readyToOrderCount.toLocaleString()}
            </span>
          </div>
          <div className="zs-toolbox-right">
            {selectableRows.length > 0 && (
              <div className="flex items-center gap-3 text-xs font-semibold">
                {selectedKeys.size < selectableRows.length && (
                  <button
                    onClick={() =>
                      setSelectedKeys(new Set(selectableRows.map(rowKey)))
                    }
                    className="text-indigo-600 hover:underline"
                  >
                    Select all ({selectableRows.length})
                  </button>
                )}
                {selectedKeys.size > 0 && (
                  <button
                    onClick={() => setSelectedKeys(new Set())}
                    className="text-slate-500 hover:underline"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            )}
            {selectedKeys.size > 0 && (
              <button
                onClick={() => setAddToStockModalOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3.5 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
              >
                <Boxes size={14} /> Add to stock ({selectedKeys.size})
              </button>
            )}
            {selectedKeys.size > 0 && (
              <button
                onClick={() => setModalOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Truck size={14} /> Add incoming ({selectedKeys.size})
              </button>
            )}
            <div className="zs-search">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, variant or SKU"
                className="zs-search-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="zs-page-body space-y-4">
        <div className="zs-summary-strip">
          <MetricCard
            icon={PackagePlus}
            label="Need to import"
            value={summary.orderUnits.toLocaleString()}
            detail="units after incoming stock"
            tone={summary.orderUnits > 0 ? "rose" : "emerald"}
          />
          <MetricCard
            icon={AlertTriangle}
            label="Pre-ordered now"
            value={summary.shortageUnits.toLocaleString()}
            detail="units blocking orders"
            tone={summary.shortageUnits > 0 ? "amber" : "emerald"}
          />
          <MetricCard
            icon={ClipboardCheck}
            label="Waiting customers"
            value={summary.affectedOrderCount.toLocaleString()}
            detail={`${summary.skuCount.toLocaleString()} SKU${summary.skuCount === 1 ? "" : "s"}`}
          />
          <MetricCard
            icon={Truck}
            label="Already shipped"
            value={summary.incomingCoverageUnits.toLocaleString()}
            detail="pre-ordered units already inbound"
            tone="indigo"
          />
          <MetricCard
            icon={Target}
            label="Ready to import"
            value={readyToOrderCount.toLocaleString()}
            detail="SKUs at their import target"
            tone="emerald"
          />
        </div>

        <section className="zs-surface overflow-hidden">
          {loading && !loaded ? (
            <div className="zs-loading-state">Loading pre-orders...</div>
          ) : rows.length === 0 ? (
            <div className="zs-empty-state">
              <PackageCheck size={28} className="text-slate-300" />
              <p className="text-sm font-semibold text-slate-700">
                No pre-orders right now
              </p>
              <p className="max-w-md text-sm text-slate-400">
                Every order taken is either covered by stock on hand or the item
                isn't tracked in Inventory yet.
              </p>
            </div>
          ) : (
            <div className="zs-table-body">
              {rows.map((row) => {
                const rowIncomingLevels = row.locations
                  .map((location) => levelForLocation(row, location))
                  .filter((level): level is InventoryLevelDTO =>
                    Boolean(level && level.inbound > 0),
                  );
                const singleIncomingLevel =
                  rowIncomingLevels.length === 1 ? rowIncomingLevels[0] : null;
                const key = rowKey(row);
                const canLogIncoming = Boolean(row.productId && row.variantId);
                const suggestion = canLogIncoming
                  ? importSuggestion(row)
                  : null;
                const isSelected = selectedKeys.has(key);
                const target = targets[key]?.targetQuantity ?? null;
                return (
                  <div key={key} className="zs-data-row">
                    <div className="grid xl:grid-cols-[minmax(0,1fr)_360px]">
                      {/* Identity + stock status + locations */}
                      <div className="min-w-0 border-b border-slate-100 p-4 xl:border-b-0 xl:border-r xl:border-slate-100">
                        <div className="flex min-w-0 items-start gap-3">
                          {canLogIncoming && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelected(row)}
                              className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              aria-label={`Select ${row.productTitle ?? row.sku}`}
                            />
                          )}
                          {row.productImage ? (
                            <img
                              src={row.productImage}
                              alt={row.productTitle ?? ""}
                              className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                              <Package size={16} />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="truncate font-semibold text-slate-900">
                                {row.productTitle ?? "Inventory item"}
                              </p>
                              {row.orderNeed > 0 ? (
                                <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-inset ring-rose-600/20">
                                  Need to import
                                </span>
                              ) : (
                                <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                                  Already ordered
                                </span>
                              )}
                              <AgingBadge days={daysSince(row.oldestOrderAt)} />
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-400">
                              {row.variantLabel ? `${row.variantLabel} - ` : ""}
                              SKU {row.sku}
                            </p>
                          </div>
                        </div>

                        {/* Stock flow: same amber/emerald/indigo/rose language as the summary
                            cards above, so a glance at a row reads the same way the page-level
                            totals do — pre-ordered -> covered by free/incoming -> what's left short. */}
                        <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                          <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              Pre-ordered
                            </p>
                            <p className="font-bold tabular-nums text-slate-900">
                              {row.demand}
                            </p>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-2.5 py-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/70">
                              Free now
                            </p>
                            <p className="font-bold tabular-nums text-emerald-700">
                              {row.availableNow}
                            </p>
                          </div>
                          <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 px-2.5 py-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700/70">
                              Incoming
                            </p>
                            {singleIncomingLevel ? (
                              <IncomingCell
                                level={singleIncomingLevel}
                                onReceived={refreshShipments}
                                overdueDays={
                                  overdueDaysByLevelKey.get(
                                    shipmentKey(singleIncomingLevel),
                                  ) ?? null
                                }
                                shipments={
                                  openShipmentsByLevelKey.get(
                                    shipmentKey(singleIncomingLevel),
                                  ) ?? []
                                }
                                variant="shortfall"
                              />
                            ) : (
                              <p className="font-bold tabular-nums text-indigo-700">
                                {row.inbound}
                              </p>
                            )}
                          </div>
                          <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-1.5">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700/70">
                              Short now
                            </p>
                            <p className="font-bold tabular-nums text-amber-700">
                              {row.shortageNow}
                            </p>
                          </div>
                          <div
                            className={clsx(
                              "rounded-lg border px-2.5 py-1.5",
                              row.orderNeed > 0
                                ? "border-rose-100 bg-rose-50/50"
                                : "border-emerald-100 bg-emerald-50/50",
                            )}
                          >
                            <p
                              className={clsx(
                                "text-[10px] font-semibold uppercase tracking-wide",
                                row.orderNeed > 0
                                  ? "text-rose-700/70"
                                  : "text-emerald-700/70",
                              )}
                            >
                              Need to import
                            </p>
                            <p
                              className={clsx(
                                "font-bold tabular-nums",
                                row.orderNeed > 0
                                  ? "text-rose-700"
                                  : "text-emerald-700",
                              )}
                            >
                              {row.orderNeed}
                            </p>
                          </div>
                        </div>
                        {suggestion && suggestion.quantity > row.orderNeed && (
                          <p className="mt-1.5 text-[11px] font-semibold text-indigo-600">
                            Suggest importing {suggestion.quantity} to also
                            refill the reorder point
                          </p>
                        )}

                        {/* Locations + import target, separated from the stock-flow numbers above */}
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                          {row.locations.map((location) => {
                            const locationLevel = levelForLocation(
                              row,
                              location,
                            );
                            return (
                              <span
                                key={`${location.warehouseId}-${location.bin}`}
                                className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 ring-1 ring-inset ring-slate-100"
                              >
                                <span>
                                  {location.warehouseName}
                                  {location.bin !== "Unassigned"
                                    ? ` / ${location.bin}`
                                    : ""}
                                  :{" "}
                                  <span className="font-semibold tabular-nums text-slate-700">
                                    {location.free}
                                  </span>{" "}
                                  free
                                </span>
                                {location.inbound > 0 && locationLevel ? (
                                  <IncomingCell
                                    level={locationLevel}
                                    onReceived={refreshShipments}
                                    overdueDays={
                                      overdueDaysByLevelKey.get(
                                        shipmentKey(locationLevel),
                                      ) ?? null
                                    }
                                    shipments={
                                      openShipmentsByLevelKey.get(
                                        shipmentKey(locationLevel),
                                      ) ?? []
                                    }
                                    variant="shortfall"
                                  />
                                ) : location.inbound > 0 ? (
                                  <span>, {location.inbound} incoming</span>
                                ) : null}
                              </span>
                            );
                          })}
                          <TargetProgress
                            shortageNow={row.shortageNow}
                            target={target}
                            onSave={(value) => saveTarget(row, value)}
                          />
                        </div>

                        {/* Actions live on their own row, not squeezed between badges */}
                        {suggestion && (
                          <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                              onClick={() => {
                                setSelectedKeys(new Set([key]));
                                setAddToStockModalOpen(true);
                              }}
                              className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-600 hover:bg-indigo-50"
                            >
                              <Boxes size={13} /> Add to stock
                            </button>
                            <button
                              onClick={() => {
                                setSelectedKeys(new Set([key]));
                                setModalOpen(true);
                              }}
                              className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700"
                            >
                              <Truck size={13} /> Add incoming
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Pre-ordered by: an actual labeled mini-table instead of unlabeled stacked rows.
                          Desktop (lg+) always shows it expanded; mobile starts collapsed to one line —
                          see toggleOrdersExpanded/expandedOrdersKeys. */}
                      <div className="hidden min-w-0 flex-col bg-slate-50/40 p-4 lg:flex xl:bg-transparent">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                            Pre-ordered by
                          </p>
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                            {row.orderCount}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_64px] gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          <span>Order / customer</span>
                          <span className="text-right">Short</span>
                        </div>
                        <div className="mt-1 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                          {row.orders.map((order) => (
                            <div
                              key={order.orderId}
                              className="grid grid-cols-[minmax(0,1fr)_64px] items-start gap-x-2 px-2.5 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-slate-800">
                                    {order.orderNumber}
                                  </span>
                                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                    {STAGE_LABEL[order.stage]}
                                  </span>
                                </div>
                                <p className="mt-0.5 truncate text-slate-500">
                                  {order.customerName ??
                                    order.customerPhone ??
                                    "Unknown customer"}
                                </p>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <CalendarClock
                                    size={10}
                                    className="text-slate-300"
                                  />
                                  <p className="text-slate-400">
                                    {ageLabel(order.createdAt)} ago
                                  </p>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="font-bold tabular-nums text-rose-600">
                                  {order.shortQuantity}
                                </p>
                                <p className="text-slate-400">
                                  of {order.quantity}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Mobile-only collapsed/expandable version of the same panel above. */}
                      <div className="flex min-w-0 flex-col bg-slate-50/40 p-4 lg:hidden">
                        <button
                          onClick={() => toggleOrdersExpanded(key)}
                          className="flex w-full items-center justify-between"
                        >
                          <span className="flex items-center gap-1.5">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                              Pre-ordered by
                            </p>
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                              {row.orderCount}
                            </span>
                          </span>
                          <ChevronDown
                            size={14}
                            className={clsx(
                              "text-slate-400 transition-transform",
                              expandedOrdersKeys.has(key) && "rotate-180",
                            )}
                          />
                        </button>
                        {expandedOrdersKeys.has(key) && (
                          <>
                            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_64px] gap-x-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              <span>Order / customer</span>
                              <span className="text-right">Short</span>
                            </div>
                            <div className="mt-1 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                              {row.orders.map((order) => (
                                <div
                                  key={order.orderId}
                                  className="grid grid-cols-[minmax(0,1fr)_64px] items-start gap-x-2 px-2.5 py-2 text-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-slate-800">
                                        {order.orderNumber}
                                      </span>
                                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                        {STAGE_LABEL[order.stage]}
                                      </span>
                                    </div>
                                    <p className="mt-0.5 truncate text-slate-500">
                                      {order.customerName ??
                                        order.customerPhone ??
                                        "Unknown customer"}
                                    </p>
                                    <div className="mt-0.5 flex items-center gap-1.5">
                                      <CalendarClock
                                        size={10}
                                        className="text-slate-300"
                                      />
                                      <p className="text-slate-400">
                                        {ageLabel(order.createdAt)} ago
                                      </p>
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="font-bold tabular-nums text-rose-600">
                                      {order.shortQuantity}
                                    </p>
                                    <p className="text-slate-400">
                                      of {order.quantity}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
              <span className="text-xs text-slate-400">
                Showing{" "}
                <span className="font-medium text-slate-600">
                  {(page - 1) * PAGE_SIZE + 1}
                </span>
                -
                <span className="font-medium text-slate-600">
                  {Math.min(total, page * PAGE_SIZE)}
                </span>{" "}
                of{" "}
                <span className="font-medium text-slate-600">
                  {total.toLocaleString()}
                </span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void load(search, Math.max(1, page - 1))}
                  disabled={page <= 1 || loading}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft size={12} /> Prev
                </button>
                <span className="min-w-[76px] text-center text-xs text-slate-400">
                  Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <button
                  onClick={() =>
                    void load(
                      search,
                      Math.min(
                        Math.max(1, Math.ceil(total / PAGE_SIZE)),
                        page + 1,
                      ),
                    )
                  }
                  disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next <ArrowRight size={12} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {modalOpen && (
        <BulkIncomingModal
          rows={selectedRows}
          suppliers={suppliers}
          warehouses={warehouses}
          onClose={() => setModalOpen(false)}
          onDone={() => {
            setModalOpen(false);
            setSelectedKeys(new Set());
            void load(search, page);
            refreshShipments();
          }}
        />
      )}
      {addToStockModalOpen && (
        <BulkAddToStockModal
          rows={selectedRows}
          warehouses={warehouses}
          onClose={() => setAddToStockModalOpen(false)}
          onDone={() => {
            setAddToStockModalOpen(false);
            setSelectedKeys(new Set());
            void load(search, page);
            refreshShipments();
          }}
        />
      )}
    </div>
  );
}
