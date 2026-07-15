import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Package,
  PackageCheck,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Truck,
  Undo2,
  Warehouse,
} from "lucide-react";
import {
  getReturnsQueue,
  receiveReturnPackage,
  confirmReturnPackageQc,
  receiveAndConfirmReturnPackage,
  searchDeliveredOrders,
  processManualReturn,
  getInventorySettings,
  updateInventorySettings,
  listWarehouses,
  listSuppliers,
  listBins,
  listInventorySkuOptions,
  type ReturnsPackageDTO,
  type ReturnsPackageActionPayload,
  type QcResult,
  type ReturnsWorkflow,
  type WarehouseDTO,
  type SupplierDTO,
  type InventorySkuOptionDTO,
  type ManualReturnSearchResultDTO,
} from "../../lib/commerceApi";
import { Popover } from "../../components/ui/Popover";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/ToastProvider";
import {
  ageLabel,
  hasRealBins,
  FilterPicker,
  WarehousePicker,
  BinPicker,
  NewCountModal,
} from "../inventory/InventoryPage";

const RETURNS_AGING_DAYS = 3;
function isAgingPackage(pkg: { waitingSince: string; isHeld: boolean }) {
  return (
    !pkg.isHeld &&
    Date.now() - new Date(pkg.waitingSince).getTime() >
      RETURNS_AGING_DAYS * 24 * 60 * 60 * 1000
  );
}

function ReturnsPackageCard({
  pkg,
  warehouses,
  showsLocation,
  onSubmit,
  onDone,
}: {
  pkg: ReturnsPackageDTO;
  warehouses: WarehouseDTO[];
  showsLocation?: boolean;
  onSubmit: (
    orderId: string,
    payload: ReturnsPackageActionPayload,
  ) => Promise<{ success: boolean; message?: string }>;
  onDone: () => void;
}) {
  const toast = useToast();
  // Defaults to wherever this order's stock actually shipped from — that's the same pickup point a
  // courier's RTO physically lands at, so it's a real prediction of where the box in front of you
  // is, not a guess. Falls back to the Returns Inspection warehouse, then whatever's first, for
  // orders placed before fulfillment warehouse tracking existed.
  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const fulfillment =
        pkg.fulfillmentWarehouseId &&
        warehouses.some((w) => w.id === pkg.fulfillmentWarehouseId)
          ? pkg.fulfillmentWarehouseId
          : null;
      setWarehouseId(
        fulfillment ??
          warehouses.find((w) => w.name === "Returns Inspection")?.id ??
          warehouses[0].id,
      );
    }
  }, [warehouses, warehouseId, pkg.fulfillmentWarehouseId]);
  // A returned package hasn't been put away to a real shelf yet either — same "Unassigned" default
  // as Incoming Stock, not a hardcoded guess at a specific holding bin.
  const [bin, setBin] = useState("Unassigned");
  const [binOptions, setBinOptions] = useState<string[]>([]);
  const [binsLoaded, setBinsLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const totalUnits = pkg.lineItems.reduce((sum, li) => sum + li.quantity, 0);
  const binListId = `bin-options-${pkg.orderId}`;

  // Bins aren't a managed thing here — most small businesses using this don't maintain them at
  // all, so this never blocks typing something new. It just suggests bins already used at this
  // warehouse, so reusing "R-1" instead of accidentally typing "R1" a second time is one click
  // instead of a guess. If this warehouse has never had a bin set (no predefined bins, no
  // historical usage), don't even show the field — asking for shelf detail a business has never
  // used just adds a box to skip past. The default "R-1" still goes along with the submission so
  // returns still land somewhere trackable.
  useEffect(() => {
    if (!warehouseId) return;
    setBinsLoaded(false);
    void listBins(warehouseId).then((res) => {
      setBinOptions(res.bins);
      setBinsLoaded(true);
    });
  }, [warehouseId]);
  const usesBins = binsLoaded && hasRealBins(binOptions);

  const submit = async () => {
    setSaving(true);
    try {
      const warehouse =
        warehouses.find((w) => w.id === warehouseId) ?? warehouses[0];
      const res = await onSubmit(pkg.orderId, {
        isPartial: pkg.isPartial,
        location:
          showsLocation && warehouse
            ? {
                warehouseId: warehouse.id,
                warehouseName: warehouse.name,
                bin: bin.trim(),
              }
            : undefined,
      });
      if (!res.success) {
        toast.push(res.message || "Could not process this package.", "info");
      } else {
        toast.push("Package moved forward.", "success");
        onDone();
      }
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not process this package.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-100 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-800">
              {pkg.orderNumber}
            </p>
            {pkg.isPartial && (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Partial return
              </span>
            )}
            {pkg.isHeld && (
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-600/20">
                On hold
              </span>
            )}
            {isAgingPackage(pkg) && (
              <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Aging
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-400">
            {pkg.customerName ?? "Unknown customer"} · {totalUnits} unit
            {totalUnits === 1 ? "" : "s"} · waiting{" "}
            <span
              className={
                isAgingPackage(pkg) ? "font-semibold text-rose-600" : undefined
              }
            >
              {ageLabel(pkg.waitingSince)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pkg.isHeld ? (
            <p className="max-w-[220px] text-right text-[11px] text-orange-600">
              {pkg.holdReason || "On hold"} — resume from Orders before
              processing.
            </p>
          ) : (
            <>
              {showsLocation && warehouses.length > 0 && (
                <>
                  <WarehousePicker
                    warehouses={warehouses}
                    value={warehouseId}
                    onChange={setWarehouseId}
                    compact
                  />
                  {usesBins && (
                    <BinPicker
                      value={bin}
                      onChange={setBin}
                      options={binOptions}
                      placeholder="Shelf/Bin"
                      compact
                    />
                  )}
                </>
              )}
              <button
                onClick={() => void submit()}
                disabled={saving}
                title="Confirms the box is physically in your hands and sends it to QC for inspection."
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PackageSearch size={13} /> Received{" "}
                <ArrowRight size={11} className="text-slate-400" /> Send to QC
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
        {pkg.lineItems.map((li, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs text-slate-500"
          >
            {li.image ? (
              <img
                src={li.image}
                alt=""
                className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                <Package size={10} />
              </div>
            )}
            <span className="truncate">
              {li.title}
              {li.variant ? ` — ${li.variant}` : ""}
            </span>
            <span className="ml-auto shrink-0 font-semibold text-slate-700">
              ×{li.quantity}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact sibling of SkuPicker for one specific micro-decision: "what did they actually send
// instead?" No standalone label (it reads inline, right under the Wrong Product reason), smaller
// footprint, otherwise the same search-and-pick mechanics.
function ReceivedInsteadPicker({
  value,
  onChange,
}: {
  value: InventorySkuOptionDTO | null;
  onChange: (option: InventorySkuOptionDTO) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<InventorySkuOptionDTO[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      void listInventorySkuOptions(query).then((res) =>
        setOptions(res.options),
      );
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {value && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 text-left text-xs text-slate-700 hover:bg-slate-50"
        >
          <span className="truncate">
            {value.productTitle} — {value.variantLabel}
          </span>
          <Pencil size={11} className="shrink-0 text-slate-400" />
        </button>
      ) : (
        <input
          autoFocus={open}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Search by product name or SKU..."
          className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-indigo-400"
        />
      )}
      {open && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400">
              No matching variants found.
            </div>
          ) : (
            options.map((option) => (
              <button
                key={option.variantId}
                type="button"
                onClick={() => {
                  onChange(option);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
              >
                {option.productImage ? (
                  <img
                    src={option.productImage}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                    <Package size={10} />
                  </div>
                )}
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-800">
                    {option.productTitle}
                  </span>
                  <span className="text-slate-400">
                    {" "}
                    — {option.variantLabel}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const QC_BAD_REASONS: NonNullable<QcResult["badReason"]>[] = [
  "Damaged stock",
  "Lost in transit",
  "Wrong Product",
];

const QC_REASON_META: Record<
  NonNullable<QcResult["badReason"]>,
  { icon: typeof AlertTriangle; description: string }
> = {
  "Damaged stock": {
    icon: AlertTriangle,
    description: "Arrived, but unsellable",
  },
  "Lost in transit": { icon: Truck, description: "Never actually showed up" },
  "Wrong Product": {
    icon: RefreshCw,
    description: "A different item came back than expected",
  },
};

// A native <select> hides the "why" behind a shortfall in a barely-readable dropdown — this shows
// each reason as its own row with an icon and a one-line explanation, so picking between "damaged"
// and "never arrived" is a glance, not a read.
function QcReasonPicker({
  value,
  onChange,
}: {
  value: NonNullable<QcResult["badReason"]>;
  onChange: (reason: NonNullable<QcResult["badReason"]>) => void;
}) {
  const meta = QC_REASON_META[value];
  return (
    <Popover
      align="right"
      widthClass="w-60"
      trigger={() => (
        <div className="flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 text-[11px] font-medium text-amber-700 hover:bg-amber-100">
          <meta.icon size={11} />
          {value}
          <ChevronDown size={10} />
        </div>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          {QC_BAD_REASONS.map((reason) => {
            const m = QC_REASON_META[reason];
            const selected = reason === value;
            return (
              <button
                key={reason}
                onClick={() => {
                  onChange(reason);
                  close();
                }}
                className={clsx(
                  "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  selected ? "bg-amber-50" : "hover:bg-slate-50",
                )}
              >
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    selected
                      ? "bg-amber-100 text-amber-700"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  <m.icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      "block text-xs font-semibold",
                      selected ? "text-amber-700" : "text-slate-700",
                    )}
                  >
                    {reason}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {m.description}
                  </span>
                </span>
                {selected && (
                  <Check size={13} className="mt-1 shrink-0 text-amber-600" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

const RETURNS_WORKFLOW_META: Record<
  ReturnsWorkflow,
  { label: string; description: string }
> = {
  combined: {
    label: "One step (same team)",
    description:
      "Receiving and QC happen together — match the order, check it, done in one action.",
  },
  separate: {
    label: "Two steps (separate QC team)",
    description:
      "Confirm physical receipt first; QC inspects and restocks separately, later.",
  },
};

// Whether receiving and QC are one click or two is a real per-business choice, not a fixed rule —
// most small/medium sellers have the same person do both in one pass, but a business with an
// actual separate QC department benefits from keeping the stages distinct. Exposed here, not
// buried in a settings page, since it's the one control that changes what the whole returns queue
// looks like.
function ReturnsWorkflowPicker({
  value,
  onChange,
}: {
  value: ReturnsWorkflow;
  onChange: (mode: ReturnsWorkflow) => void;
}) {
  const meta = RETURNS_WORKFLOW_META[value];
  return (
    <Popover
      align="right"
      widthClass="w-64"
      trigger={() => (
        <div className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
          <SlidersHorizontal size={12} className="text-slate-400" />
          {meta.label}
          <ChevronDown size={11} className="text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          {(Object.keys(RETURNS_WORKFLOW_META) as ReturnsWorkflow[]).map(
            (mode) => {
              const m = RETURNS_WORKFLOW_META[mode];
              const selected = mode === value;
              return (
                <button
                  key={mode}
                  onClick={() => {
                    onChange(mode);
                    close();
                  }}
                  className={clsx(
                    "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    selected ? "bg-indigo-50" : "hover:bg-slate-50",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={clsx(
                        "block text-xs font-semibold",
                        selected ? "text-indigo-700" : "text-slate-700",
                      )}
                    >
                      {m.label}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {m.description}
                    </span>
                  </span>
                  {selected && (
                    <Check
                      size={13}
                      className="mt-1 shrink-0 text-indigo-600"
                    />
                  )}
                </button>
              );
            },
          )}
        </div>
      )}
    </Popover>
  );
}

// The QC step is where someone actually opens the box and inspects contents — this is where a
// shortfall (never arrived, or arrived broken) is really discovered, not at "Mark received" (which
// is just "a box showed up for this order"). Defaults every line item to fully good so the common
// case (nothing wrong) is a single click; only editing a "Good" number down reveals the reason
// picker for the difference, since that's the one thing this step needs to get right — silently
// restocking a smaller number without a reason would just lose track of where the rest went.
function QcPackageCard({
  pkg,
  onDone,
  onLogFoundStock,
}: {
  pkg: ReturnsPackageDTO;
  onDone: () => void;
  onLogFoundStock: (option: InventorySkuOptionDTO, quantity: number) => void;
}) {
  const toast = useToast();
  const [good, setGood] = useState<Record<number, string>>(() =>
    Object.fromEntries(pkg.lineItems.map((li, i) => [i, String(li.quantity)])),
  );
  const [reasons, setReasons] = useState<
    Record<number, NonNullable<QcResult["badReason"]>>
  >({});
  const [receivedInstead, setReceivedInstead] = useState<
    Record<number, InventorySkuOptionDTO>
  >({});
  const [saving, setSaving] = useState(false);
  const totalUnits = pkg.lineItems.reduce((sum, li) => sum + li.quantity, 0);
  const hasShortfall = pkg.lineItems.some(
    (li, i) =>
      Math.min(li.quantity, Math.max(0, Number(good[i]) || 0)) < li.quantity,
  );

  const submit = async () => {
    setSaving(true);
    try {
      const results: QcResult[] = pkg.lineItems.map((li, i) => {
        const goodQuantity = Math.min(
          li.quantity,
          Math.max(0, Number(good[i]) || 0),
        );
        const instead = receivedInstead[i];
        return {
          sku: li.sku,
          variant: li.variant,
          goodQuantity,
          badReason:
            goodQuantity < li.quantity
              ? (reasons[i] ?? "Damaged stock")
              : undefined,
          receivedInstead: instead
            ? {
                sku: instead.sku,
                variant: instead.variantLabel,
                title: instead.productTitle,
              }
            : undefined,
        };
      });
      const res = await confirmReturnPackageQc(pkg.orderId, {
        isPartial: pkg.isPartial,
        results,
      });
      if (!res.success) {
        toast.push(res.message || "Could not process this package.", "info");
      } else {
        toast.push(
          hasShortfall
            ? "Restocked, with the shortfall logged as a loss."
            : "Package restocked.",
          "success",
        );
        onDone();
      }
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not process this package.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  if (pkg.isHeld) {
    return (
      <div className="rounded-lg border border-slate-100 px-3.5 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-slate-800">
                {pkg.orderNumber}
              </p>
              {pkg.isPartial && (
                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Partial return
                </span>
              )}
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-600/20">
                On hold
              </span>
            </div>
            <p className="truncate text-xs text-slate-400">
              {pkg.customerName ?? "Unknown customer"} · {totalUnits} unit
              {totalUnits === 1 ? "" : "s"} · waiting{" "}
              <span
                className={
                  isAgingPackage(pkg)
                    ? "font-semibold text-rose-600"
                    : undefined
                }
              >
                {ageLabel(pkg.waitingSince)}
              </span>
            </p>
          </div>
          <p className="max-w-[220px] shrink-0 text-right text-[11px] text-orange-600">
            {pkg.holdReason || "On hold"} — resume from Orders before
            processing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-100 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-800">
              {pkg.orderNumber}
            </p>
            {pkg.isPartial && (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Partial return
              </span>
            )}
            {isAgingPackage(pkg) && (
              <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Aging
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-400">
            {pkg.customerName ?? "Unknown customer"} · {totalUnits} unit
            {totalUnits === 1 ? "" : "s"} · waiting{" "}
            <span
              className={
                isAgingPackage(pkg) ? "font-semibold text-rose-600" : undefined
              }
            >
              {ageLabel(pkg.waitingSince)}
            </span>
          </p>
        </div>
        <button
          onClick={() => void submit()}
          disabled={saving}
          title={
            hasShortfall
              ? "Restocks only the confirmed-good units and logs the rest as a loss."
              : "All units confirmed good — restocks the full quantity."
          }
          className={clsx(
            "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40",
            hasShortfall
              ? "bg-amber-600 hover:bg-amber-500"
              : "bg-slate-900 hover:bg-slate-800",
          )}
        >
          {hasShortfall ? (
            <>
              <AlertTriangle size={13} /> Keep good, report loss
            </>
          ) : (
            <>
              <Undo2 size={13} /> Passed QC — restock
            </>
          )}
        </button>
      </div>
      <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
        {pkg.lineItems.map((li, i) => {
          const goodQty = Math.min(
            li.quantity,
            Math.max(0, Number(good[i]) || 0),
          );
          const badQty = li.quantity - goodQty;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {li.image ? (
                  <img
                    src={li.image}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                    <Package size={10} />
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {li.title}
                  {li.variant ? ` — ${li.variant}` : ""} · expected ×
                  {li.quantity}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  Good
                </span>
                <input
                  type="number"
                  min="0"
                  max={li.quantity}
                  value={good[i] ?? ""}
                  onChange={(e) =>
                    setGood((prev) => ({ ...prev, [i]: e.target.value }))
                  }
                  className="h-7 w-12 shrink-0 rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
                />
                {badQty > 0 && (
                  <>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-600">
                      {badQty} ×
                    </span>
                    <QcReasonPicker
                      value={reasons[i] ?? "Damaged stock"}
                      onChange={(reason) =>
                        setReasons((prev) => ({ ...prev, [i]: reason }))
                      }
                    />
                  </>
                )}
              </div>
              {badQty > 0 && reasons[i] === "Wrong Product" && (
                <div className="ml-8 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                  <p className="mb-1.5 text-right text-[11px] font-semibold text-indigo-700">
                    What did they actually send back?
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <ReceivedInsteadPicker
                        value={receivedInstead[i] ?? null}
                        onChange={(option) =>
                          setReceivedInstead((prev) => ({
                            ...prev,
                            [i]: option,
                          }))
                        }
                      />
                    </div>
                    {receivedInstead[i] && (
                      <button
                        type="button"
                        onClick={() =>
                          onLogFoundStock(receivedInstead[i], badQty)
                        }
                        className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                      >
                        <Plus size={11} /> Log as found stock
                      </button>
                    )}
                  </div>
                  {!receivedInstead[i] && (
                    <p className="mt-1.5 text-right text-[10px] text-indigo-400">
                      Search by product name or SKU. Once picked, you can log it
                      as found stock right here in one click.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// One-step version of the returns flow, for the common case where the same person receives the
// box and inspects it in the same motion — combines the warehouse/bin picker from
// ReturnsPackageCard with the per-line good/bad inputs from QcPackageCard, and submits both in one
// call. Only shown when the tenant's returnsWorkflow setting is 'combined'.
function ReceiveAndQcPackageCard({
  pkg,
  warehouses,
  onDone,
  onLogFoundStock,
}: {
  pkg: ReturnsPackageDTO;
  warehouses: WarehouseDTO[];
  onDone: () => void;
  onLogFoundStock: (option: InventorySkuOptionDTO, quantity: number) => void;
}) {
  const toast = useToast();
  // See ReturnsPackageCard above — same fulfillment-warehouse-first default.
  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const fulfillment =
        pkg.fulfillmentWarehouseId &&
        warehouses.some((w) => w.id === pkg.fulfillmentWarehouseId)
          ? pkg.fulfillmentWarehouseId
          : null;
      setWarehouseId(
        fulfillment ??
          warehouses.find((w) => w.name === "Returns Inspection")?.id ??
          warehouses[0].id,
      );
    }
  }, [warehouses, warehouseId, pkg.fulfillmentWarehouseId]);
  // A returned package hasn't been put away to a real shelf yet either — same "Unassigned" default
  // as Incoming Stock, not a hardcoded guess at a specific holding bin.
  const [bin, setBin] = useState("Unassigned");
  const [binOptions, setBinOptions] = useState<string[]>([]);
  const [binsLoaded, setBinsLoaded] = useState(false);
  useEffect(() => {
    if (!warehouseId) return;
    setBinsLoaded(false);
    void listBins(warehouseId).then((res) => {
      setBinOptions(res.bins);
      setBinsLoaded(true);
    });
  }, [warehouseId]);
  const usesBins = binsLoaded && hasRealBins(binOptions);
  const binListId = `bin-options-combined-${pkg.orderId}`;

  const [good, setGood] = useState<Record<number, string>>(() =>
    Object.fromEntries(pkg.lineItems.map((li, i) => [i, String(li.quantity)])),
  );
  const [reasons, setReasons] = useState<
    Record<number, NonNullable<QcResult["badReason"]>>
  >({});
  const [receivedInstead, setReceivedInstead] = useState<
    Record<number, InventorySkuOptionDTO>
  >({});
  const [saving, setSaving] = useState(false);
  const totalUnits = pkg.lineItems.reduce((sum, li) => sum + li.quantity, 0);
  const hasShortfall = pkg.lineItems.some(
    (li, i) =>
      Math.min(li.quantity, Math.max(0, Number(good[i]) || 0)) < li.quantity,
  );

  const submit = async () => {
    setSaving(true);
    try {
      const warehouse = warehouses.find((w) => w.id === warehouseId);
      const results: QcResult[] = pkg.lineItems.map((li, i) => {
        const goodQuantity = Math.min(
          li.quantity,
          Math.max(0, Number(good[i]) || 0),
        );
        const instead = receivedInstead[i];
        return {
          sku: li.sku,
          variant: li.variant,
          goodQuantity,
          badReason:
            goodQuantity < li.quantity
              ? (reasons[i] ?? "Damaged stock")
              : undefined,
          receivedInstead: instead
            ? {
                sku: instead.sku,
                variant: instead.variantLabel,
                title: instead.productTitle,
              }
            : undefined,
        };
      });
      const res = await receiveAndConfirmReturnPackage(pkg.orderId, {
        isPartial: pkg.isPartial,
        location: warehouse
          ? {
              warehouseId: warehouse.id,
              warehouseName: warehouse.name,
              bin: bin.trim(),
            }
          : undefined,
        results,
      });
      if (!res.success) {
        toast.push(res.message || "Could not process this package.", "info");
      } else {
        toast.push(
          hasShortfall
            ? "Restocked, with the shortfall logged as a loss."
            : "Received and restocked.",
          "success",
        );
        onDone();
      }
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not process this package.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  if (pkg.isHeld) {
    return (
      <div className="rounded-lg border border-slate-100 px-3.5 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-slate-800">
                {pkg.orderNumber}
              </p>
              {pkg.isPartial && (
                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Partial return
                </span>
              )}
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-600/20">
                On hold
              </span>
            </div>
            <p className="truncate text-xs text-slate-400">
              {pkg.customerName ?? "Unknown customer"} · {totalUnits} unit
              {totalUnits === 1 ? "" : "s"} · waiting{" "}
              <span
                className={
                  isAgingPackage(pkg)
                    ? "font-semibold text-rose-600"
                    : undefined
                }
              >
                {ageLabel(pkg.waitingSince)}
              </span>
            </p>
          </div>
          <p className="max-w-[220px] shrink-0 text-right text-[11px] text-orange-600">
            {pkg.holdReason || "On hold"} — resume from Orders before
            processing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-100 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-800">
              {pkg.orderNumber}
            </p>
            {pkg.isPartial && (
              <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                Partial return
              </span>
            )}
            {isAgingPackage(pkg) && (
              <span className="shrink-0 rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Aging
              </span>
            )}
          </div>
          <p className="truncate text-xs text-slate-400">
            {pkg.customerName ?? "Unknown customer"} · {totalUnits} unit
            {totalUnits === 1 ? "" : "s"} · waiting{" "}
            <span
              className={
                isAgingPackage(pkg) ? "font-semibold text-rose-600" : undefined
              }
            >
              {ageLabel(pkg.waitingSince)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {warehouses.length > 0 && (
            <>
              <WarehousePicker
                warehouses={warehouses}
                value={warehouseId}
                onChange={setWarehouseId}
                compact
              />
              {usesBins && (
                <BinPicker
                  value={bin}
                  onChange={setBin}
                  options={binOptions}
                  placeholder="Shelf/Bin"
                  compact
                />
              )}
            </>
          )}
          <button
            onClick={() => void submit()}
            disabled={saving}
            title={
              hasShortfall
                ? "Restocks only the confirmed-good units and logs the rest as a loss."
                : "All units confirmed good — receives and restocks the full quantity."
            }
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40",
              hasShortfall
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-slate-900 hover:bg-slate-800",
            )}
          >
            {hasShortfall ? (
              <>
                <AlertTriangle size={13} /> Keep good, report loss
              </>
            ) : (
              <>
                <PackageCheck size={13} /> Received — all good
              </>
            )}
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
        {pkg.lineItems.map((li, i) => {
          const goodQty = Math.min(
            li.quantity,
            Math.max(0, Number(good[i]) || 0),
          );
          const badQty = li.quantity - goodQty;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {li.image ? (
                  <img
                    src={li.image}
                    alt=""
                    className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover"
                  />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                    <Package size={10} />
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {li.title}
                  {li.variant ? ` — ${li.variant}` : ""} · expected ×
                  {li.quantity}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  Good
                </span>
                <input
                  type="number"
                  min="0"
                  max={li.quantity}
                  value={good[i] ?? ""}
                  onChange={(e) =>
                    setGood((prev) => ({ ...prev, [i]: e.target.value }))
                  }
                  className="h-7 w-12 shrink-0 rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
                />
                {badQty > 0 && (
                  <>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-600">
                      {badQty} ×
                    </span>
                    <QcReasonPicker
                      value={reasons[i] ?? "Damaged stock"}
                      onChange={(reason) =>
                        setReasons((prev) => ({ ...prev, [i]: reason }))
                      }
                    />
                  </>
                )}
              </div>
              {badQty > 0 && reasons[i] === "Wrong Product" && (
                <div className="ml-8 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                  <p className="mb-1.5 text-right text-[11px] font-semibold text-indigo-700">
                    What did they actually send back?
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <ReceivedInsteadPicker
                        value={receivedInstead[i] ?? null}
                        onChange={(option) =>
                          setReceivedInstead((prev) => ({
                            ...prev,
                            [i]: option,
                          }))
                        }
                      />
                    </div>
                    {receivedInstead[i] && (
                      <button
                        type="button"
                        onClick={() =>
                          onLogFoundStock(receivedInstead[i], badQty)
                        }
                        className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                      >
                        <Plus size={11} /> Log as found stock
                      </button>
                    )}
                  </div>
                  {!receivedInstead[i] && (
                    <p className="mt-1.5 text-right text-[10px] text-indigo-400">
                      Search by product name or SKU. Once picked, you can log it
                      as found stock right here in one click.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The manual counterpart to Returns to process — for an order that was marked Delivered directly
// (a walk-in/phone sale with no courier involved at all), which will never land in the automatic
// queue since nothing ever set it to RTO Initiated. Search by order number or customer name, pick
// the order, then the same good/bad-per-line QC form as everywhere else in returns.
function ManualReturnModal({
  open,
  onClose,
  onSaved,
  onLogFoundStock,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  onLogFoundStock: (option: InventorySkuOptionDTO, quantity: number) => void;
}) {
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ManualReturnSearchResultDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ManualReturnSearchResultDTO | null>(
    null,
  );
  const [good, setGood] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<
    Record<number, NonNullable<QcResult["badReason"]>>
  >({});
  const [receivedInstead, setReceivedInstead] = useState<
    Record<number, InventorySkuOptionDTO>
  >({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelected(null);
      setGood({});
      setReasons({});
      setReceivedInstead({});
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(() => {
      void searchDeliveredOrders(query.trim())
        .then((res) => setResults(res.orders))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [query]);

  const selectOrder = (order: ManualReturnSearchResultDTO) => {
    setSelected(order);
    setGood(
      Object.fromEntries(
        order.lineItems.map((li, i) => [i, String(li.quantity)]),
      ),
    );
    setReasons({});
  };

  const hasShortfall = selected
    ? selected.lineItems.some(
        (li, i) =>
          Math.min(li.quantity, Math.max(0, Number(good[i]) || 0)) <
          li.quantity,
      )
    : false;

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const results: QcResult[] = selected.lineItems.map((li, i) => {
        const goodQuantity = Math.min(
          li.quantity,
          Math.max(0, Number(good[i]) || 0),
        );
        const instead = receivedInstead[i];
        return {
          sku: li.sku,
          variant: li.variant,
          goodQuantity,
          badReason:
            goodQuantity < li.quantity
              ? (reasons[i] ?? "Damaged stock")
              : undefined,
          receivedInstead: instead
            ? {
                sku: instead.sku,
                variant: instead.variantLabel,
                title: instead.productTitle,
              }
            : undefined,
        };
      });
      const res = await processManualReturn(selected.orderId, results);
      if (!res.success) {
        toast.push(res.message || "Could not process this return.", "info");
      } else {
        toast.push("Return processed.", "success");
        onSaved();
        onClose();
      }
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not process this return.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Return a delivered order"
      subtitle="For orders that never went through a courier — a walk-in or phone sale the customer is returning in person."
      widthClass="max-w-xl"
    >
      {!selected ? (
        <div className="space-y-3">
          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order number or customer name..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
            />
          </div>
          {searching && (
            <p className="py-4 text-center text-sm text-slate-400">
              Searching...
            </p>
          )}
          {!searching && query.trim() && results.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">
              No delivered order matches "{query.trim()}".
            </p>
          )}
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {results.map((order) => (
              <button
                key={order.orderId}
                onClick={() => selectOrder(order)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left hover:border-indigo-200 hover:bg-indigo-50/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {order.orderNumber}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {order.customerName ?? "Unknown customer"} · delivered{" "}
                    {ageLabel(order.deliveredAt)} ago
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-indigo-600">
                  Select
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button
            onClick={() => setSelected(null)}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            <ArrowLeft size={12} /> Back to search
          </button>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {selected.orderNumber}
            </p>
            <p className="text-xs text-slate-400">
              {selected.customerName ?? "Unknown customer"}
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-slate-100 p-3">
            {selected.lineItems.map((li, i) => {
              const goodQty = Math.min(
                li.quantity,
                Math.max(0, Number(good[i]) || 0),
              );
              const badQty = li.quantity - goodQty;
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {li.image ? (
                      <img
                        src={li.image}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                        <Package size={10} />
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {li.title}
                      {li.variant ? ` — ${li.variant}` : ""} · expected ×
                      {li.quantity}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">
                      Good
                    </span>
                    <input
                      type="number"
                      min="0"
                      max={li.quantity}
                      value={good[i] ?? ""}
                      onChange={(e) =>
                        setGood((prev) => ({ ...prev, [i]: e.target.value }))
                      }
                      className="h-7 w-12 shrink-0 rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
                    />
                    {badQty > 0 && (
                      <>
                        <span className="shrink-0 text-[11px] font-semibold text-amber-600">
                          {badQty} ×
                        </span>
                        <QcReasonPicker
                          value={reasons[i] ?? "Damaged stock"}
                          onChange={(reason) =>
                            setReasons((prev) => ({ ...prev, [i]: reason }))
                          }
                        />
                      </>
                    )}
                  </div>
                  {badQty > 0 && reasons[i] === "Wrong Product" && (
                    <div className="ml-8 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                      <p className="mb-1.5 text-right text-[11px] font-semibold text-indigo-700">
                        What did they actually send back?
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <ReceivedInsteadPicker
                            value={receivedInstead[i] ?? null}
                            onChange={(option) =>
                              setReceivedInstead((prev) => ({
                                ...prev,
                                [i]: option,
                              }))
                            }
                          />
                        </div>
                        {receivedInstead[i] && (
                          <button
                            type="button"
                            onClick={() =>
                              onLogFoundStock(receivedInstead[i], badQty)
                            }
                            className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                          >
                            <Plus size={11} /> Log as found stock
                          </button>
                        )}
                      </div>
                      {!receivedInstead[i] && (
                        <p className="mt-1.5 text-right text-[10px] text-indigo-400">
                          Search by product name or SKU. Once picked, you can
                          log it as found stock right here in one click.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => void submit()}
            disabled={saving}
            className={clsx(
              "flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40",
              hasShortfall
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-slate-900 hover:bg-slate-800",
            )}
          >
            {hasShortfall ? (
              <>
                <AlertTriangle size={14} /> Keep good, report loss
              </>
            ) : (
              <>
                <Undo2 size={14} /> All good — restock
              </>
            )}
          </button>
        </div>
      )}
    </Modal>
  );
}

export function ReturnsPage() {
  const toast = useToast();
  const [awaitingReceipt, setAwaitingReceipt] = useState<ReturnsPackageDTO[]>(
    [],
  );
  const [awaitingQc, setAwaitingQc] = useState<ReturnsPackageDTO[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsLoaded, setReturnsLoaded] = useState(false);
  const [returnsWorkflow, setReturnsWorkflow] =
    useState<ReturnsWorkflow>("combined");
  const [returnsWarehouseFilter, setReturnsWarehouseFilter] = useState("");
  const [returnsToProcessPage, setReturnsToProcessPage] = useState(1);
  const RETURNS_TO_PROCESS_PAGE_SIZE = 10;
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [manualReturnModalOpen, setManualReturnModalOpen] = useState(false);
  const [countModalOpen, setCountModalOpen] = useState(false);
  const [foundStockPrefill, setFoundStockPrefill] = useState<{
    sku: InventorySkuOptionDTO;
    quantity: number;
  } | null>(null);

  const agingReceiptCount = awaitingReceipt.filter(isAgingPackage).length;
  const agingQcCount = awaitingQc.filter(isAgingPackage).length;
  const returnsToProcessTotalPages = Math.max(
    1,
    Math.ceil(awaitingReceipt.length / RETURNS_TO_PROCESS_PAGE_SIZE),
  );
  const returnsToProcessCurrentPage = Math.min(
    returnsToProcessPage,
    returnsToProcessTotalPages,
  );
  const pagedAwaitingReceipt = awaitingReceipt.slice(
    (returnsToProcessCurrentPage - 1) * RETURNS_TO_PROCESS_PAGE_SIZE,
    returnsToProcessCurrentPage * RETURNS_TO_PROCESS_PAGE_SIZE,
  );

  const logAsFoundStock = (option: InventorySkuOptionDTO, quantity: number) => {
    setFoundStockPrefill({ sku: option, quantity });
    setCountModalOpen(true);
  };

  const loadReturnsQueue = async () => {
    setReturnsLoading(true);
    try {
      const res = await getReturnsQueue(returnsWarehouseFilter || undefined);
      setAwaitingReceipt(res.awaitingReceipt);
      setAwaitingQc(res.awaitingQc);
      setReturnsLoaded(true);
    } catch {
      toast.push("Could not load the returns queue.", "info");
    } finally {
      setReturnsLoading(false);
    }
  };

  const changeReturnsWorkflow = async (mode: ReturnsWorkflow) => {
    if (mode === returnsWorkflow) return;
    setReturnsWorkflow(mode);
    setReturnsToProcessPage(1);
    try {
      await updateInventorySettings(mode);
    } catch {
      toast.push("Could not save this preference.", "info");
    }
  };

  const changeReturnsWarehouseFilter = (value: string) => {
    setReturnsWarehouseFilter(value);
    setReturnsToProcessPage(1);
    void getReturnsQueue(value || undefined)
      .then((res) => {
        setAwaitingReceipt(res.awaitingReceipt);
        setAwaitingQc(res.awaitingQc);
      })
      .catch(() => toast.push("Could not load the returns queue.", "info"));
  };

  useEffect(() => {
    void loadReturnsQueue();
    void listWarehouses().then((res) => setWarehouses(res.warehouses));
    void listSuppliers().then((res) => setSuppliers(res.suppliers));
    void getInventorySettings().then((res) =>
      setReturnsWorkflow(res.settings.returnsWorkflow),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="zs-page-title">Returns to process</h1>
            <p className="zs-page-description">
              Courier-returned packages waiting on receipt and QC.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setManualReturnModalOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Search size={12} className="text-slate-400" /> Return a delivered
              order
            </button>
            <ReturnsWorkflowPicker
              value={returnsWorkflow}
              onChange={(mode) => void changeReturnsWorkflow(mode)}
            />
            {warehouses.length > 1 && (
              <FilterPicker
                icon={Warehouse}
                value={returnsWarehouseFilter}
                onChange={changeReturnsWarehouseFilter}
                placeholder="All warehouses"
                options={[
                  { value: "", label: "All warehouses" },
                  ...warehouses.map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
            )}
          </div>
        </div>
      </div>

      <div className="zs-page-body">
        {returnsLoading && !returnsLoaded ? (
          <div className="zs-loading-state">Loading returns queue...</div>
        ) : (
          <div className="space-y-6">
            {returnsWorkflow === "combined" ? (
              <>
                <section className="zs-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-sm font-bold text-slate-900">
                        Returns to process
                      </h2>
                      {awaitingReceipt.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          {awaitingReceipt.length}
                        </span>
                      )}
                      {agingReceiptCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          {agingReceiptCount} aging
                        </span>
                      )}
                    </div>
                    <PackageCheck size={15} className="text-slate-400" />
                  </div>
                  <p className="mb-3 text-xs text-slate-400">
                    Match the box in front of you to the order below, check
                    what's actually inside, and confirm — this receives it and
                    finishes QC in one step.
                  </p>
                  {awaitingReceipt.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">
                      Nothing waiting to be processed.
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {pagedAwaitingReceipt.map((pkg) => (
                          <ReceiveAndQcPackageCard
                            key={pkg.orderId}
                            pkg={pkg}
                            warehouses={warehouses}
                            onDone={() => void loadReturnsQueue()}
                            onLogFoundStock={logAsFoundStock}
                          />
                        ))}
                      </div>
                      {returnsToProcessTotalPages > 1 && (
                        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                          <span className="text-xs text-slate-400">
                            Page{" "}
                            <span className="font-medium text-slate-600">
                              {returnsToProcessCurrentPage}
                            </span>{" "}
                            of{" "}
                            <span className="font-medium text-slate-600">
                              {returnsToProcessTotalPages}
                            </span>
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                setReturnsToProcessPage((p) =>
                                  Math.max(1, p - 1),
                                )
                              }
                              disabled={returnsToProcessCurrentPage <= 1}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <ArrowLeft size={12} /> Prev
                            </button>
                            <button
                              onClick={() =>
                                setReturnsToProcessPage((p) =>
                                  Math.min(returnsToProcessTotalPages, p + 1),
                                )
                              }
                              disabled={
                                returnsToProcessCurrentPage >=
                                returnsToProcessTotalPages
                              }
                              className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Next <ArrowRight size={12} />
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>

                {awaitingQc.length > 0 && (
                  <section className="zs-surface p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-sm font-bold text-slate-900">
                          Awaiting QC (from before switching)
                        </h2>
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          {awaitingQc.length}
                        </span>
                        {agingQcCount > 0 && (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            {agingQcCount} aging
                          </span>
                        )}
                      </div>
                      <ShieldCheck size={15} className="text-slate-400" />
                    </div>
                    <p className="mb-3 text-xs text-slate-400">
                      These were already received under the two-step flow —
                      finish inspecting them here.
                    </p>
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {awaitingQc.map((pkg) => (
                        <QcPackageCard
                          key={pkg.orderId}
                          pkg={pkg}
                          onDone={() => void loadReturnsQueue()}
                          onLogFoundStock={logAsFoundStock}
                        />
                      ))}
                    </div>
                  </section>
                )}
              </>
            ) : (
              <>
                <section className="zs-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-sm font-bold text-slate-900">
                        Awaiting warehouse receipt
                      </h2>
                      {awaitingReceipt.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          {awaitingReceipt.length}
                        </span>
                      )}
                      {agingReceiptCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          {agingReceiptCount} aging
                        </span>
                      )}
                    </div>
                    <PackageSearch size={15} className="text-slate-400" />
                  </div>
                  <p className="mb-3 text-xs text-slate-400">
                    Courier reported these as failed deliveries coming back.
                    Confirm once the box is physically in your hands.
                  </p>
                  {awaitingReceipt.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">
                      Nothing waiting on a warehouse receipt.
                    </p>
                  ) : (
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {awaitingReceipt.map((pkg) => (
                        <ReturnsPackageCard
                          key={pkg.orderId}
                          pkg={pkg}
                          warehouses={warehouses}
                          showsLocation
                          onSubmit={receiveReturnPackage}
                          onDone={() => void loadReturnsQueue()}
                        />
                      ))}
                    </div>
                  )}
                </section>

                <section className="zs-surface p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-sm font-bold text-slate-900">
                        Awaiting QC
                      </h2>
                      {awaitingQc.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                          {awaitingQc.length}
                        </span>
                      )}
                      {agingQcCount > 0 && (
                        <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                          {agingQcCount} aging
                        </span>
                      )}
                    </div>
                    <ShieldCheck size={15} className="text-slate-400" />
                  </div>
                  <p className="mb-3 text-xs text-slate-400">
                    Back in the warehouse, waiting on inspection. Confirming
                    here restocks it and makes it sellable again.
                  </p>
                  {awaitingQc.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-400">
                      Nothing waiting on inspection.
                    </p>
                  ) : (
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {awaitingQc.map((pkg) => (
                        <QcPackageCard
                          key={pkg.orderId}
                          pkg={pkg}
                          onDone={() => void loadReturnsQueue()}
                          onLogFoundStock={logAsFoundStock}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}
      </div>

      <NewCountModal
        open={countModalOpen}
        warehouses={warehouses}
        suppliers={suppliers}
        onClose={() => {
          setCountModalOpen(false);
          setFoundStockPrefill(null);
        }}
        onSaved={() => void loadReturnsQueue()}
        onManageWarehouses={() => {}}
        initialSku={foundStockPrefill?.sku}
        initialQuantity={foundStockPrefill?.quantity}
      />
      <ManualReturnModal
        open={manualReturnModalOpen}
        onClose={() => setManualReturnModalOpen(false)}
        onSaved={() => void loadReturnsQueue()}
        onLogFoundStock={logAsFoundStock}
      />
    </div>
  );
}
