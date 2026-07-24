import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  ChevronDown,
  ClipboardCheck,
  Gift,
  Info,
  MapPin,
  Package,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  Truck,
  Undo2,
  Warehouse,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  createInventoryInbound,
  createInventoryInboundBulk,
  createSupplier,
  getCountContext,
  getLastInboundDetails,
  getLevelReservations,
  getOpenShipments,
  getShrinkageReport,
  listStockShortfalls,
  listMovements,
  listBins,
  listInventory,
  listVariantLocations,
  listInventorySkuOptions,
  listSuppliers,
  listWarehouses,
  receiveInboundStock,
  setInventoryCount,
  setInventoryReorderPoint,
  transferStock,
  writeOffInboundStock,
  type CountContextDTO,
  type InboundWriteOffReason,
  type InventoryInboundPayload,
  type InventoryCountPayload,
  type InventoryLevelCounts,
  type InventoryLevelDTO,
  type InventoryMovementDTO,
  type InventorySkuOptionDTO,
  type OpenShipmentDTO,
  type ReservationDTO,
  type ShrinkageReportDTO,
  type StockShortfallRowDTO,
  type StockShortfallLocationDTO,
  type StockShortfallsSummaryDTO,
  type SupplierDTO,
  type WarehouseDTO,
} from "../../lib/commerceApi";
import {
  ROLE_DEFINITIONS,
  canWriteModule,
  type OrderStage,
} from "@zetsales/shared";
import { STAGE_LABEL } from "../../components/orders/orderTone";
import { Modal } from "../../components/ui/Modal";
import { Popover } from "../../components/ui/Popover";
import { useToast } from "../../components/ui/ToastProvider";
import { useClickOutside } from "../../hooks/useClickOutside";
import { useAuth } from "../../context/AuthContext";

const DEFAULT_LEAD_TIME_DAYS = 7;

type FocusMode =
  | "all"
  | "inbound"
  | "overdue"
  | "reorder"
  | "reserved"
  | "dead";
type SortMode = "onHand" | "title";
type PageView = "stock" | "shortfalls" | "shrinkage" | "ledger";

const SORT_LABELS: Record<SortMode, string> = {
  onHand: "On hand (highest first)",
  title: "Alphabetical",
};

const PAGE_SIZE = 50;

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function ageLabel(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function dateLabel(value: string | null) {
  if (!value) return "No ETA";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function shipmentTiming(shipment: OpenShipmentDTO) {
  if (!shipment.expectedAt) return { label: "No ETA", tone: "slate" as const };
  if (shipment.daysOverdue != null)
    return { label: `${shipment.daysOverdue}d late`, tone: "rose" as const };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expected = new Date(shipment.expectedAt);
  expected.setHours(0, 0, 0, 0);
  const days = Math.ceil((expected.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return { label: "Due today", tone: "amber" as const };
  if (days <= 2) return { label: `Due in ${days}d`, tone: "amber" as const };
  return { label: `In ${days}d`, tone: "emerald" as const };
}

export function incomingStatusLabel(shipments: OpenShipmentDTO[]) {
  if (shipments.length === 0) return "incoming";
  const late = shipments.filter((shipment) => shipment.daysOverdue != null);
  if (late.length > 0)
    return `${Math.max(...late.map((shipment) => shipment.daysOverdue ?? 0))}d late`;
  const dueSoon = shipments
    .map(shipmentTiming)
    .find((timing) => timing.tone === "amber");
  return dueSoon?.label ?? "incoming";
}

export function IncomingCoveragePanel({
  shipments,
  shortageNow,
  title = "Incoming coverage",
}: {
  shipments: OpenShipmentDTO[];
  shortageNow?: number;
  title?: string;
}) {
  const incomingTotal = shipments.reduce(
    (sum, shipment) => sum + shipment.quantityOutstanding,
    0,
  );
  const covered =
    shortageNow == null ? incomingTotal : Math.min(shortageNow, incomingTotal);
  const gap =
    shortageNow == null ? 0 : Math.max(0, shortageNow - incomingTotal);

  if (shipments.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        No shipment details found for this incoming quantity.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            {title}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-800">
            {incomingTotal.toLocaleString()} unit
            {incomingTotal === 1 ? "" : "s"} on the way
          </p>
        </div>
        {shortageNow != null && (
          <span
            className={clsx(
              "shrink-0 rounded-full px-2 py-1 text-[11px] font-bold",
              gap > 0
                ? "bg-rose-50 text-rose-700"
                : "bg-indigo-50 text-indigo-700",
            )}
          >
            {gap > 0
              ? `${gap} still needed`
              : `covers ${covered}/${shortageNow}`}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {shipments.map((shipment) => {
          const timing = shipmentTiming(shipment);
          return (
            <div key={shipment.id} className="zs-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {shipment.supplierName ?? "Supplier not set"}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {shipment.warehouseName}
                    {shipment.bin !== "Unassigned" ? ` / ${shipment.bin}` : ""}
                  </p>
                </div>
                <span
                  className={clsx(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                    timing.tone === "rose" && "bg-rose-50 text-rose-700",
                    timing.tone === "amber" && "bg-amber-50 text-amber-700",
                    timing.tone === "emerald" &&
                      "bg-emerald-50 text-emerald-700",
                    timing.tone === "slate" && "bg-slate-100 text-slate-600",
                  )}
                >
                  {timing.label}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:max-w-xs">
                <div>
                  <p className="font-bold tabular-nums text-indigo-700">
                    {shipment.quantityOutstanding}
                  </p>
                  <p className="text-slate-400">still incoming</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">
                    {dateLabel(shipment.expectedAt)}
                  </p>
                  <p className="text-slate-400">expected</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Suggested reorder point from real sales velocity (units/day, computed live from order history
// server-side) times a lead-time buffer — a starting point the merchant can accept or override.
// A flat default lead time is used since levels aren't yet linked to a specific supplier's lead
// time; wiring that through is a reasonable future refinement, not required for this to be useful.
function suggestedReorderPoint(unitsPerDay: number | undefined): number | null {
  if (!unitsPerDay || unitsPerDay <= 0) return null;
  return Math.ceil(unitsPerDay * DEFAULT_LEAD_TIME_DAYS);
}

function levelStatus(
  level: InventoryLevelDTO,
): "out" | "reorder" | "ok" | "unset" {
  const available = level.onHand - level.reserved;
  if (available <= 0) return "out";
  if (level.reorderPoint == null) return "unset";
  return available <= level.reorderPoint ? "reorder" : "ok";
}

// "Dead stock" detection (capital sitting on a shelf with no buyers in the last 30 days) now lives
// server-side in inventoryController.ts (isDeadLevel) — it needs the velocity map to classify rows
// outside the current page too, for the filter-tab count, which only the server can do cheaply.

// "Unassigned" is the silent placeholder used before any real shelf/bin exists — it gets created
// automatically the first time a business saves a count or shipment, with no field ever shown for
// it. Its mere existence shouldn't be what flips the Shelf/Bin picker on everywhere afterward; that
// should only happen once a business has deliberately named a real shelf (via Manage warehouses, or
// by actually typing one into that field once it's visible). Otherwise "Unassigned" would quietly
// turn into forced bin-tracking complexity for a business that never asked for it.
export function hasRealBins(bins: string[]): boolean {
  return bins.some((bin) => bin !== "Unassigned");
}

// Whether a transfer between two distinct locations is even possible — either two separate
// warehouses, or a single warehouse split across more than one shelf/bin (predefined on the
// warehouse itself, or just historically typed into a count). A transfer is a move between two
// locations, not specifically between two warehouses, so this is what should actually gate the
// feature rather than warehouse count alone.
function canTransferBetweenLocations(warehouses: WarehouseDTO[]): boolean {
  if (warehouses.length >= 2) return true;
  // systemBins already covers bins that are genuinely in use but never manually predefined, so a
  // single warehouse's own bins/systemBins are enough to tell "more than one real shelf" without
  // needing any inventory data.
  return warehouses.some(
    (warehouse) =>
      new Set([...warehouse.bins, ...warehouse.systemBins]).size > 1,
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "slate",
}: {
  icon: typeof Package;
  label: string;
  value: string;
  detail: string;
  tone?: "slate" | "emerald" | "amber" | "indigo" | "rose";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    indigo: "bg-indigo-50 text-indigo-600",
    rose: "bg-rose-50 text-rose-600",
  }[tone];

  return (
    <div className="zs-summary-cell">
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            toneClass,
          )}
        >
          <Icon size={15} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-xl font-bold tabular-nums text-slate-900">
          {value}
        </span>
        <span className="pb-1 text-xs text-slate-400">{detail}</span>
      </div>
    </div>
  );
}

// Lightweight searchable combobox over /inventory/skus — a native <select> with 900+ options
// doesn't scale, and this is the one control every count/inbound action depends on.
// Same Popover-based card treatment as WarehousePicker/FilterPicker — portaled and positioned by
// the shared Popover component (so it can never get clipped inside a scrolling modal), rather than
// the older hand-rolled absolute-positioned dropdown with its own click-outside listener.
export function SkuPicker({
  value,
  onChange,
}: {
  value: InventorySkuOptionDTO | null;
  onChange: (option: InventorySkuOptionDTO) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<InventorySkuOptionDTO[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void listInventorySkuOptions(query).then((res) =>
        setOptions(res.options),
      );
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
        Product / variant
      </label>
      <Popover
        align="left"
        matchTriggerWidth
        trigger={() => (
          <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
            <Search size={14} className="shrink-0 text-slate-400" />
            {value ? (
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-slate-800">
                  {value.productTitle}
                </span>
                <span className="text-slate-400">
                  {" "}
                  — {value.variantLabel} ({value.sku ?? "no SKU"})
                </span>
              </span>
            ) : (
              <span className="flex-1 truncate text-slate-400">
                Search product title or SKU...
              </span>
            )}
            <ChevronDown size={14} className="shrink-0 text-slate-400" />
          </div>
        )}
      >
        {(close) => (
          <div className="p-1.5">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product title or SKU..."
              className="mb-1.5 h-9 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400"
            />
            <div className="max-h-64 overflow-y-auto">
              {options.length === 0 ? (
                <div className="px-2.5 py-2 text-sm text-slate-400">
                  No matching variants found.
                </div>
              ) : (
                options.map((option) => {
                  const isSelected = value?.variantId === option.variantId;
                  return (
                    <button
                      key={option.variantId}
                      type="button"
                      onClick={() => {
                        onChange(option);
                        setQuery("");
                        close();
                      }}
                      className={clsx(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        isSelected ? "bg-indigo-50" : "hover:bg-slate-50",
                      )}
                    >
                      {option.productImage ? (
                        <img
                          src={option.productImage}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-md border border-slate-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300">
                          <Package size={14} />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-slate-800">
                          {option.productTitle}
                        </span>
                        <span className="text-slate-400">
                          {" "}
                          — {option.variantLabel} ({option.sku ?? "no SKU"})
                        </span>
                      </span>
                      {isSelected && (
                        <Check size={13} className="shrink-0 text-indigo-600" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </Popover>
    </div>
  );
}

const COUNT_REASON_OPTIONS: {
  value: InventoryCountPayload["reason"];
  description: string;
  guide: string;
  icon: typeof PackageCheck;
}[] = [
  {
    value: "Opening balance",
    description: "Starting stock — done once",
    guide:
      "Use this the very first time you add a product to the system — before you've sold anything, just tell us how many you actually have right now.",
    icon: PackageCheck,
  },
  {
    value: "Restock",
    description: "New stock just arrived",
    guide:
      'Use this when a batch of an existing product arrives and you just want to add it to what\'s already on the shelf — no supplier or cost tracking, just "this many more units are here now." If you want to track supplier and landed cost for this shipment, use Incoming Stock instead.',
    icon: Package,
  },
  {
    value: "Cycle count",
    description: "Occasional shelf recount",
    guide:
      "Use this when you walk up to a shelf, count what's really there, and want to check it against the system. It automatically ignores stock that's out for delivery or on its way back from a return, so you won't be blamed for stock that's simply on the road.",
    icon: ClipboardCheck,
  },
  {
    value: "Damaged stock",
    description: "Broke in the warehouse",
    guide:
      "Use this when something breaks or gets ruined while just sitting in your warehouse — not something a customer sent back broken, plain warehouse damage.",
    icon: AlertTriangle,
  },
  {
    value: "Lost",
    description: "Went missing, no idea why",
    guide:
      "Use this when stock simply disappears and you don't know why — could be theft, could be misplaced somewhere and never turned up.",
    icon: TrendingDown,
  },
  {
    value: "Found stock",
    description: "Missing stock turned up",
    guide:
      "Use this when stock you thought was lost or damaged turns up again — like finding it in the wrong corner of the warehouse. It cancels out some of that old loss on the Loss Report.",
    icon: PackagePlus,
  },
  {
    value: "Gift/Giveaway",
    description: "Given away on purpose",
    guide:
      "Use this when you deliberately give stock away — free samples, a customer gift, a giveaway/promo. It's tracked as a marketing cost on your Profit & Loss, separate from Damaged/Lost, so real shrinkage doesn't get inflated by spend you chose to make.",
    icon: Gift,
  },
  {
    value: "Manual adjustment",
    description: "Anything else",
    guide:
      "Use this for a stock change that doesn't fit any other reason — like using a unit for a photoshoot, or throwing out old stock that isn't damaged, just no longer wanted.",
    icon: SlidersHorizontal,
  },
  {
    value: "Wrong entry",
    description: "Fixing a typo",
    guide:
      "Use this to fix a typo or mistake from an earlier entry — like if you accidentally typed the wrong number before. This is just a correction, not a real loss.",
    icon: Pencil,
  },
];

const INFO_TOOLTIP_WIDTH = 224; // w-56

// A small "i" someone can hover OR tap for a plainer-language explanation than the one-line
// description already shown in the list — the one-liner is enough to tell options apart at a
// glance, but too short to actually teach someone which one fits their situation. Click-toggle
// alongside hover so this still works on a tablet in the warehouse, not just a mouse on desktop.
//
// Portaled straight to <body> instead of rendered inline — this always lives inside a scrolling
// dropdown list (CountReasonPicker's popover), and an inline "position outside my own box" only
// works until the nearest scrollable ancestor clips it right back, which is exactly what an
// absolutely-positioned child does here. Rendering to body and positioning with fixed coordinates
// computed from the icon's real screen position sidesteps that clipping entirely.
function InfoTooltip({ text }: { text: string }) {
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null,
  );
  const wrapperRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  useClickOutside(wrapperRef, () => setCoords(null), coords != null);

  const show = () => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const fitsRight = window.innerWidth - rect.right >= INFO_TOOLTIP_WIDTH + 16;
    setCoords({
      top: rect.top + rect.height / 2,
      left: fitsRight ? rect.right + 8 : rect.left - 8 - INFO_TOOLTIP_WIDTH,
    });
  };
  const hide = () => setCoords(null);

  return (
    <div
      ref={wrapperRef}
      className="relative shrink-0"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (coords) hide();
          else show();
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-300 hover:bg-slate-100 hover:text-slate-500"
        aria-label="When to use this"
      >
        <Info size={13} />
      </button>
      {coords &&
        createPortal(
          <div
            style={{
              top: coords.top,
              left: coords.left,
              width: INFO_TOOLTIP_WIDTH,
            }}
            className="fixed z-[100] -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-relaxed text-slate-600 shadow-lg shadow-slate-900/10"
          >
            {text}
          </div>,
          document.body,
        )}
    </div>
  );
}

// Same "modern card" popover style as QcReasonPicker, just collapsed to one line by default so it
// reads as a dropdown — the card treatment only needs to show once it's actually open.
function CountReasonPicker({
  value,
  onChange,
}: {
  value: InventoryCountPayload["reason"];
  onChange: (reason: InventoryCountPayload["reason"]) => void;
}) {
  const meta = COUNT_REASON_OPTIONS.find((o) => o.value === value)!;
  return (
    <Popover
      align="left"
      widthClass="w-72"
      trigger={() => (
        <div className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
          <meta.icon size={14} className="shrink-0 text-slate-400" />
          <span className="flex-1 truncate">{meta.value}</span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          {COUNT_REASON_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <div
                key={option.value}
                className={clsx(
                  "flex items-center gap-1 rounded-lg pr-1.5 transition-colors",
                  selected ? "bg-indigo-50" : "hover:bg-slate-50",
                )}
              >
                <button
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left"
                >
                  <span
                    className={clsx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      selected
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-slate-100 text-slate-400",
                    )}
                  >
                    <option.icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={clsx(
                        "block text-xs font-semibold",
                        selected ? "text-indigo-700" : "text-slate-700",
                      )}
                    >
                      {option.value}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {option.description}
                    </span>
                  </span>
                  {selected && (
                    <Check
                      size={13}
                      className="mt-0.5 shrink-0 text-indigo-600"
                    />
                  )}
                </button>
                <InfoTooltip text={option.guide} />
              </div>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

// Same card-popover treatment as CountReasonPicker/QcReasonPicker, reused for the Movement
// Ledger's passive "All reasons"/"All warehouses" filters too — a bare <select> reads as a
// different, plainer control than everything else on this page, so filters get the same picker
// look as an in-action choice like setting a warehouse on a count.
export function FilterPicker({
  icon: Icon,
  value,
  options,
  onChange,
  placeholder,
}: {
  icon: typeof Warehouse;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const selected = options.find((o) => o.value === value);
  return (
    <Popover
      align="left"
      matchTriggerWidth
      trigger={() => (
        <div className="flex h-9 min-w-[168px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50">
          <Icon size={14} className="shrink-0 text-slate-400" />
          <span className="flex-1 truncate">
            {selected?.label ?? placeholder}
          </span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto p-1.5">
          {options.map((o) => {
            const isSelected = o.value === value;
            return (
              <button
                key={o.value || "__all__"}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                  isSelected
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-700 hover:bg-slate-50",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {isSelected && (
                  <Check size={13} className="shrink-0 text-indigo-600" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

export function WarehousePicker({
  warehouses,
  value,
  onChange,
  placeholder,
  compact,
}: {
  warehouses: WarehouseDTO[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  // Same card-popover, sized down for tight inline contexts (a package card's header row) instead
  // of a modal's full-width field — still no native <select> anywhere in these forms.
  compact?: boolean;
}) {
  const selected = warehouses.find((w) => w.id === value);
  return (
    <Popover
      align="left"
      matchTriggerWidth={!compact}
      trigger={() => (
        <div
          className={clsx(
            "flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
            compact ? "h-8 px-2 text-xs" : "h-10 w-full px-3 text-sm",
          )}
        >
          <Warehouse
            size={compact ? 12 : 14}
            className="shrink-0 text-slate-400"
          />
          <span
            className={clsx("truncate", compact ? "max-w-[110px]" : "flex-1")}
          >
            {selected?.name ?? placeholder ?? "Select warehouse"}
          </span>
          <ChevronDown
            size={compact ? 12 : 14}
            className="shrink-0 text-slate-400"
          />
        </div>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto p-1.5">
          {warehouses.map((w) => {
            const isSelected = w.id === value;
            return (
              <button
                key={w.id}
                onClick={() => {
                  onChange(w.id);
                  close();
                }}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  isSelected ? "bg-indigo-50" : "hover:bg-slate-50",
                )}
              >
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    isSelected
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  <Warehouse size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                  {w.name}
                </span>
                {isSelected && (
                  <Check size={13} className="shrink-0 text-indigo-600" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

// Same card-popover look as WarehousePicker, but a bin isn't a fixed set to choose from — the field
// still has to accept a brand-new name someone just made up, so this is a combobox (a real text
// input, plus a picker) rather than a closed picker like the native <datalist> this replaces, which
// renders with whatever ugly default styling each browser feels like giving it.
//
// Deliberately does NOT filter the list down to whatever's currently typed, unlike a typical
// autocomplete — a default value like "Unassigned" that isn't a real bin yet would otherwise hide
// every actual shelf (none of them contain "unassigned"), leaving someone who wants to pick an
// existing one instead with an empty, dead-end list. Shelf/bin lists are short enough that always
// showing all of them is more useful than search-filtering a handful of options anyway.
export function BinPicker({
  value,
  onChange,
  options,
  placeholder,
  compact,
}: {
  value: string;
  onChange: (bin: string) => void;
  options: string[];
  placeholder?: string;
  // Same card-popover, sized down for tight inline contexts (a package card's header row) instead
  // of a modal's full-width field — replaces the native <input list> + <datalist> combo there too.
  compact?: boolean;
}) {
  return (
    <Popover
      align="left"
      matchTriggerWidth={!compact}
      trigger={() => (
        <div
          className={clsx(
            "flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/15",
            compact ? "h-8 w-36 px-2 text-xs" : "h-10 w-full px-3 text-sm",
          )}
        >
          <MapPin
            size={compact ? 12 : 14}
            className="shrink-0 text-slate-400"
          />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? "Select or type a bin"}
            className={clsx(
              "h-full min-w-0 flex-1 bg-transparent text-slate-800 outline-none placeholder-slate-400",
              compact ? "text-xs" : "text-sm",
            )}
          />
          <ChevronDown
            size={compact ? 12 : 14}
            className="shrink-0 text-slate-400"
          />
        </div>
      )}
    >
      {(close) => (
        <div className="max-h-56 overflow-y-auto p-1.5">
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-slate-400">
              No bins here yet — keep typing to use a new one.
            </p>
          ) : (
            options.map((b) => {
              const isSelected = b === value;
              return (
                <button
                  key={b}
                  onClick={() => {
                    onChange(b);
                    close();
                  }}
                  className={clsx(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    isSelected ? "bg-indigo-50" : "hover:bg-slate-50",
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      isSelected
                        ? "bg-indigo-100 text-indigo-600"
                        : "bg-slate-100 text-slate-400",
                    )}
                  >
                    <MapPin size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                    {b}
                  </span>
                  {isSelected && (
                    <Check size={13} className="shrink-0 text-indigo-600" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </Popover>
  );
}

// Same card-popover treatment as WarehousePicker/BinPicker, for the one other native <select> left
// in these forms. "Create new supplier" stays part of the same list rather than a separate button —
// one less decision (where do I go to add one?) for something that only comes up occasionally.
export function SupplierPicker({
  suppliers,
  value,
  onChange,
}: {
  suppliers: SupplierDTO[];
  value: string;
  onChange: (id: string) => void;
}) {
  const selected = suppliers.find((s) => s.id === value);
  const label =
    value === "__new"
      ? "Create new supplier"
      : (selected?.name ?? "No supplier selected");
  return (
    <Popover
      align="left"
      matchTriggerWidth
      trigger={() => (
        <div className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
          <Building2 size={14} className="shrink-0 text-slate-400" />
          <span
            className={clsx(
              "flex-1 truncate",
              !selected && value !== "__new" && "text-slate-400",
            )}
          >
            {label}
          </span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto p-1.5">
          <button
            onClick={() => {
              onChange("");
              close();
            }}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
              value === "" ? "bg-indigo-50" : "hover:bg-slate-50",
            )}
          >
            <span
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                value === ""
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              <Building2 size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
              No supplier selected
            </span>
            {value === "" && (
              <Check size={13} className="shrink-0 text-indigo-600" />
            )}
          </button>
          {suppliers.map((supplier) => {
            const isSelected = supplier.id === value;
            return (
              <button
                key={supplier.id}
                onClick={() => {
                  onChange(supplier.id);
                  close();
                }}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  isSelected ? "bg-indigo-50" : "hover:bg-slate-50",
                )}
              >
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    isSelected
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  <Building2 size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                  {supplier.name}
                </span>
                {isSelected && (
                  <Check size={13} className="shrink-0 text-indigo-600" />
                )}
              </button>
            );
          })}
          <div className="my-1 border-t border-slate-100" />
          <button
            onClick={() => {
              onChange("__new");
              close();
            }}
            className={clsx(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
              value === "__new" ? "bg-indigo-50" : "hover:bg-slate-50",
            )}
          >
            <span
              className={clsx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                value === "__new"
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-slate-100 text-indigo-500",
              )}
            >
              <Plus size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-indigo-600">
              Create new supplier
            </span>
          </button>
        </div>
      )}
    </Popover>
  );
}

// Opening balance, Cycle count, and Wrong entry are naturally an absolute number — you're stating
// the actual correct total (physically counted, or fixing a past mistake), not describing an event
// that happened to real stock. Everything else describes a single event (some units came back, some
// got damaged, lost) and is naturally a delta — forcing a user to do "current minus/plus N = new
// total" math themselves is exactly the kind of arithmetic that causes mistakes.
function isAbsoluteReason(reason: InventoryCountPayload["reason"]): boolean {
  return (
    reason === "Opening balance" ||
    reason === "Cycle count" ||
    reason === "Wrong entry"
  );
}

// Sensible default direction per reason — always changeable, since e.g. a "Manual adjustment"
// could go either way.
function defaultDirectionFor(
  reason: InventoryCountPayload["reason"],
): "add" | "subtract" {
  return reason === "Damaged stock" ||
    reason === "Lost" ||
    reason === "Gift/Giveaway"
    ? "subtract"
    : "add";
}

// Shown in place of a form whenever a modal needs a warehouse (or a second one) that doesn't
// exist yet — a brand-new tenant has zero warehouses until they set one up, so every dropdown
// that used to just list the 3 hardcoded ones would otherwise render empty with no explanation.
function WarehouseRequiredNotice({
  onManageWarehouses,
  onClose,
  message,
}: {
  onManageWarehouses: () => void;
  onClose: () => void;
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
        <Warehouse size={20} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-800">
          Add a warehouse first
        </p>
        <p className="max-w-xs text-xs text-slate-500">
          {message ??
            "You haven't set up any warehouses yet. Add your first real location to start tracking stock."}
        </p>
      </div>
      <button
        onClick={() => {
          onClose();
          onManageWarehouses();
        }}
        className="mt-1 flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        <Plus size={14} /> Manage warehouses
      </button>
    </div>
  );
}

// The real cost of a unit isn't just what the supplier invoiced — shipping and customs duties for
// the whole shipment get spread across every unit in it too. Shared between "New inventory count"
// (Opening balance is still real stock with a real cost, just not framed as a shipment) and
// "Incoming Stock" so both compute and display landed cost the same way. Server derives the
// actual per-unit figure independently — this preview is just so the number doesn't feel like a
// black box before submitting.
function LandedCostFields({
  unitPrice,
  setUnitPrice,
  shippingCost,
  setShippingCost,
  dutiesCost,
  setDutiesCost,
  quantity,
  currentUnitCost,
}: {
  unitPrice: string;
  setUnitPrice: (v: string) => void;
  shippingCost: string;
  setShippingCost: (v: string) => void;
  dutiesCost: string;
  setDutiesCost: (v: string) => void;
  quantity: number;
  currentUnitCost?: number | null;
}) {
  const parsedUnitPrice = unitPrice.trim() ? Number(unitPrice) : null;
  const landedCostPreview =
    parsedUnitPrice != null && quantity > 0
      ? parsedUnitPrice +
        ((Number(shippingCost) || 0) + (Number(dutiesCost) || 0)) / quantity
      : null;

  return (
    <div className="col-span-2 grid grid-cols-3 gap-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Unit price (৳, optional)
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder={
            currentUnitCost != null ? undefined : "No cost on file yet"
          }
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Shipping (৳, total)
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={shippingCost}
          onChange={(e) => setShippingCost(e.target.value)}
          placeholder="0.00"
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">
          Duties (৳, total)
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={dutiesCost}
          onChange={(e) => setDutiesCost(e.target.value)}
          placeholder="0.00"
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>
      <p className="col-span-3 text-[11px] text-slate-400">
        {landedCostPreview != null
          ? `Landed cost per unit ≈ ৳${landedCostPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })} (shipping + duties spread across ${quantity} unit${quantity === 1 ? "" : "s"}).`
          : currentUnitCost != null
            ? `Currently ৳${currentUnitCost.toLocaleString()} on file — leave blank to keep it, or enter a unit price to update it.`
            : "Shipping and duties are optional, but split evenly across the units in this batch when given."}
      </p>
    </div>
  );
}

export function NewCountModal({
  open,
  warehouses,
  suppliers,
  onClose,
  onSaved,
  onManageWarehouses,
  initialSku,
  initialQuantity,
}: {
  open: boolean;
  warehouses: WarehouseDTO[];
  suppliers: SupplierDTO[];
  onClose: () => void;
  onSaved: () => void;
  onManageWarehouses: () => void;
  initialSku?: InventorySkuOptionDTO | null;
  initialQuantity?: number;
}) {
  const toast = useToast();
  const [reason, setReason] =
    useState<InventoryCountPayload["reason"]>("Opening balance");
  const [sku, setSku] = useState<InventorySkuOptionDTO | null>(null);
  // Set the instant this modal is opened via the shortcut, consumed the first time the
  // reason-change effect below actually observes reason === 'Found stock' — that effect also
  // fires once earlier, during the same render pass, with the *previous* reason still in its
  // closure (before setReason above has taken effect), so it can't act on the transition there.
  // Deferring the prefill to the effect's real, later firing (and gating it on this ref) is what
  // stops that effect's own quantity reset from wiping the prefilled value out from under it.
  const justOpenedViaShortcutRef = useRef(false);
  useEffect(() => {
    if (open && initialSku) {
      setSku(initialSku);
      setReason("Found stock");
      justOpenedViaShortcutRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSku]);
  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => {
    if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);
  // "Unassigned" — the industry-standard name for stock that's physically arrived but hasn't been
  // put away to a real shelf yet. Opening balance and a brand-new SKU are both "stock exists, exact
  // shelf not decided yet" moments, so that's the sensible default rather than making someone commit
  // to a real location before it's actually there. Anything else (Cycle count, Damaged stock, etc.)
  // is about stock that's already sitting somewhere real, so it starts blank instead — see the
  // reason-change effect below.
  const [bin, setBin] = useState("Unassigned");
  const [quantity, setQuantity] = useState("");
  const [direction, setDirection] = useState<"add" | "subtract">("add");
  const [unitPrice, setUnitPrice] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [dutiesCost, setDutiesCost] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // Same reasoning as everywhere else bins show up: don't ask a business that's never used bins to
  // think about one. The field only appears once this warehouse actually has bins in use
  // (predefined or historically typed) — otherwise the hidden "A-1-01" default just keeps flowing
  // through silently, same as before bins existed as a concept at all.
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

  useEffect(() => {
    if (!open) {
      setReason("Opening balance");
      setSku(null);
      setBin("Unassigned");
      setQuantity("");
      setUnitPrice("");
      setShippingCost("");
      setDutiesCost("");
      setSupplierId("");
      setNewSupplierName("");
      setNote("");
    }
  }, [open]);

  useEffect(() => {
    setDirection(defaultDirectionFor(reason));
    if (reason === "Found stock" && justOpenedViaShortcutRef.current) {
      justOpenedViaShortcutRef.current = false;
      setQuantity(
        initialQuantity != null && initialQuantity > 0
          ? String(initialQuantity)
          : "",
      );
    } else {
      setQuantity("");
    }
    // Cycle count is the one reason that needs a deliberate, real shelf choice — you're physically
    // counting a specific location, so a silent "Unassigned" default would make the count meaningless.
    // Forced blank only when the Shelf/Bin field is actually visible to fill back in; this warehouse
    // not using bins yet means that field stays hidden, so an empty value would be an unfixable dead
    // end blocking Save entirely. Every other reason defaults to "Unassigned," same as Opening balance.
    setBin(
      reason === "Cycle count" ? (usesBins ? "" : "Unassigned") : "Unassigned",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  // Fetched on demand for just this one variant rather than derived from a full inventory list —
  // same reasoning as Transfer stock's location picker.
  const [skuLevels, setSkuLevels] = useState<InventoryLevelDTO[]>([]);
  useEffect(() => {
    if (!sku) {
      setSkuLevels([]);
      return;
    }
    let cancelled = false;
    void listVariantLocations(sku.productId, sku.variantId).then((res) => {
      if (!cancelled) setSkuLevels(res.levels);
    });
    return () => {
      cancelled = true;
    };
  }, [sku]);
  const matchedLevel = skuLevels[0] ?? null;
  const currentOnHand = matchedLevel?.onHand ?? 0;
  const absoluteMode = isAbsoluteReason(reason);

  // Cost has nowhere else to go if someone never uses the separate "Incoming Stock" flow — this
  // is often the only screen a SKU's cost ever gets entered on, so it needs to live here too, not
  // just on the inbound path. Pre-fills from whatever's already on file so a routine recount doesn't
  // force you to re-type a cost that hasn't changed; shipping/duties are left blank since they
  // aren't part of the recorded weighted average.
  useEffect(() => {
    setUnitPrice(
      matchedLevel?.unitCost != null ? String(matchedLevel.unitCost) : "",
    );
    setShippingCost("");
    setDutiesCost("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  // For a cycle count, comparing a real physical count against raw onHand is wrong whenever any of
  // this SKU is out for delivery, mid-RTO, or awaiting QC — onHand deliberately still counts that
  // stock until it's confirmed delivered, so a physical count would honestly come up short for
  // reasons that have nothing to do with loss. This fetches the corrected number to compare against
  // instead, debounced since `bin` is free text and changes on every keystroke.
  const [countContext, setCountContext] = useState<CountContextDTO | null>(
    null,
  );
  useEffect(() => {
    setCountContext(null);
    if (reason !== "Cycle count" || !sku || !bin.trim()) return;
    const handle = setTimeout(() => {
      void getCountContext(
        sku.productId,
        sku.variantId,
        warehouseId,
        bin.trim(),
      )
        .then(setCountContext)
        .catch(() => setCountContext(null));
    }, 300);
    return () => clearTimeout(handle);
  }, [reason, sku, warehouseId, bin]);

  const expectedForCycleCount =
    countContext?.expectedPhysicalCount ?? currentOnHand;

  // The actual new absolute total sent to the API — computed here so the backend never has to know
  // about "delta mode," it just keeps setting onHand to a number like it always has.
  const resolvedQuantity = (() => {
    const entered = Number(quantity);
    if (!quantity.trim() || Number.isNaN(entered)) return null;
    if (absoluteMode) return entered;
    return Math.max(
      0,
      currentOnHand + (direction === "add" ? entered : -entered),
    );
  })();

  const selectedWarehouse =
    warehouses.find((warehouse) => warehouse.id === warehouseId) ??
    warehouses[0];
  const canSave =
    sku &&
    resolvedQuantity != null &&
    resolvedQuantity >= 0 &&
    bin.trim().length > 0 &&
    !!selectedWarehouse &&
    (reason !== "Opening balance" ||
      supplierId !== "__new" ||
      newSupplierName.trim().length > 0) &&
    !saving;

  // Counting doesn't know about incoming shipments — it just overwrites on-hand to whatever
  // number you type. If this SKU already has pending incoming stock, a count that happens to
  // include those newly-arrived units would leave "incoming" stuck showing stock as still on the
  // way, permanently out of sync with reality. Surface it instead of letting that drift silently.
  const pendingIncoming =
    matchedLevel && matchedLevel.inbound > 0 ? matchedLevel : null;

  // Damage, loss, or a found-stock surprise turning up during a return's inspection belongs in the
  // Returns to process QC step (or the manual return search, for orders that never went through a
  // courier) — both update the actual order, not just the raw stock number. These reasons are for
  // events with no order behind them at all: warehouse damage, breakage during putaway, theft,
  // misplaced stock later turning up — nothing to redirect to.
  //
  // Excludes 'Found stock' when it was opened via the "+ Log as found stock" shortcut (initialSku
  // set) — that shortcut IS the Returns to process flow this hint would otherwise redirect to, so
  // showing it there would tell someone to go do the thing they just did to get here.
  const showsUntrackedReturnHint =
    reason === "Damaged stock" ||
    reason === "Lost" ||
    (reason === "Found stock" && !initialSku);

  const save = async () => {
    if (!canSave || !sku || !selectedWarehouse || resolvedQuantity == null)
      return;
    setSaving(true);
    try {
      let selectedSupplier =
        suppliers.find((supplier) => supplier.id === supplierId) ?? null;
      if (reason === "Opening balance" && supplierId === "__new") {
        const created = await createSupplier({ name: newSupplierName.trim() });
        selectedSupplier = created.supplier;
      }

      await setInventoryCount({
        productId: sku.productId,
        variantId: sku.variantId,
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
        bin: bin.trim(),
        quantity: resolvedQuantity,
        reason,
        unitPrice:
          (reason === "Opening balance" || reason === "Found stock") &&
          unitPrice.trim()
            ? Number(unitPrice)
            : undefined,
        shippingCost:
          (reason === "Opening balance" || reason === "Found stock") &&
          shippingCost.trim()
            ? Number(shippingCost)
            : undefined,
        dutiesCost:
          (reason === "Opening balance" || reason === "Found stock") &&
          dutiesCost.trim()
            ? Number(dutiesCost)
            : undefined,
        supplierId:
          reason === "Opening balance" ? selectedSupplier?.id : undefined,
        supplierName:
          reason === "Opening balance" ? selectedSupplier?.name : undefined,
        note: note.trim() || undefined,
      });
      toast.push("Inventory count saved.", "success");
      setSupplierId("");
      setNewSupplierName("");
      onSaved();
      onClose();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not save inventory count.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  if (open && warehouses.length === 0) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="New inventory count"
        subtitle="Set ZetSales-owned stock for a specific SKU and location."
        widthClass="max-w-2xl"
      >
        <WarehouseRequiredNotice
          onManageWarehouses={onManageWarehouses}
          onClose={onClose}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New inventory count"
      subtitle="Set ZetSales-owned stock for a specific SKU and location."
      widthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Reason
            </label>
            <CountReasonPicker value={reason} onChange={setReason} />
          </div>
          {showsUntrackedReturnHint && (
            <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              If this was found while inspecting a return, use{" "}
              <strong>Returns to process</strong> instead — either the QC step,
              or its "Return a delivered order" search for orders that never
              went through a courier. Use this reason only for something with no
              order behind it at all — warehouse damage, breakage during
              putaway, theft, misplaced stock, or previously-lost stock turning
              up on its own.
            </div>
          )}
          <div className="col-span-2">
            <SkuPicker value={sku} onChange={setSku} />
          </div>
          {pendingIncoming && (
            <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              This item has{" "}
              <strong>
                {pendingIncoming.inbound} unit
                {pendingIncoming.inbound === 1 ? "" : "s"}
              </strong>{" "}
              marked as incoming. If this count already includes newly-arrived
              stock, use <strong>Mark received</strong> on the incoming number
              in the main table instead — a plain count here won't clear the
              incoming number, so it'll keep showing that stock as still on the
              way even after you've counted it in.
            </div>
          )}
          <div className={usesBins ? undefined : "col-span-2"}>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Warehouse
            </label>
            <WarehousePicker
              warehouses={warehouses}
              value={warehouseId}
              onChange={setWarehouseId}
            />
          </div>
          {usesBins && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Shelf/Bin
              </label>
              <BinPicker
                value={bin}
                onChange={setBin}
                options={binOptions}
                placeholder="A-1-01"
              />
            </div>
          )}
          <div
            className={reason === "Opening balance" ? undefined : "col-span-2"}
          >
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              {absoluteMode
                ? reason === "Cycle count"
                  ? "Quantity counted"
                  : "Quantity on hand"
                : reason === "Restock"
                  ? "How many units arrived"
                  : reason === "Gift/Giveaway"
                    ? "How many units given away"
                    : "How many units"}
            </label>
            {reason === "Cycle count" && matchedLevel && (
              <p className="mb-1.5 text-[11px] text-slate-400">
                {countContext &&
                (countContext.physicallyAbsentQuantity > 0 ||
                  countContext.awaitingQcHereQuantity > 0 ||
                  countContext.isMultiLocation) ? (
                  <>
                    Just enter what you physically count —{" "}
                    <strong>{countContext.expectedPhysicalCount}</strong> is
                    expected here ({currentOnHand} on hand
                    {countContext.physicallyAbsentQuantity > 0 &&
                      `, ${countContext.physicallyAbsentQuantity} out for delivery or mid-return`}
                    {countContext.awaitingQcHereQuantity > 0 &&
                      `, including ${countContext.awaitingQcHereQuantity} already sitting here awaiting QC`}
                    ). The out-for-delivery/mid-return units are added back
                    automatically — they won't be logged as lost.
                    {countContext.isMultiLocation && (
                      <span className="text-amber-600">
                        {" "}
                        This item is stocked at more than one location —
                        in-transit units are matched to whichever location
                        currently holds the most stock, so this is a best-effort
                        estimate here, not exact.
                      </span>
                    )}
                  </>
                ) : (
                  `System currently shows ${currentOnHand} units at this location.`
                )}
              </p>
            )}
            <div className="flex items-center gap-2">
              {!absoluteMode && (
                <div className="flex h-10 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {(["add", "subtract"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDirection(d)}
                      className={clsx(
                        "rounded-md px-3 text-sm font-semibold capitalize transition-colors",
                        direction === d
                          ? "bg-white text-slate-900 shadow-sm shadow-slate-900/5"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
            {reason === "Cycle count" &&
              matchedLevel &&
              quantity.trim() !== "" &&
              resolvedQuantity != null && (
                <p
                  className={clsx(
                    "mt-1 text-[11px]",
                    resolvedQuantity === expectedForCycleCount
                      ? "text-slate-400"
                      : resolvedQuantity < expectedForCycleCount
                        ? "text-rose-600"
                        : "text-emerald-600",
                  )}
                >
                  {resolvedQuantity === expectedForCycleCount
                    ? "No variance — matches what was expected."
                    : `Variance: ${resolvedQuantity > expectedForCycleCount ? "+" : ""}${resolvedQuantity - expectedForCycleCount} (will be logged as a ${resolvedQuantity < expectedForCycleCount ? "loss" : "gain"}).`}
                </p>
              )}
            {!absoluteMode &&
              quantity.trim() !== "" &&
              resolvedQuantity != null && (
                <p className="mt-1 text-[11px] text-slate-400">
                  New total will be {resolvedQuantity} (currently{" "}
                  {currentOnHand}).
                </p>
              )}
          </div>
          {(reason === "Opening balance" || reason === "Found stock") && (
            <LandedCostFields
              unitPrice={unitPrice}
              setUnitPrice={setUnitPrice}
              shippingCost={shippingCost}
              setShippingCost={setShippingCost}
              dutiesCost={dutiesCost}
              setDutiesCost={setDutiesCost}
              quantity={Math.max(1, (resolvedQuantity ?? 0) - currentOnHand)}
              currentUnitCost={matchedLevel?.unitCost}
            />
          )}
          {reason === "Opening balance" && (
            <>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                  Supplier (optional)
                </label>
                <SupplierPicker
                  suppliers={suppliers}
                  value={supplierId}
                  onChange={setSupplierId}
                />
              </div>
              {supplierId === "__new" && (
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    New supplier name
                  </label>
                  <input
                    value={newSupplierName}
                    onChange={(e) => setNewSupplierName(e.target.value)}
                    placeholder="e.g. ABC Garments"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                  />
                </div>
              )}
            </>
          )}
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Note
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional audit note"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2.5 text-xs text-indigo-700">
          This count updates ZetSales inventory only. Shopify/WooCommerce stock
          is ignored and will not be changed.
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save count"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NewInboundModal({
  open,
  suppliers,
  warehouses,
  onClose,
  onSaved,
  onManageWarehouses,
  initialSku,
  initialQuantity,
  initialWarehouseId,
}: {
  open: boolean;
  suppliers: SupplierDTO[];
  warehouses: WarehouseDTO[];
  onClose: () => void;
  onSaved: () => void;
  onManageWarehouses: () => void;
  // Set when this modal is opened as a shortcut from a Stock Shortfalls row — skips the SKU search
  // entirely and starts from a suggested quantity/warehouse instead of blank fields. Same shape as
  // NewCountModal's initialSku/initialQuantity shortcut prefill.
  initialSku?: InventorySkuOptionDTO | null;
  initialQuantity?: number;
  initialWarehouseId?: string;
}) {
  const toast = useToast();
  const [sku, setSku] = useState<InventorySkuOptionDTO | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  useEffect(() => {
    if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);
  // Incoming stock is by definition not on a shelf yet — "Unassigned" (the industry-standard name
  // for received-but-not-put-away stock) is always the right default here, no reason toggle needed
  // like the count modal.
  const [bin, setBin] = useState("Unassigned");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [dutiesCost, setDutiesCost] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [expectedAt, setExpectedAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setSku(null);
      setBin("Unassigned");
      setQuantity("");
      setUnitPrice("");
      setShippingCost("");
      setDutiesCost("");
      setNewSupplierName("");
      setExpectedAt("");
      setNote("");
    }
  }, [open]);

  // Same shortcut-prefill timing as NewCountModal's initialSku effect — applies once, the instant
  // this modal opens via the Shortfalls row shortcut, rather than on every render.
  useEffect(() => {
    if (open && initialSku) {
      setSku(initialSku);
      if (initialQuantity != null && initialQuantity > 0)
        setQuantity(String(initialQuantity));
      if (
        initialWarehouseId &&
        warehouses.some((w) => w.id === initialWarehouseId)
      )
        setWarehouseId(initialWarehouseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSku]);

  // Remembers the supplier and price this exact product was logged as incoming with last time —
  // re-ordering a familiar product should mostly be "confirm quantity, save," not retyping who it's
  // bought from and what it costs every single call. Only ever a starting point: whatever's found
  // lands in ordinary editable fields, same as the quantity suggestion above.
  useEffect(() => {
    setUnitPrice("");
    setShippingCost("");
    setDutiesCost("");
    setSupplierId("");
    if (!sku) return;
    let cancelled = false;
    void getLastInboundDetails(sku.productId, sku.variantId)
      .then((res) => {
        if (cancelled || !res.found) return;
        if (res.unitPrice != null) setUnitPrice(String(res.unitPrice));
        if (res.shippingCost != null) setShippingCost(String(res.shippingCost));
        if (res.dutiesCost != null) setDutiesCost(String(res.dutiesCost));
        if (res.supplierId && suppliers.some((s) => s.id === res.supplierId))
          setSupplierId(res.supplierId);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // Deliberately excludes `suppliers` — it's read at fetch-resolution time, not a reactive
    // dependency; refetching every time the suppliers list identity changes (e.g. after any
    // unrelated save elsewhere) would silently blow away a supplier the user already picked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  const selectedWarehouse =
    warehouses.find((warehouse) => warehouse.id === warehouseId) ??
    warehouses[0];
  const canSave =
    sku &&
    quantity.trim() !== "" &&
    Number(quantity) > 0 &&
    bin.trim().length > 0 &&
    (supplierId !== "__new" || newSupplierName.trim().length > 0) &&
    !!selectedWarehouse &&
    !saving;

  const save = async () => {
    if (!canSave || !sku || !selectedWarehouse) return;
    setSaving(true);
    try {
      let selectedSupplier =
        suppliers.find((supplier) => supplier.id === supplierId) ?? null;
      if (supplierId === "__new") {
        const created = await createSupplier({ name: newSupplierName.trim() });
        selectedSupplier = created.supplier;
      }

      const payload: InventoryInboundPayload = {
        productId: sku.productId,
        variantId: sku.variantId,
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
        bin: bin.trim(),
        quantity: Number(quantity),
        unitPrice: unitPrice.trim() ? Number(unitPrice) : undefined,
        shippingCost: shippingCost.trim() ? Number(shippingCost) : undefined,
        dutiesCost: dutiesCost.trim() ? Number(dutiesCost) : undefined,
        supplierId: selectedSupplier?.id,
        supplierName: selectedSupplier?.name,
        expectedAt: expectedAt || undefined,
        note: note.trim() || undefined,
      };
      await createInventoryInbound(payload);
      toast.push("Incoming stock added.", "success");
      setSupplierId("");
      setNewSupplierName("");
      setExpectedAt("");
      onSaved();
      onClose();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not create incoming stock.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  if (open && warehouses.length === 0) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Incoming Stock"
        subtitle="Log stock you've already arranged (e.g. by phone) so it shows up as on the way."
        widthClass="max-w-2xl"
      >
        <WarehouseRequiredNotice
          onManageWarehouses={onManageWarehouses}
          onClose={onClose}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Incoming Stock"
      subtitle="Log stock you've already arranged (e.g. by phone) so it shows up as on the way."
      widthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <SkuPicker value={sku} onChange={setSku} />
          </div>
          <div className={usesBins ? undefined : "col-span-2"}>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Warehouse
            </label>
            <WarehousePicker
              warehouses={warehouses}
              value={warehouseId}
              onChange={setWarehouseId}
            />
          </div>
          {usesBins && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                Shelf/Bin
              </label>
              <BinPicker value={bin} onChange={setBin} options={binOptions} />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Incoming quantity
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <LandedCostFields
            unitPrice={unitPrice}
            setUnitPrice={setUnitPrice}
            shippingCost={shippingCost}
            setShippingCost={setShippingCost}
            dutiesCost={dutiesCost}
            setDutiesCost={setDutiesCost}
            quantity={Math.max(1, Number(quantity) || 0)}
          />
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Expected arrival
            </label>
            <input
              type="date"
              value={expectedAt}
              onChange={(e) => setExpectedAt(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Supplier
            </label>
            <SupplierPicker
              suppliers={suppliers}
              value={supplierId}
              onChange={setSupplierId}
            />
          </div>
          {supplierId === "__new" && (
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                New supplier name
              </label>
              <input
                value={newSupplierName}
                onChange={(e) => setNewSupplierName(e.target.value)}
                placeholder="e.g. ABC Garments"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
          )}
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Note
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional receiving note"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">
          Incoming stock is not sellable yet. It becomes on-hand stock later
          when you receive it.
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving..." : "Add shipment"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

interface BulkInboundItem {
  key: string;
  sku: InventorySkuOptionDTO;
  quantity: number;
  warehouseId: string;
}

interface BulkInboundLine {
  key: string;
  sku: InventorySkuOptionDTO;
  warehouseId: string;
  bin: string;
  quantity: string;
  unitPrice: string;
  shippingCost: string;
  dutiesCost: string;
  expectedAt: string;
  supplierId: string;
  newSupplierName: string;
  note: string;
}

// Logging several shortfall products from one phone call ("I called our fabric supplier, ordered
// three things") as one action instead of repeating the single-item Incoming Stock flow per
// product. Every field is per line, not shared — a bulk log covers whatever actually happened
// across possibly several calls/suppliers, so warehouse, cost, supplier and expected date can each
// differ line to line exactly like they would in separate single-item entries; this is just those
// entries filled out together instead of one at a time.
function BulkInboundModal({
  open,
  items,
  suppliers,
  warehouses,
  onClose,
  onSaved,
  onManageWarehouses,
}: {
  open: boolean;
  items: BulkInboundItem[];
  suppliers: SupplierDTO[];
  warehouses: WarehouseDTO[];
  onClose: () => void;
  onSaved: () => void;
  onManageWarehouses: () => void;
}) {
  const toast = useToast();
  const [lines, setLines] = useState<BulkInboundLine[]>([]);
  const [saving, setSaving] = useState(false);

  // Builds the editable line list fresh from whatever was selected when this modal was opened, then
  // asks each line's own last-inbound history for a remembered supplier/cost — same per-SKU memory
  // NewInboundModal uses for a single item, just applied to every line at once. Only runs on the
  // open transition (not on every `items` render) so it never clobbers mid-edit input.
  useEffect(() => {
    if (!open) {
      setLines([]);
      return;
    }
    setLines(
      items.map((item) => ({
        key: item.key,
        sku: item.sku,
        warehouseId: item.warehouseId,
        bin: "Unassigned",
        quantity: String(item.quantity),
        unitPrice: "",
        shippingCost: "",
        dutiesCost: "",
        expectedAt: "",
        supplierId: "",
        newSupplierName: "",
        note: "",
      })),
    );

    let cancelled = false;
    void Promise.all(
      items.map((item) =>
        getLastInboundDetails(item.sku.productId, item.sku.variantId).catch(
          () =>
            ({ success: true, found: false }) as Awaited<
              ReturnType<typeof getLastInboundDetails>
            >,
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      setLines((prev) =>
        prev.map((line, i) => {
          const res = results[i];
          if (!res.found) return line;
          return {
            ...line,
            unitPrice:
              res.unitPrice != null ? String(res.unitPrice) : line.unitPrice,
            shippingCost:
              res.shippingCost != null
                ? String(res.shippingCost)
                : line.shippingCost,
            dutiesCost:
              res.dutiesCost != null ? String(res.dutiesCost) : line.dutiesCost,
            supplierId:
              res.supplierId && suppliers.some((s) => s.id === res.supplierId)
                ? res.supplierId
                : line.supplierId,
          };
        }),
      );
    });
    return () => {
      cancelled = true;
    };
    // Deliberately excludes `suppliers` for the same reason as NewInboundModal's equivalent effect —
    // read at fetch-resolution time, not a reactive dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Per-line bin options, keyed by warehouse — fetched lazily as each warehouse actually shows up
  // across the lines (most bulk logs only ever touch one or two warehouses, so this stays cheap).
  const [binOptionsByWarehouse, setBinOptionsByWarehouse] = useState<
    Record<string, string[]>
  >({});
  const fetchedWarehouseIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!open) {
      setBinOptionsByWarehouse({});
      fetchedWarehouseIdsRef.current = new Set();
      return;
    }
    const uniqueIds = [
      ...new Set(lines.map((line) => line.warehouseId)),
    ].filter((id) => id && !fetchedWarehouseIdsRef.current.has(id));
    if (uniqueIds.length === 0) return;
    uniqueIds.forEach((id) => fetchedWarehouseIdsRef.current.add(id));
    void Promise.all(
      uniqueIds.map((id) =>
        listBins(id).then((res) => [id, res.bins] as const),
      ),
    ).then((results) => {
      setBinOptionsByWarehouse((prev) => {
        const next = { ...prev };
        for (const [id, bins] of results) next[id] = bins;
        return next;
      });
    });
  }, [open, lines]);

  const updateLine = (key: string, patch: Partial<BulkInboundLine>) =>
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const canSave =
    lines.length > 0 &&
    lines.every(
      (line) =>
        line.warehouseId &&
        line.bin.trim().length > 0 &&
        line.quantity.trim() !== "" &&
        Number(line.quantity) > 0 &&
        (line.supplierId !== "__new" || line.newSupplierName.trim().length > 0),
    ) &&
    !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const warehouseById = new Map(warehouses.map((w) => [w.id, w]));
      // A brand-new supplier typed on more than one line (e.g. the same new vendor across three
      // products) is created once and reused — createSupplier itself upserts by name too, so this
      // is a convenience to avoid redundant round trips, not a correctness requirement.
      const newSupplierCache = new Map<string, SupplierDTO>();
      const payloads: InventoryInboundPayload[] = [];
      for (const line of lines) {
        const warehouse = warehouseById.get(line.warehouseId) ?? warehouses[0];
        let resolvedSupplier =
          suppliers.find((s) => s.id === line.supplierId) ?? null;
        if (line.supplierId === "__new") {
          const name = line.newSupplierName.trim();
          resolvedSupplier = newSupplierCache.get(name) ?? null;
          if (!resolvedSupplier) {
            const created = await createSupplier({ name });
            resolvedSupplier = created.supplier;
            newSupplierCache.set(name, resolvedSupplier);
          }
        }
        payloads.push({
          productId: line.sku.productId,
          variantId: line.sku.variantId,
          warehouseId: warehouse.id,
          warehouseName: warehouse.name,
          bin: line.bin.trim(),
          quantity: Number(line.quantity),
          unitPrice: line.unitPrice.trim() ? Number(line.unitPrice) : undefined,
          shippingCost: line.shippingCost.trim()
            ? Number(line.shippingCost)
            : undefined,
          dutiesCost: line.dutiesCost.trim()
            ? Number(line.dutiesCost)
            : undefined,
          supplierId: resolvedSupplier?.id,
          supplierName: resolvedSupplier?.name,
          expectedAt: line.expectedAt || undefined,
          note: line.note.trim() || undefined,
        });
      }

      const res = await createInventoryInboundBulk(payloads);
      const failedCount = res.results.filter((r) => !r.success).length;
      if (failedCount === 0) {
        toast.push(
          `Added incoming stock for ${res.results.length} product${res.results.length === 1 ? "" : "s"}.`,
          "success",
        );
      } else {
        toast.push(
          `Added ${res.results.length - failedCount} of ${res.results.length} — ${failedCount} could not be saved.`,
          "info",
        );
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not log incoming stock.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  if (open && warehouses.length === 0) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Add incoming (bulk)"
        subtitle="Log several products as incoming stock at once."
        widthClass="max-w-3xl"
      >
        <WarehouseRequiredNotice
          onManageWarehouses={onManageWarehouses}
          onClose={onClose}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add incoming (bulk)"
      subtitle="Log several products you've already arranged as incoming stock in one go — each can have its own supplier, cost and arrival date."
      widthClass="max-w-3xl"
    >
      <div className="space-y-5">
        <div className="space-y-3">
          {lines.map((line) => {
            const binOptions = binOptionsByWarehouse[line.warehouseId] ?? [];
            const usesBins =
              line.warehouseId in binOptionsByWarehouse &&
              hasRealBins(binOptions);
            return (
              <div
                key={line.key}
                className="rounded-lg border border-slate-200 p-3.5"
              >
                <div className="mb-3 flex min-w-0 items-center gap-3">
                  {line.sku.productImage ? (
                    <img
                      src={line.sku.productImage}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-md border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300">
                      <Package size={14} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {line.sku.productTitle}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {line.sku.variantLabel
                        ? `${line.sku.variantLabel} — `
                        : ""}
                      {line.sku.sku ?? "no SKU"}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className={usesBins ? undefined : "col-span-2"}>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Warehouse
                    </label>
                    <WarehousePicker
                      warehouses={warehouses}
                      value={line.warehouseId}
                      onChange={(id) =>
                        updateLine(line.key, { warehouseId: id })
                      }
                    />
                  </div>
                  {usesBins && (
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        Shelf/Bin
                      </label>
                      <BinPicker
                        value={line.bin}
                        onChange={(bin) => updateLine(line.key, { bin })}
                        options={binOptions}
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Incoming quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) =>
                        updateLine(line.key, { quantity: e.target.value })
                      }
                      placeholder="0"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                    />
                  </div>
                  <LandedCostFields
                    unitPrice={line.unitPrice}
                    setUnitPrice={(v) => updateLine(line.key, { unitPrice: v })}
                    shippingCost={line.shippingCost}
                    setShippingCost={(v) =>
                      updateLine(line.key, { shippingCost: v })
                    }
                    dutiesCost={line.dutiesCost}
                    setDutiesCost={(v) =>
                      updateLine(line.key, { dutiesCost: v })
                    }
                    quantity={Math.max(1, Number(line.quantity) || 0)}
                  />
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Expected arrival
                    </label>
                    <input
                      type="date"
                      value={line.expectedAt}
                      onChange={(e) =>
                        updateLine(line.key, { expectedAt: e.target.value })
                      }
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Supplier
                    </label>
                    <SupplierPicker
                      suppliers={suppliers}
                      value={line.supplierId}
                      onChange={(id) =>
                        updateLine(line.key, { supplierId: id })
                      }
                    />
                  </div>
                  {line.supplierId === "__new" && (
                    <div className="col-span-2">
                      <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                        New supplier name
                      </label>
                      <input
                        value={line.newSupplierName}
                        onChange={(e) =>
                          updateLine(line.key, {
                            newSupplierName: e.target.value,
                          })
                        }
                        placeholder="e.g. ABC Garments"
                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                      />
                    </div>
                  )}
                  <div className="col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold text-slate-600">
                      Note
                    </label>
                    <input
                      value={line.note}
                      onChange={(e) =>
                        updateLine(line.key, { note: e.target.value })
                      }
                      placeholder="Optional receiving note"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">
          Incoming stock is not sellable yet. It becomes on-hand stock once you
          receive it.
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "Saving..."
              : `Add ${lines.length} shipment${lines.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Moving stock between two of your own locations, as its own dedicated action rather than a
// "Transfer in" reason on a plain count — that older approach only ever touched the destination,
// leaving the source to be corrected separately with no reason that actually fit. This does both
// sides atomically in one submit.
function TransferStockModal({
  open,
  warehouses,
  onClose,
  onSaved,
  onManageWarehouses,
}: {
  open: boolean;
  warehouses: WarehouseDTO[];
  onClose: () => void;
  onSaved: () => void;
  onManageWarehouses: () => void;
}) {
  const toast = useToast();
  const [sku, setSku] = useState<InventorySkuOptionDTO | null>(null);
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [fromBin, setFromBin] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [toBin, setToBin] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!toWarehouseId && warehouses[0]) setToWarehouseId(warehouses[0].id);
  }, [warehouses, toWarehouseId]);

  // Where this SKU actually IS right now — a transfer can only ever move real stock, so "From"
  // shouldn't be a free pick the way "To" is (a destination can reasonably be a brand-new bin
  // nobody's used yet; a source can't be, or there'd be nothing there to move). Fetched on demand
  // for just this one variant rather than derived from a full inventory list held in memory —
  // at real catalog scale that list either doesn't exist client-side anymore or is too expensive to
  // keep around just for this one lookup.
  const [stockLocations, setStockLocations] = useState<InventoryLevelDTO[]>([]);
  useEffect(() => {
    if (!sku) {
      setStockLocations([]);
      return;
    }
    let cancelled = false;
    void listVariantLocations(sku.productId, sku.variantId).then((res) => {
      if (!cancelled)
        setStockLocations(
          res.levels
            .filter((l) => l.onHand > 0)
            .sort((a, b) => b.onHand - a.onHand),
        );
    });
    return () => {
      cancelled = true;
    };
  }, [sku]);

  // Same "Unassigned doesn't count as a real shelf" rule as the main table — a warehouse that's
  // never had a real bin named shouldn't show "— Unassigned" tacked onto every location here either.
  // `systemBins` already covers bins that are genuinely in use but never manually predefined, so
  // this doesn't need any inventory data of its own beyond what listWarehouses already returned.
  const warehousesWithRealBins = useMemo(() => {
    const set = new Set<string>();
    for (const warehouse of warehouses) {
      if (hasRealBins([...warehouse.bins, ...warehouse.systemBins]))
        set.add(warehouse.id);
    }
    return set;
  }, [warehouses]);
  const locationLabel = (loc: InventoryLevelDTO) =>
    warehousesWithRealBins.has(loc.warehouseId)
      ? `${loc.warehouseName} — ${loc.bin}`
      : loc.warehouseName;

  // Single real location — lock straight to it, no dropdown, nothing to pick wrong. More than one —
  // default to the biggest and let the location picker below choose between the actual candidates
  // only (never every warehouse/bin in the system, most of which don't even have this SKU).
  useEffect(() => {
    if (stockLocations.length === 0) {
      setFromWarehouseId("");
      setFromBin("");
      return;
    }
    const stillValid = stockLocations.some(
      (l) => l.warehouseId === fromWarehouseId && l.bin === fromBin,
    );
    if (!stillValid) {
      setFromWarehouseId(stockLocations[0].warehouseId);
      setFromBin(stockLocations[0].bin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockLocations]);

  const currentFromLocation =
    stockLocations.find(
      (l) => l.warehouseId === fromWarehouseId && l.bin === fromBin,
    ) ?? null;

  const [toBinOptions, setToBinOptions] = useState<string[]>([]);
  const [toBinsLoaded, setToBinsLoaded] = useState(false);
  useEffect(() => {
    if (!toWarehouseId) return;
    setToBinsLoaded(false);
    void listBins(toWarehouseId).then((res) => {
      setToBinOptions(res.bins);
      setToBinsLoaded(true);
    });
  }, [toWarehouseId]);
  const usesToBins = toBinsLoaded && hasRealBins(toBinOptions);

  useEffect(() => {
    if (!open) {
      setSku(null);
      setToBin("");
      setQuantity("");
      setNote("");
    }
  }, [open]);

  const toWarehouse =
    warehouses.find((w) => w.id === toWarehouseId) ?? warehouses[0];
  const sameLocation =
    !!currentFromLocation &&
    currentFromLocation.warehouseId === toWarehouseId &&
    currentFromLocation.bin === toBin.trim();

  const canSave =
    sku &&
    !!currentFromLocation &&
    !sameLocation &&
    quantity.trim() !== "" &&
    Number(quantity) > 0 &&
    Number(quantity) <= currentFromLocation.onHand &&
    toBin.trim().length > 0 &&
    !!toWarehouse &&
    !saving;

  const save = async () => {
    if (!canSave || !sku || !currentFromLocation || !toWarehouse) return;
    setSaving(true);
    try {
      await transferStock({
        productId: sku.productId,
        variantId: sku.variantId,
        fromWarehouseId: currentFromLocation.warehouseId,
        fromWarehouseName: currentFromLocation.warehouseName,
        fromBin: currentFromLocation.bin,
        toWarehouseId: toWarehouse.id,
        toWarehouseName: toWarehouse.name,
        toBin: toBin.trim(),
        quantity: Number(quantity),
        note: note.trim() || undefined,
      });
      toast.push("Stock transferred.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not transfer this stock.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  if (open && !canTransferBetweenLocations(warehouses)) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="Transfer stock"
        subtitle="Move stock between two of your own locations in one step."
        widthClass="max-w-2xl"
      >
        <WarehouseRequiredNotice
          onManageWarehouses={onManageWarehouses}
          onClose={onClose}
          message={
            warehouses.length === 0
              ? undefined
              : "You need at least two warehouses, or one warehouse split across more than one shelf/bin, to transfer stock between locations."
          }
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer stock"
      subtitle="Move stock between two of your own locations in one step."
      widthClass="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <SkuPicker value={sku} onChange={setSku} />
          </div>

          <div className="col-span-2 rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">From</p>
            {!sku ? (
              <p className="text-sm text-slate-400">
                Pick a product to see where it's currently stocked.
              </p>
            ) : stockLocations.length === 0 ? (
              <p className="text-sm text-rose-600">
                No stock on file for this item anywhere yet — nothing to
                transfer.
              </p>
            ) : stockLocations.length === 1 ? (
              <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                <MapPin size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">
                  {locationLabel(stockLocations[0])}
                </span>
                <span className="shrink-0 text-xs text-slate-400">
                  {stockLocations[0].onHand} units
                </span>
              </div>
            ) : (
              <Popover
                align="left"
                matchTriggerWidth
                trigger={() => (
                  <div className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
                    <MapPin size={14} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">
                      {currentFromLocation
                        ? locationLabel(currentFromLocation)
                        : "Select a location"}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {currentFromLocation?.onHand ?? 0} units
                    </span>
                    <ChevronDown
                      size={14}
                      className="shrink-0 text-slate-400"
                    />
                  </div>
                )}
              >
                {(close) => (
                  <div className="max-h-56 overflow-y-auto p-1.5">
                    {stockLocations.map((loc) => {
                      const isSelected =
                        loc.warehouseId === fromWarehouseId &&
                        loc.bin === fromBin;
                      return (
                        <button
                          key={`${loc.warehouseId}::${loc.bin}`}
                          onClick={() => {
                            setFromWarehouseId(loc.warehouseId);
                            setFromBin(loc.bin);
                            close();
                          }}
                          className={clsx(
                            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                            isSelected ? "bg-indigo-50" : "hover:bg-slate-50",
                          )}
                        >
                          <span
                            className={clsx(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                              isSelected
                                ? "bg-indigo-100 text-indigo-600"
                                : "bg-slate-100 text-slate-400",
                            )}
                          >
                            <MapPin size={14} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">
                            {locationLabel(loc)}
                          </span>
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {loc.onHand} units
                          </span>
                          {isSelected && (
                            <Check
                              size={13}
                              className="shrink-0 text-indigo-600"
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </Popover>
            )}
          </div>

          <div className="col-span-2 rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">To</p>
            <div className={usesToBins ? "grid grid-cols-2 gap-3" : undefined}>
              <WarehousePicker
                warehouses={warehouses}
                value={toWarehouseId}
                onChange={setToWarehouseId}
              />
              {usesToBins && (
                <BinPicker
                  value={toBin}
                  onChange={setToBin}
                  options={toBinOptions}
                  placeholder="Shelf/bin"
                />
              )}
            </div>
          </div>
          {sameLocation && (
            <div className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              Source and destination are the same location — pick a different
              warehouse or bin to transfer to.
            </div>
          )}

          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Quantity to transfer
            </label>
            <input
              type="number"
              min="1"
              max={currentFromLocation?.onHand ?? undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Note
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional audit note"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Transferring..." : "Transfer stock"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Click-to-edit reorder point cell. Shows a "Suggested: N" hint (from real sales velocity) only
// while no manual value has been set — once you set one, your number wins and the hint goes away.
function ReorderPointCell({
  level,
  unitsPerDay,
  onSaved,
  canEdit = true,
}: {
  level: InventoryLevelDTO;
  unitsPerDay: number | undefined;
  onSaved: (level: InventoryLevelDTO) => void;
  canEdit?: boolean;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    level.reorderPoint != null ? String(level.reorderPoint) : "",
  );
  const [saving, setSaving] = useState(false);
  const suggested = suggestedReorderPoint(unitsPerDay);

  const save = async () => {
    setSaving(true);
    try {
      const parsed = value.trim() === "" ? null : Number(value);
      const res = await setInventoryReorderPoint(level.id, parsed);
      onSaved(res.level);
      setEditing(false);
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not save low stock alert.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <input
          autoFocus
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          onBlur={() => void save()}
          className="h-7 w-16 rounded-md border border-indigo-300 px-2 text-sm outline-none"
        />
        {saving && <span className="text-xs text-slate-400">Saving…</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => canEdit && setEditing(true)}
      disabled={!canEdit}
      className="group inline-flex items-center justify-center gap-1.5 disabled:cursor-default"
    >
      <span className="font-medium tabular-nums text-slate-700">
        {level.reorderPoint ?? "—"}
      </span>
      <Pencil
        size={11}
        className={clsx(
          "text-slate-300 opacity-0",
          canEdit && "group-hover:opacity-100",
        )}
      />
      {level.reorderPoint == null && suggested != null && (
        <span className="text-xs text-indigo-500">Suggested: {suggested}</span>
      )}
    </button>
  );
}

// Reserved stock is opaque without this — the reason a unit is locked up lives in the orders
// system, not here. Lazy-loads the drill-down only when opened, since most rows are never clicked.
function ReservedCell({ level }: { level: InventoryLevelDTO }) {
  const [orders, setOrders] = useState<ReservationDTO[] | null>(null);
  const [oversoldTotal, setOversoldTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  if (level.reserved <= 0) {
    return (
      <div>
        <p className="font-semibold tabular-nums text-slate-400">0</p>
        <p className="text-slate-400">booked</p>
      </div>
    );
  }

  // A reservation is written the moment an order is confirmed, whether or not there's real stock
  // behind it (oversell is allowed by default) — this is the one place that flags when `reserved`
  // has outrun `onHand`, since nothing else about the number looks any different otherwise.
  const isOversold = level.reserved > (level.onHand ?? 0);

  const load = () => {
    if (orders || loading) return;
    setLoading(true);
    getLevelReservations(level.id)
      .then((res) => {
        setOrders(res.orders);
        setOversoldTotal(res.oversoldTotal);
      })
      .finally(() => setLoading(false));
  };

  return (
    <Popover
      align="left"
      widthClass="w-72"
      trigger={() => (
        <button
          type="button"
          onClick={load}
          className="text-left hover:opacity-70"
        >
          <p
            className={clsx(
              "font-semibold tabular-nums underline decoration-dotted underline-offset-2",
              isOversold ? "text-rose-600" : "text-indigo-700",
            )}
          >
            {level.reserved}
          </p>
          <p className="text-slate-400">booked</p>
        </button>
      )}
    >
      {() => (
        <div className="max-h-72 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Held for these orders
          </p>
          {loading ? (
            <p className="py-3 text-center text-sm text-slate-400">
              Loading...
            </p>
          ) : !orders || orders.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">
              No matching orders found.
            </p>
          ) : (
            <>
              {oversoldTotal > 0 && (
                <p className="mb-2 rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-semibold text-rose-700">
                  {oversoldTotal} of these unit
                  {oversoldTotal === 1 ? " is" : "s are"} reserved with no stock
                  to back it — need to buy.
                </p>
              )}
              <div className="space-y-2">
                {orders.map((o) => (
                  <div
                    key={o.orderId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-700">
                        {o.orderNumber}
                      </p>
                      <p className="truncate text-slate-400">
                        {o.customerName ?? "Unknown customer"} ·{" "}
                        {STAGE_LABEL[o.stage as OrderStage] ?? o.stage}
                      </p>
                    </div>
                    <span
                      className={clsx(
                        "shrink-0 font-bold tabular-nums",
                        o.oversoldQuantity > 0
                          ? "text-rose-600"
                          : "text-indigo-700",
                      )}
                    >
                      {o.quantity}
                      {o.oversoldQuantity > 0 && (
                        <span className="ml-1 text-[10px] font-semibold text-rose-500">
                          ({o.oversoldQuantity} short)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

// Closes the loop the "Incoming Stock" modal opens — logging one only ever grows this number,
// so without a way to convert it back, "incoming" silently goes stale the moment the shipment
// actually arrives. Prefills the quantity with the full pending amount; lower it for a partial
// receipt (a shipment arriving in two batches, etc.).
export function IncomingCell({
  level,
  onReceived,
  overdueDays,
  shipments,
  variant = "table",
  canReceive = true,
}: {
  level: InventoryLevelDTO;
  onReceived: (level: InventoryLevelDTO) => void;
  overdueDays: number | null;
  shipments: OpenShipmentDTO[];
  variant?: "table" | "shortfall";
  canReceive?: boolean;
}) {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(level.inbound));
  const [saving, setSaving] = useState(false);
  const [writingOff, setWritingOff] = useState(false);
  // A remainder isn't automatically a loss — it could just as easily still be on the way (nothing
  // to do here at all), or a typo in the original shipment entry (a correction, not a real loss).
  // Only "not coming at all" actually needs a loss reason, so that's revealed as its own step rather
  // than dumping all the options in one row and implying they're all equally "a write-off."
  const [remainderStage, setRemainderStage] = useState<
    "choice" | "writeOffReasons"
  >("choice");
  const [remainderChoice, setRemainderChoice] = useState<
    "keepIncoming" | "correctQuantity" | "writeOff"
  >("keepIncoming");
  const [writeOffReason, setWriteOffReason] = useState<InboundWriteOffReason>(
    "Short-shipped by supplier",
  );

  if (level.inbound <= 0) {
    return (
      <div>
        <p className="font-semibold tabular-nums text-slate-400">0</p>
        <p className="text-slate-400">incoming</p>
      </div>
    );
  }

  const receivedQty = Math.max(
    0,
    Math.min(level.inbound, Number(quantity) || 0),
  );
  const remainderQty = Math.max(0, level.inbound - receivedQty);
  const receivedLabel = `${receivedQty} unit${receivedQty === 1 ? "" : "s"}`;
  const remainderLabel = `${remainderQty} unit${remainderQty === 1 ? "" : "s"}`;

  const submit = async (close: () => void) => {
    if (receivedQty <= 0) return;
    setSaving(true);
    try {
      const res = await receiveInboundStock(level.id, receivedQty);
      onReceived(res.level);
      toast.push(`${receivedLabel} received into on-hand stock.`, "success");
      close();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not mark this as received.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  // Only makes sense once the typed number is actually less than the full incoming amount —
  // otherwise "the rest" is a lie, since nothing's been carved off yet. Shows the exact remaining
  // count rather than a vague "the rest," and handles both halves of the real event in one click:
  // whatever was typed goes to on-hand first, then whatever's left over gets written off — instead
  // of requiring two separate trips through this popover to record one actual delivery.
  const writeOff = async (reason: InboundWriteOffReason, close: () => void) => {
    setWritingOff(true);
    try {
      if (receivedQty > 0) {
        const receiveRes = await receiveInboundStock(level.id, receivedQty);
        onReceived(receiveRes.level);
      }
      const res = await writeOffInboundStock(level.id, reason);
      if (!res.success) {
        toast.push(res.message || "Could not write this off.", "info");
      } else {
        onReceived(res.level);
        const remainderPhrase =
          reason === "Wrong entry"
            ? `${remainderQty} corrected — not counted as a loss`
            : `${remainderQty} written off as ${reason.toLowerCase()}`;
        toast.push(
          receivedQty > 0
            ? `${receivedQty} received, ${remainderPhrase}.`
            : `${remainderPhrase[0].toUpperCase()}${remainderPhrase.slice(1)}.`,
          "success",
        );
        close();
      }
    } catch (err) {
      toast.push((err as Error).message || "Could not write this off.", "info");
    } finally {
      setWritingOff(false);
    }
  };

  const confirmReceipt = async (close: () => void) => {
    if (remainderQty <= 0) {
      await submit(close);
      return;
    }

    if (remainderChoice === "keepIncoming") {
      if (receivedQty > 0) {
        await submit(close);
      } else {
        toast.push("Incoming stock left unchanged.", "info");
        close();
      }
      return;
    }

    await writeOff(
      remainderChoice === "correctQuantity" ? "Wrong entry" : writeOffReason,
      close,
    );
  };

  const openModal = () => {
    setQuantity(String(level.inbound));
    setRemainderStage("choice");
    setRemainderChoice("keepIncoming");
    setWriteOffReason("Short-shipped by supplier");
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);
  const busy = saving || writingOff;
  const statusLabel = incomingStatusLabel(shipments);
  const showTimingBadge = statusLabel !== "incoming";
  const primaryActionLabel =
    remainderQty <= 0
      ? `Receive ${receivedLabel}`
      : remainderChoice === "keepIncoming"
        ? receivedQty > 0
          ? `Receive ${receivedLabel}`
          : `Leave ${remainderLabel} incoming`
        : remainderChoice === "correctQuantity"
          ? receivedQty > 0
            ? `Receive ${receivedQty} and correct ${remainderQty}`
            : `Correct ${remainderLabel}`
          : receivedQty > 0
            ? `Receive ${receivedQty} and write off ${remainderQty}`
            : `Write off ${remainderLabel}`;

  if (!canReceive) {
    if (variant === "shortfall") {
      return (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold tabular-nums text-indigo-600">
            {level.inbound}
          </span>
          <span className="text-slate-400">{statusLabel}</span>
        </span>
      );
    }

    return (
      <div className="text-left">
        <p className="font-semibold tabular-nums text-emerald-700">
          {level.inbound}
        </p>
        <p
          className={
            overdueDays != null ? "font-semibold text-rose-600" : "text-slate-400"
          }
        >
          {statusLabel}
        </p>
      </div>
    );
  }

  return (
    <>
      {variant === "shortfall" ? (
        <button
          type="button"
          onClick={openModal}
          className="inline-flex items-center gap-1.5 transition hover:opacity-70"
        >
          <span className="font-bold tabular-nums text-indigo-600 underline decoration-dotted underline-offset-2">
            {level.inbound}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="text-slate-400">incoming</span>
            {showTimingBadge && (
              <span
                className={clsx(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  overdueDays != null
                    ? "bg-rose-50 text-rose-700"
                    : "bg-indigo-50 text-indigo-700",
                )}
              >
                {statusLabel}
              </span>
            )}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openModal}
          className="text-left transition hover:opacity-70"
        >
          <p className="font-semibold tabular-nums text-emerald-700 underline decoration-dotted underline-offset-2">
            {level.inbound}
          </p>
          <p
            className={
              overdueDays != null
                ? "font-semibold text-rose-600"
                : "text-slate-400"
            }
          >
            {statusLabel}
          </p>
        </button>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title="Incoming Shipment Details"
        subtitle={`${level.productTitle ?? "Inventory item"}${level.variantLabel ? ` - ${level.variantLabel}` : ""}`}
        widthClass="max-w-xl"
      >
        <div className="space-y-4">
          <IncomingCoveragePanel
            shipments={shipments}
            title="Incoming shipments"
          />

          <section className="zs-surface p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Mark as received
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Convert arrived units from incoming stock into on-hand stock.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
                {level.inbound} incoming
              </span>
            </div>

            {overdueDays != null && (
              <p className="mb-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-700">
                This shipment is {overdueDays}d late - worth chasing up with the
                supplier.
              </p>
            )}

            <p className="mb-2 text-xs font-semibold text-slate-500">
              Arrived now
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max={level.inbound}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="h-9 w-24 rounded-lg border border-slate-200 px-3 text-sm font-semibold tabular-nums text-slate-800 outline-none focus:border-indigo-400"
              />
              <span className="text-xs text-slate-400">
                of {level.inbound} incoming units arrived
              </span>
            </div>
            {remainderQty > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <p className="mb-1.5 text-[11px] text-slate-400">
                  The other{" "}
                  <strong className="text-slate-600">{remainderQty}</strong>{" "}
                  unit{remainderQty === 1 ? "" : "s"} — what's the situation?
                </p>
                {remainderStage === "choice" ? (
                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={() => setRemainderChoice("keepIncoming")}
                      disabled={busy}
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        remainderChoice === "keepIncoming"
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Keep as incoming
                      <span className="block font-normal text-slate-400">
                        Still expected from supplier.
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemainderChoice("correctQuantity")}
                      disabled={busy}
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        remainderChoice === "correctQuantity"
                          ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      Correct expected quantity
                      <span className="block font-normal text-slate-400">
                        Wrong quantity entered — not a real loss
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRemainderChoice("writeOff");
                        setRemainderStage("writeOffReasons");
                      }}
                      disabled={busy}
                      className={`w-full rounded-md border px-2 py-1.5 text-left text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                        remainderChoice === "writeOff"
                          ? "border-amber-300 bg-amber-100 text-amber-800"
                          : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      }`}
                    >
                      Not coming — write it off
                      <span className="block font-normal text-amber-600/70">
                        A real loss — counts on the Loss Report
                      </span>
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => setRemainderStage("choice")}
                      className="mb-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600"
                    >
                      ← Back
                    </button>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setWriteOffReason("Short-shipped by supplier")
                        }
                        disabled={busy}
                        className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          writeOffReason === "Short-shipped by supplier"
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        }`}
                      >
                        Supplier shorted it
                      </button>
                      <button
                        type="button"
                        onClick={() => setWriteOffReason("Lost in transit")}
                        disabled={busy}
                        className={`rounded-md border px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          writeOffReason === "Lost in transit"
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        }`}
                      >
                        Lost in transit
                      </button>
                      <button
                        type="button"
                        onClick={() => setWriteOffReason("Damaged on arrival")}
                        disabled={busy}
                        className={`col-span-2 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          writeOffReason === "Damaged on arrival"
                            ? "border-amber-300 bg-amber-100 text-amber-800"
                            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                        }`}
                      >
                        Damaged on arrival
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => void confirmReceipt(closeModal)}
              disabled={busy}
              className="mt-4 w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Saving..." : primaryActionLabel}
            </button>
          </section>
        </div>
      </Modal>
    </>
  );
}

export function InventoryPage() {
  const toast = useToast();
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowedModules = user?.role
    ? ROLE_DEFINITIONS[user.role].modules
    : ROLE_DEFINITIONS.owner.modules;
  const hasDedicatedPreOrdersPage = allowedModules.includes("preOrders");
  const canWriteInventory = canWriteModule(user?.role, "inventory");
  const [view, setView] = useState<PageView>("stock");
  // The current page's rows, full detail — the actual table content. Counts, the summary tiles,
  // the velocity map, and multi-location detection all come from the server already computed
  // across the whole matching set (see listInventory) rather than the client holding — and
  // re-fetching on every filter change — every one of a tenant's inventory records just to derive
  // a handful of numbers from them.
  const [pageLevels, setPageLevels] = useState<InventoryLevelDTO[]>([]);
  const [levelsTotal, setLevelsTotal] = useState(0);
  const [levelsCounts, setLevelsCounts] = useState<InventoryLevelCounts>({
    all: 0,
    reorder: 0,
    overdue: 0,
    reserved: 0,
    dead: 0,
    inbound: 0,
  });
  const [levelsSummary, setLevelsSummary] = useState({
    onHand: 0,
    inbound: 0,
    value: 0,
  });
  const [multiLocationVariantIds, setMultiLocationVariantIds] = useState<
    Set<string>
  >(new Set());
  const [levelsLoading, setLevelsLoading] = useState(false);
  // Distinct from levelsTotal (which reflects the current search/focus/warehouse/bin filters) —
  // this only ever reflects whether the tenant has tracked *anything* at all, ever, so a search
  // that happens to match nothing doesn't wrongly show the "log your first count" onboarding
  // empty state instead of an ordinary "no results" one.
  const [hasAnyInventory, setHasAnyInventory] = useState(true);
  const [movements, setMovements] = useState<InventoryMovementDTO[]>([]);
  const [velocityByVariantId, setVelocityByVariantId] = useState<
    Record<string, number>
  >({});
  const [skuOptions, setSkuOptions] = useState<InventorySkuOptionDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<FocusMode>("all");
  const [sortMode, setSortMode] = useState<SortMode>("onHand");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [binFilter, setBinFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [countModalOpen, setCountModalOpen] = useState(false);
  const [inboundModalOpen, setInboundModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);

  const [shrinkage, setShrinkage] = useState<ShrinkageReportDTO | null>(null);
  const [shrinkageLoading, setShrinkageLoading] = useState(false);

  const [ledgerMovements, setLedgerMovements] = useState<
    InventoryMovementDTO[]
  >([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerReasons, setLedgerReasons] = useState<string[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerReason, setLedgerReason] = useState("");
  const [ledgerWarehouseId, setLedgerWarehouseId] = useState("");
  const [ledgerDateFrom, setLedgerDateFrom] = useState("");
  const [ledgerDateTo, setLedgerDateTo] = useState("");
  const LEDGER_PAGE_SIZE = 25;

  const [shortfalls, setShortfalls] = useState<StockShortfallRowDTO[]>([]);
  const [shortfallsSummary, setShortfallsSummary] =
    useState<StockShortfallsSummaryDTO>({
      skuCount: 0,
      affectedOrderCount: 0,
      shortageUnits: 0,
      orderUnits: 0,
      incomingCoverageUnits: 0,
    });
  const [shortfallsLoading, setShortfallsLoading] = useState(false);
  const [shortfallsLoaded, setShortfallsLoaded] = useState(false);
  const [shortfallsSearch, setShortfallsSearch] = useState("");
  const [shortfallsPage, setShortfallsPage] = useState(1);
  const [shortfallsTotal, setShortfallsTotal] = useState(0);
  const SHORTFALLS_PAGE_SIZE = 50;
  // Carries a single shortfall row's suggested SKU/quantity/warehouse into the Incoming Stock
  // modal — the "Add incoming" shortcut button below sets this instead of making someone re-search
  // for a product they're already looking at.
  const [inboundPrefill, setInboundPrefill] = useState<{
    sku: InventorySkuOptionDTO;
    quantity: number;
    warehouseId: string;
  } | null>(null);
  const [selectedShortfallKeys, setSelectedShortfallKeys] = useState<
    Set<string>
  >(new Set());
  const [bulkInboundModalOpen, setBulkInboundModalOpen] = useState(false);

  const [openShipments, setOpenShipments] = useState<OpenShipmentDTO[]>([]);

  // Takes an explicit shipments list rather than always reading `openShipments` state — the very
  // first call happens from `load()` in the same tick it fetches shipments, before that state
  // update has actually landed, so reading the state here would still see last render's (empty)
  // value. Every later call (search/filter changes, Prev/Next) just relies on the default, since by
  // then `openShipments` state is already current.
  const loadStockLevel = async (
    targetPage: number,
    shipmentsForOverdue: OpenShipmentDTO[] = openShipments,
  ) => {
    setLevelsLoading(true);
    try {
      const overdueKeys = shipmentsForOverdue
        .filter((s) => s.daysOverdue != null)
        .map(
          (s) => `${s.productId}::${s.variantId}::${s.warehouseId}::${s.bin}`,
        )
        .join(",");
      const res = await listInventory({
        search: search.trim() || undefined,
        warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
        bin: binFilter !== "all" ? binFilter : undefined,
        focus: focus !== "all" ? focus : undefined,
        sortMode,
        overdueKeys: overdueKeys || undefined,
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setPageLevels(res.levels);
      setLevelsTotal(res.total);
      setLevelsCounts(res.counts);
      setLevelsSummary(res.summary);
      if (!search.trim() && warehouseFilter === "all" && binFilter === "all")
        setHasAnyInventory(res.counts.all > 0);
      setMultiLocationVariantIds(new Set(res.multiLocationVariantIds));
      setMovements(res.movements);
      setVelocityByVariantId(res.velocityByVariantId);
      setPage(targetPage);
    } catch {
      toast.push("Could not load inventory.", "info");
    } finally {
      setLevelsLoading(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [skusRes, supplierRes, warehouseRes, openShipmentsRes] =
        await Promise.all([
          listInventorySkuOptions(),
          listSuppliers(),
          listWarehouses(),
          getOpenShipments(),
        ]);
      setSkuOptions(skusRes.options);
      setSuppliers(supplierRes.suppliers);
      setWarehouses(warehouseRes.warehouses);
      setOpenShipments(openShipmentsRes.shipments);
      await loadStockLevel(1, openShipmentsRes.shipments);
    } catch {
      toast.push("Could not load inventory workspace.", "info");
    } finally {
      setLoading(false);
    }
  };

  const loadOpenShipments = async () => {
    try {
      const res = await getOpenShipments();
      setOpenShipments(res.shipments);
    } catch {
      toast.push("Could not refresh incoming shipment details.", "info");
    }
  };

  const loadShrinkage = async () => {
    setShrinkageLoading(true);
    try {
      setShrinkage(await getShrinkageReport());
    } catch {
      toast.push("Could not load the loss report.", "info");
    } finally {
      setShrinkageLoading(false);
    }
  };

  // Takes an explicit page rather than always reading the `ledgerPage` state, so a filter change
  // can request page 1 and a Prev/Next click can request page ± 1 in the same tick they're
  // decided — avoiding a stale-closure race against React's async state updates.
  const loadLedger = async (targetPage: number) => {
    setLedgerLoading(true);
    try {
      const res = await listMovements({
        search: ledgerSearch.trim() || undefined,
        reason: ledgerReason || undefined,
        warehouseId: ledgerWarehouseId || undefined,
        dateFrom: ledgerDateFrom
          ? new Date(ledgerDateFrom).toISOString()
          : undefined,
        dateTo: ledgerDateTo
          ? new Date(`${ledgerDateTo}T23:59:59`).toISOString()
          : undefined,
        page: targetPage,
        pageSize: LEDGER_PAGE_SIZE,
      });
      setLedgerMovements(res.movements);
      setLedgerTotal(res.total);
      setLedgerReasons(res.reasons);
      setLedgerPage(targetPage);
    } catch {
      toast.push("Could not load the movement ledger.", "info");
    } finally {
      setLedgerLoading(false);
    }
  };

  const loadStockShortfalls = async (
    searchValue = shortfallsSearch,
    targetPage = 1,
  ) => {
    setShortfallsLoading(true);
    try {
      const res = await listStockShortfalls({
        search: searchValue.trim() || undefined,
        page: targetPage,
        pageSize: SHORTFALLS_PAGE_SIZE,
      });
      setShortfalls(res.rows);
      setShortfallsSummary(res.summary);
      setShortfallsTotal(res.total);
      setShortfallsPage(targetPage);
      setShortfallsLoaded(true);
    } catch {
      toast.push("Could not load stock shortfalls.", "info");
    } finally {
      setShortfallsLoading(false);
    }
  };

  // Called after every action that can log a shrinkage-relevant movement (a damaged/lost/cycle
  // count, an inbound write-off, a return QC'd with a shortfall) — only actually refetches if the
  // report's already been loaded once this session, so it stays in sync in the background without
  // forcing a fetch nobody's asked to see yet.
  const refreshShrinkageIfLoaded = () => {
    if (shrinkage) void loadShrinkage();
  };

  // Same pattern — logging incoming stock (single or bulk) can move a row from "Need to buy" to
  // "Incoming covers," or clear it off the list entirely, so the Shortfalls tab needs to reflect
  // that immediately rather than showing a stale "need to buy" number after the action that just
  // addressed it.
  const refreshShortfallsIfLoaded = () => {
    if (shortfallsLoaded) void loadStockShortfalls();
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Always refetches on switching to this tab (unlike returns, which only loads once) — shrinkage
    // is exactly the kind of number someone checks right after logging a damaged/lost count, and a
    // stale cached report from an earlier visit would silently hide the thing they just came to see.
    if (view === "shrinkage") void loadShrinkage();
    if (view === "ledger") void loadLedger(1);
    if (view === "shortfalls" && !shortfallsLoaded) void loadStockShortfalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Debounced so typing in the search box doesn't fire a request per keystroke — every filter
  // change restarts on page 1, since a stale page number from a previous, differently-filtered
  // result set wouldn't mean anything here.
  useEffect(() => {
    if (view !== "shortfalls") return;
    const handle = setTimeout(
      () => void loadStockShortfalls(shortfallsSearch),
      250,
    );
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortfallsSearch]);

  useEffect(() => {
    if (view !== "ledger") return;
    const handle = setTimeout(() => void loadLedger(1), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ledgerSearch,
    ledgerReason,
    ledgerWarehouseId,
    ledgerDateFrom,
    ledgerDateTo,
  ]);

  // Only worth offering once a warehouse is actually picked (a bin name means nothing across
  // multiple warehouses at once) and once that warehouse has stock spread across more than one bin
  // — a single bin isn't something worth filtering by, and most businesses on this system never
  // name bins at all, so the dropdown would otherwise show up as permanent, useless clutter. Fetched
  // via the same dedicated bins lookup the count/transfer modals already use, rather than derived
  // from a full inventory list.
  const [binFilterOptions, setBinFilterOptions] = useState<string[]>([]);
  useEffect(() => {
    if (warehouseFilter === "all") {
      setBinFilterOptions([]);
      return;
    }
    let cancelled = false;
    void listBins(warehouseFilter).then((res) => {
      if (!cancelled) setBinFilterOptions(res.bins.length > 1 ? res.bins : []);
    });
    return () => {
      cancelled = true;
    };
  }, [warehouseFilter]);

  // Which warehouses have a real, deliberately-named shelf on record — same "Unassigned doesn't
  // count" rule as everywhere else bin-tracking turns on. Drives whether the main table's Location
  // column shows a bin line at all: a warehouse nobody's ever shelved anything in shouldn't show
  // "Unassigned" under every single row as if that were meaningful shelf information. systemBins
  // already covers bins genuinely in use but never manually predefined, so this needs nothing
  // beyond what listWarehouses already returned.
  const warehousesWithRealBins = useMemo(() => {
    const set = new Set<string>();
    for (const warehouse of warehouses) {
      if (hasRealBins([...warehouse.bins, ...warehouse.systemBins]))
        set.add(warehouse.id);
    }
    return set;
  }, [warehouses]);

  useEffect(() => {
    setBinFilter("all");
  }, [warehouseFilter]);

  // Overdue shipments are keyed by product+variant+warehouse+bin, same as a level — this maps each
  // affected level to the worst (largest) days-overdue among its open shipments, so a level with
  // more than one overdue shipment still shows a single, honest "how late" number.
  const levelKey = (level: InventoryLevelDTO) =>
    `${level.productId}::${level.variantId}::${level.warehouseId}::${level.bin}`;
  const shipmentKey = (shipment: OpenShipmentDTO) =>
    `${shipment.productId}::${shipment.variantId}::${shipment.warehouseId}::${shipment.bin}`;

  const openShipmentsByLevelKey = useMemo(() => {
    const map = new Map<string, OpenShipmentDTO[]>();
    for (const shipment of openShipments) {
      const key = shipmentKey(shipment);
      const list = map.get(key) ?? [];
      list.push(shipment);
      map.set(key, list);
    }
    return map;
  }, [openShipments]);

  const overdueDaysByLevelKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const shipment of openShipments) {
      if (shipment.daysOverdue == null) continue;
      const key = shipmentKey(shipment);
      map.set(key, Math.max(map.get(key) ?? 0, shipment.daysOverdue));
    }
    return map;
  }, [openShipments]);

  // Built directly from the row/location data the shortfalls endpoint already returned (it embeds
  // each location's own inventoryLevels id) — no lookup into a separate inventory list needed.
  // unitCost/pendingUnitCost/timestamps are never read by anything this feeds (IncomingCell only
  // needs id/inbound; onReceived swaps in the server's fresh copy anyway), so they're left as
  // harmless placeholders rather than fetched.
  const levelForShortfallLocation = (
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

  const shortfallRowKey = (row: StockShortfallRowDTO) =>
    `${row.productId ?? row.sku}-${row.variantId ?? row.variantLabel ?? ""}`;

  // What to suggest logging as incoming for this row, and where. `orderNeed` alone only clears
  // today's backlog — if a location also carries a reorder point, topping up to it (rather than just
  // to zero-short) means the next order doesn't put this SKU right back on this same list a few days
  // later. Never authoritative — always shown as an editable, labeled suggestion in the modal, since
  // what a supplier actually agrees to on a call can reasonably differ from either number.
  function shortfallSuggestion(row: StockShortfallRowDTO): {
    quantity: number;
    warehouseId: string;
  } {
    let restockTopUp = 0;
    let targetLocation: StockShortfallLocationDTO | null = null;
    for (const location of row.locations) {
      if (location.reorderPoint != null) {
        restockTopUp += Math.max(
          0,
          location.reorderPoint - location.free - location.inbound,
        );
      }
      if (!targetLocation || location.free < targetLocation.free)
        targetLocation = location;
    }
    const quantity = Math.max(row.orderNeed, restockTopUp, 1);
    const warehouseId = targetLocation?.warehouseId ?? warehouses[0]?.id ?? "";
    return { quantity, warehouseId };
  }

  const toggleShortfallSelection = (row: StockShortfallRowDTO) => {
    const key = shortfallRowKey(row);
    setSelectedShortfallKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Only rows with a resolvable product/variant can actually be logged as incoming (same
  // requirement as the per-row "Add incoming" button) — "select all" should only ever select what
  // Add incoming (bulk) can actually act on.
  const selectableShortfalls = shortfalls.filter(
    (row) => row.productId && row.variantId,
  );
  const selectAllShortfalls = () =>
    setSelectedShortfallKeys(
      new Set(selectableShortfalls.map(shortfallRowKey)),
    );
  const clearShortfallSelection = () => setSelectedShortfallKeys(new Set());

  const totalPages = Math.max(1, Math.ceil(levelsTotal / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Search/focus/warehouse/bin/sort changes all restart on page 1 of a re-fetched result set — a
  // stale page number from a previous, differently-filtered set wouldn't mean anything here. Search
  // is debounced so typing doesn't fire a request per keystroke; the rest apply immediately since
  // they're discrete picks (a button/dropdown choice), not something typed character by character.
  useEffect(() => {
    if (view !== "stock" || loading) return;
    const handle = setTimeout(() => void loadStockLevel(1), 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, focus, sortMode, warehouseFilter, binFilter]);

  const summary = levelsSummary;
  const reorderCount = levelsCounts.reorder;
  // Ordered by urgency, not alphabetically or by when each filter was added — restock risk costs
  // sales today, an overdue shipment means a supplier commitment already slipped and needs chasing,
  // reserved stock is diagnostic ("why can't I sell this"), dead stock is capital tied up but not
  // urgent, incoming (on schedule, nothing wrong yet) is the least urgent of all.
  const focusOptions: { key: FocusMode; label: string; count: number }[] = [
    { key: "all", label: "All items", count: levelsCounts.all },
    { key: "reorder", label: "Low Stock", count: levelsCounts.reorder },
    { key: "overdue", label: "Late shipments", count: levelsCounts.overdue },
    {
      key: "reserved",
      label: "Booked for orders",
      count: levelsCounts.reserved,
    },
    { key: "dead", label: "Dead stock", count: levelsCounts.dead },
    { key: "inbound", label: "Incoming stock", count: levelsCounts.inbound },
  ];

  const movementRows = movements.slice(0, 8);

  // multiLocationVariantIds itself is now server-provided (see loadStockLevel) — a variant stocked
  // at more than one warehouse/bin can't get the automatic cycle-count correction (order line items
  // don't carry a location), and knowing that needs comparing counts across a variant's locations
  // everywhere in the catalog, not just the current page.

  const applyLevelUpdate = (updated: InventoryLevelDTO) => {
    setPageLevels((prev) =>
      prev.map((l) => (l.id === updated.id ? updated : l)),
    );
    void loadOpenShipments();
    // Covers the inbound write-off action (a shrinkage source) along with plain reorder-point edits
    // and ordinary "mark received" (which aren't) — cheap and harmless to over-trigger since it's a
    // no-op unless the report's already loaded.
    refreshShrinkageIfLoaded();
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header flex flex-wrap items-center justify-between gap-y-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="zs-page-title">Inventory</h1>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
              Command center
            </span>
          </div>
          <p className="zs-page-description">
            Per-SKU stock counts, low stock alerts, incoming stock and loss.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWriteInventory && (
            <>
              <button
                onClick={() => setCountModalOpen(true)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Plus size={14} /> New count
              </button>
              <button
                onClick={() => {
                  setInboundPrefill(null);
                  setInboundModalOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <Truck size={14} /> Incoming Stock
              </button>
            </>
          )}
          {canWriteInventory && canTransferBetweenLocations(warehouses) && (
            <button
              onClick={() => setTransferModalOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-700"
            >
              <ArrowLeftRight size={14} /> Transfer stock
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 pt-3 lg:px-8">
        <div className="flex flex-wrap items-center gap-1">
          {(["stock", "shortfalls", "ledger", "shrinkage"] as PageView[])
            .filter((v) => v !== "shortfalls" || !hasDedicatedPreOrdersPage)
            .map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={clsx(
                  "rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors",
                  view === v
                    ? "border-b-2 border-indigo-600 text-indigo-600"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {v === "stock"
                  ? "Stock levels"
                  : v === "shortfalls"
                    ? "Stock Shortfalls"
                    : v === "shrinkage"
                      ? "Loss Report"
                      : "Stock History"}
                {v === "shortfalls" && shortfallsSummary.skuCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    {shortfallsSummary.skuCount}
                  </span>
                )}
              </button>
            ))}
        </div>
      </div>

      {view === "shortfalls" ? (
        <div className="zs-page-body">
          <div className="space-y-4">
            <div className="zs-summary-strip">
              <MetricCard
                icon={PackagePlus}
                label="Need to buy"
                value={shortfallsSummary.orderUnits.toLocaleString()}
                detail="units after incoming stock"
                tone={shortfallsSummary.orderUnits > 0 ? "rose" : "emerald"}
              />
              <MetricCard
                icon={AlertTriangle}
                label="Short now"
                value={shortfallsSummary.shortageUnits.toLocaleString()}
                detail="units blocking orders"
                tone={shortfallsSummary.shortageUnits > 0 ? "amber" : "emerald"}
              />
              <MetricCard
                icon={ClipboardCheck}
                label="Affected orders"
                value={shortfallsSummary.affectedOrderCount.toLocaleString()}
                detail={`${shortfallsSummary.skuCount.toLocaleString()} SKU${shortfallsSummary.skuCount === 1 ? "" : "s"}`}
              />
              <MetricCard
                icon={Truck}
                label="Covered incoming"
                value={shortfallsSummary.incomingCoverageUnits.toLocaleString()}
                detail="short units already inbound"
                tone="indigo"
              />
            </div>

            <section className="zs-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Stock Shortfalls
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Pending, flagged, and pre-confirm hold orders that cannot be
                    covered by currently free stock.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {selectableShortfalls.length > 0 && (
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      {selectedShortfallKeys.size <
                        selectableShortfalls.length && (
                        <button
                          onClick={selectAllShortfalls}
                          className="text-indigo-600 hover:underline"
                        >
                          Select all ({selectableShortfalls.length})
                        </button>
                      )}
                      {selectedShortfallKeys.size > 0 && (
                        <button
                          onClick={clearShortfallSelection}
                          className="text-slate-500 hover:underline"
                        >
                          Clear selection
                        </button>
                      )}
                    </div>
                  )}
                  {canWriteInventory && selectedShortfallKeys.size > 0 && (
                    <button
                      onClick={() => setBulkInboundModalOpen(true)}
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      <Truck size={14} /> Add incoming (
                      {selectedShortfallKeys.size})
                    </button>
                  )}
                  <div className="relative w-full sm:w-72">
                    <Search
                      size={15}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      value={shortfallsSearch}
                      onChange={(e) => setShortfallsSearch(e.target.value)}
                      placeholder="Search product, variant or SKU"
                      className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="zs-surface overflow-hidden">
              {shortfallsLoading && !shortfallsLoaded ? (
                <div className="zs-loading-state">
                  Loading stock shortfalls...
                </div>
              ) : shortfalls.length === 0 ? (
                <div className="zs-empty-state">
                  <PackageCheck size={28} className="text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">
                    No stock shortfalls right now
                  </p>
                  <p className="max-w-md text-sm text-slate-400">
                    Every active pre-confirm order is either covered by free
                    stock or the item is not tracked in Inventory yet.
                  </p>
                </div>
              ) : (
                <div className="zs-table-body">
                  {shortfalls.map((row) => {
                    const rowIncomingLevels = row.locations
                      .map((location) =>
                        levelForShortfallLocation(row, location),
                      )
                      .filter((level): level is InventoryLevelDTO =>
                        Boolean(level && level.inbound > 0),
                      );
                    const singleIncomingLevel =
                      rowIncomingLevels.length === 1
                        ? rowIncomingLevels[0]
                        : null;
                    const rowKey = shortfallRowKey(row);
                    const canLogIncoming = Boolean(
                      row.productId && row.variantId,
                    );
                    const suggestion = canLogIncoming
                      ? shortfallSuggestion(row)
                      : null;
                    const isSelected = selectedShortfallKeys.has(rowKey);
                    return (
                      <div key={rowKey} className="p-4">
                        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-start gap-3">
                              {canLogIncoming && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleShortfallSelection(row)}
                                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  aria-label={`Select ${row.productTitle ?? row.sku}`}
                                />
                              )}
                              {row.productImage ? (
                                <img
                                  src={row.productImage}
                                  alt={row.productTitle ?? ""}
                                  className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover"
                                />
                              ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                                  <Package size={18} />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate font-semibold text-slate-900">
                                    {row.productTitle ?? "Inventory item"}
                                  </p>
                                  {row.orderNeed > 0 ? (
                                    <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 ring-1 ring-inset ring-rose-600/20">
                                      Need to buy
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 ring-1 ring-inset ring-indigo-600/20">
                                      Incoming covers
                                    </span>
                                  )}
                                  {canWriteInventory && suggestion && (
                                    <button
                                      onClick={() => {
                                        setInboundPrefill({
                                          sku: {
                                            productId: row.productId!,
                                            variantId: row.variantId!,
                                            sku: row.sku,
                                            productTitle:
                                              row.productTitle ?? row.sku,
                                            productImage: row.productImage,
                                            variantLabel:
                                              row.variantLabel ?? "",
                                          },
                                          quantity: suggestion.quantity,
                                          warehouseId: suggestion.warehouseId,
                                        });
                                        setInboundModalOpen(true);
                                      }}
                                      className="ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 text-[11px] font-bold text-white hover:bg-indigo-700"
                                    >
                                      <Truck size={12} /> Add incoming
                                    </button>
                                  )}
                                </div>
                                <p className="mt-0.5 truncate text-xs text-slate-400">
                                  {row.variantLabel
                                    ? `${row.variantLabel} - `
                                    : ""}
                                  SKU {row.sku}
                                </p>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
                                  <div>
                                    <p className="font-bold tabular-nums text-slate-900">
                                      {row.demand}
                                    </p>
                                    <p className="text-slate-400">
                                      order demand
                                    </p>
                                  </div>
                                  <div>
                                    <p className="font-bold tabular-nums text-emerald-600">
                                      {row.availableNow}
                                    </p>
                                    <p className="text-slate-400">free now</p>
                                  </div>
                                  <div>
                                    {singleIncomingLevel ? (
                                      <IncomingCell
                                        level={singleIncomingLevel}
                                        onReceived={applyLevelUpdate}
                                        overdueDays={
                                          overdueDaysByLevelKey.get(
                                            levelKey(singleIncomingLevel),
                                          ) ?? null
                                        }
                                        shipments={
                                          openShipmentsByLevelKey.get(
                                            levelKey(singleIncomingLevel),
                                          ) ?? []
                                        }
                                        variant="shortfall"
                                        canReceive={canWriteInventory}
                                      />
                                    ) : (
                                      <p className="font-bold tabular-nums text-indigo-600">
                                        {row.inbound}
                                      </p>
                                    )}
                                    {!singleIncomingLevel && (
                                      <p className="mt-0.5 text-slate-400">
                                        incoming
                                      </p>
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-bold tabular-nums text-amber-600">
                                      {row.shortageNow}
                                    </p>
                                    <p className="text-slate-400">short now</p>
                                  </div>
                                  <div>
                                    <p
                                      className={clsx(
                                        "font-bold tabular-nums",
                                        row.orderNeed > 0
                                          ? "text-rose-600"
                                          : "text-emerald-600",
                                      )}
                                    >
                                      {row.orderNeed}
                                    </p>
                                    <p className="text-slate-400">
                                      need to buy
                                    </p>
                                    {suggestion &&
                                      suggestion.quantity > row.orderNeed && (
                                        <p className="mt-0.5 text-[10px] font-semibold text-indigo-600">
                                          Suggest {suggestion.quantity} to also
                                          refill reorder point
                                        </p>
                                      )}
                                  </div>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {row.locations.map((location) => {
                                    const locationLevel =
                                      levelForShortfallLocation(row, location);
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
                                        {location.inbound > 0 &&
                                        locationLevel ? (
                                          <IncomingCell
                                            level={locationLevel}
                                            onReceived={applyLevelUpdate}
                                            overdueDays={
                                              overdueDaysByLevelKey.get(
                                                levelKey(locationLevel),
                                              ) ?? null
                                            }
                                            shipments={
                                              openShipmentsByLevelKey.get(
                                                levelKey(locationLevel),
                                              ) ?? []
                                            }
                                            variant="shortfall"
                                            canReceive={canWriteInventory}
                                          />
                                        ) : location.inbound > 0 ? (
                                          <span>
                                            , {location.inbound} incoming
                                          </span>
                                        ) : null}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border border-slate-200">
                            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                Affected orders
                              </p>
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                {row.orderCount}
                              </span>
                            </div>
                            <div className="max-h-56 overflow-y-auto zs-table-body">
                              {row.orders.map((order) => (
                                <div
                                  key={order.orderId}
                                  className="flex items-start justify-between gap-3 px-3 py-2.5 text-xs"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
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
                                    <p className="mt-0.5 text-slate-400">
                                      {ageLabel(order.createdAt)} ago
                                    </p>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <p className="font-bold tabular-nums text-rose-600">
                                      {order.shortQuantity} short
                                    </p>
                                    <p className="text-slate-400">
                                      of {order.quantity}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {shortfallsTotal > SHORTFALLS_PAGE_SIZE && (
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-400">
                    Showing{" "}
                    <span className="font-medium text-slate-600">
                      {(shortfallsPage - 1) * SHORTFALLS_PAGE_SIZE + 1}
                    </span>
                    -
                    <span className="font-medium text-slate-600">
                      {Math.min(
                        shortfallsTotal,
                        shortfallsPage * SHORTFALLS_PAGE_SIZE,
                      )}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-slate-600">
                      {shortfallsTotal.toLocaleString()}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        void loadStockShortfalls(
                          shortfallsSearch,
                          Math.max(1, shortfallsPage - 1),
                        )
                      }
                      disabled={shortfallsPage <= 1 || shortfallsLoading}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeft size={12} /> Prev
                    </button>
                    <span className="min-w-[76px] text-center text-xs text-slate-400">
                      Page {shortfallsPage} of{" "}
                      {Math.max(
                        1,
                        Math.ceil(shortfallsTotal / SHORTFALLS_PAGE_SIZE),
                      )}
                    </span>
                    <button
                      onClick={() =>
                        void loadStockShortfalls(
                          shortfallsSearch,
                          Math.min(
                            Math.max(
                              1,
                              Math.ceil(shortfallsTotal / SHORTFALLS_PAGE_SIZE),
                            ),
                            shortfallsPage + 1,
                          ),
                        )
                      }
                      disabled={
                        shortfallsPage >=
                          Math.ceil(shortfallsTotal / SHORTFALLS_PAGE_SIZE) ||
                        shortfallsLoading
                      }
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      ) : view === "shrinkage" ? (
        <div className="px-4 py-4 lg:px-8 lg:py-6">
          {shrinkageLoading || !shrinkage ? (
            <div className="zs-loading-state">Loading loss report...</div>
          ) : (
            <div className="space-y-6">
              <div className="zs-summary-strip">
                <MetricCard
                  icon={TrendingDown}
                  label="Net value lost"
                  value={money(shrinkage.netValueLost)}
                  detail={`${shrinkage.netUnitsLost.toLocaleString()} units, after recoveries`}
                  tone="rose"
                />
                <MetricCard
                  icon={ShieldCheck}
                  label="Gross value lost"
                  value={money(shrinkage.totalValueLost)}
                  detail={`${shrinkage.totalUnitsLost.toLocaleString()} units, before recoveries`}
                />
                <MetricCard
                  icon={PackagePlus}
                  label="Recovered"
                  value={money(shrinkage.recoveredValue)}
                  detail={
                    shrinkage.recoveredUnits > 0
                      ? `${shrinkage.recoveredUnits.toLocaleString()} units found`
                      : "no found stock logged yet"
                  }
                  tone="emerald"
                />
                <MetricCard
                  icon={ClipboardCheck}
                  label="Top reason"
                  value={shrinkage.byReason[0]?.reason ?? "—"}
                  detail={
                    shrinkage.byReason[0]
                      ? `${shrinkage.byReason[0].units} units`
                      : "no loss recorded"
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <section className="zs-surface p-4">
                  <h2 className="mb-3 text-sm font-bold text-slate-900">
                    By reason
                  </h2>
                  {shrinkage.byReason.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No losses recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {shrinkage.byReason.map((r) => (
                        <div
                          key={r.reason}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-slate-700">{r.reason}</span>
                          <span className="tabular-nums text-slate-500">
                            {r.units} units · {money(r.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="zs-surface p-4">
                  <h2 className="mb-3 text-sm font-bold text-slate-900">
                    By variant
                  </h2>
                  {shrinkage.byVariant.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      No losses recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {shrinkage.byVariant.slice(0, 10).map((s) => (
                        <div
                          key={
                            s.variantId ?? `${s.productTitle}-${s.variantLabel}`
                          }
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="truncate text-slate-700">
                            {s.productTitle ?? "Unknown item"}
                            {s.variantLabel ? ` — ${s.variantLabel}` : ""}
                          </span>
                          <span className="shrink-0 tabular-nums text-slate-500">
                            {s.units} units · {money(s.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              <section className="zs-surface p-4">
                <h2 className="mb-3 text-sm font-bold text-slate-900">
                  Loss events
                </h2>
                {shrinkage.movements.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    No losses recorded yet.
                  </p>
                ) : (
                  <div className="zs-table-body">
                    {shrinkage.movements.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start justify-between gap-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">
                            {m.productTitle ?? m.sku ?? "Inventory item"}
                            {m.variantLabel ? ` — ${m.variantLabel}` : ""}
                          </p>
                          <p className="text-xs text-slate-400">
                            {m.reason} · {ageLabel(m.createdAt)} ago
                            {m.createdBy ? ` · by ${m.createdBy}` : ""}
                          </p>
                          {m.note && (
                            <p className="mt-0.5 whitespace-normal break-words text-xs italic text-slate-500">
                              "{m.note}"
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          {/* A short-shipped/lost inbound write-off never touches onHand (delta stays 0 by
                              design), but real units and real money are still involved — show the actual
                              quantity and "never arrived" instead of a misleading 0. */}
                          <p className="font-bold tabular-nums text-rose-600">
                            {m.delta !== 0
                              ? m.delta
                              : `${m.quantity} unit${m.quantity === 1 ? "" : "s"}`}
                          </p>
                          {m.delta === 0 && (
                            <p className="text-[10px] text-slate-400">
                              never arrived
                            </p>
                          )}
                          {m.valueDelta != null && (
                            <p className="text-[11px] font-semibold text-rose-500">
                              {money(Math.abs(m.valueDelta))}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      ) : view === "ledger" ? (
        <div className="px-4 py-4 lg:px-8 lg:py-6">
          <div className="space-y-4">
            <section className="zs-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Search by SKU or product"
                  className="h-9 w-56 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-400"
                />
                <FilterPicker
                  icon={SlidersHorizontal}
                  value={ledgerReason}
                  onChange={setLedgerReason}
                  placeholder="All reasons"
                  options={[
                    { value: "", label: "All reasons" },
                    ...ledgerReasons.map((r) => ({ value: r, label: r })),
                  ]}
                />
                <FilterPicker
                  icon={Warehouse}
                  value={ledgerWarehouseId}
                  onChange={setLedgerWarehouseId}
                  placeholder="All warehouses"
                  options={[
                    { value: "", label: "All warehouses" },
                    ...warehouses.map((w) => ({ value: w.id, label: w.name })),
                  ]}
                />
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={ledgerDateFrom}
                    onChange={(e) => setLedgerDateFrom(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                  />
                  <span className="text-xs text-slate-400">to</span>
                  <input
                    type="date"
                    value={ledgerDateTo}
                    onChange={(e) => setLedgerDateTo(e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-indigo-400"
                  />
                </div>
                {(ledgerSearch ||
                  ledgerReason ||
                  ledgerWarehouseId ||
                  ledgerDateFrom ||
                  ledgerDateTo) && (
                  <button
                    onClick={() => {
                      setLedgerSearch("");
                      setLedgerReason("");
                      setLedgerWarehouseId("");
                      setLedgerDateFrom("");
                      setLedgerDateTo("");
                    }}
                    className="h-9 rounded-lg px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </section>

            <section className="zs-surface p-4">
              {ledgerLoading && ledgerMovements.length === 0 ? (
                <div className="zs-loading-state">
                  Loading movement ledger...
                </div>
              ) : ledgerMovements.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No movements match this filter.
                </p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="zs-table-head">
                          <th className="px-2 py-2 text-left font-semibold">
                            Date
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Reason
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Product
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Qty
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Unit cost
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Value
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Warehouse
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Note
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            By
                          </th>
                        </tr>
                      </thead>
                      <tbody className="zs-table-body">
                        {ledgerMovements.map((m) => (
                          <tr key={m.id} className="zs-data-row">
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                              {new Date(m.createdAt).toLocaleDateString()}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {m.reason}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-slate-700">
                              {m.productTitle ?? "—"}
                              {m.variantLabel ? ` · ${m.variantLabel}` : ""}
                              {m.sku ? (
                                <span className="text-slate-400">
                                  {" "}
                                  ({m.sku})
                                </span>
                              ) : null}
                            </td>
                            <td
                              className={clsx(
                                "px-2 py-2 text-right tabular-nums font-semibold",
                                m.delta > 0
                                  ? "text-emerald-600"
                                  : m.delta < 0
                                    ? "text-rose-600"
                                    : "text-slate-500",
                              )}
                            >
                              {m.delta !== 0
                                ? `${m.delta > 0 ? "+" : ""}${m.delta}`
                                : `${m.quantity} unit${m.quantity === 1 ? "" : "s"}`}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                              {m.unitCost != null ? money(m.unitCost) : "—"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums font-semibold text-slate-800">
                              {m.valueDelta != null ? money(m.valueDelta) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                              {m.warehouseName ?? "—"}
                            </td>
                            <td
                              className="max-w-[160px] truncate px-2 py-2 text-slate-400"
                              title={m.note ?? undefined}
                            >
                              {m.note ?? "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-slate-400">
                              {m.createdBy ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 lg:hidden">
                    {ledgerMovements.map((m) => (
                      <div key={m.id} className="zs-surface p-3 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-700">
                              {m.productTitle ?? "—"}
                              {m.variantLabel ? ` · ${m.variantLabel}` : ""}
                            </p>
                            {m.sku && <p className="text-slate-400">{m.sku}</p>}
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                            {m.reason}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                          <span className="text-slate-400">
                            {new Date(m.createdAt).toLocaleDateString()} · {m.warehouseName ?? "—"}
                          </span>
                          <span
                            className={clsx(
                              "shrink-0 tabular-nums font-semibold",
                              m.delta > 0
                                ? "text-emerald-600"
                                : m.delta < 0
                                  ? "text-rose-600"
                                  : "text-slate-500",
                            )}
                          >
                            {m.delta !== 0
                              ? `${m.delta > 0 ? "+" : ""}${m.delta}`
                              : `${m.quantity} unit${m.quantity === 1 ? "" : "s"}`}
                          </span>
                        </div>
                        {(m.note || m.valueDelta != null) && (
                          <div className="mt-1.5 flex items-center justify-between gap-2 text-slate-400">
                            {m.note && <span className="truncate">{m.note}</span>}
                            {m.valueDelta != null && (
                              <span className="shrink-0 font-medium text-slate-600">{money(m.valueDelta)}</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {ledgerTotal} movement{ledgerTotal === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          void loadLedger(Math.max(1, ledgerPage - 1))
                        }
                        disabled={ledgerPage <= 1}
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowLeft size={14} />
                      </button>
                      <span>
                        Page {ledgerPage} of{" "}
                        {Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() =>
                          void loadLedger(
                            Math.min(
                              Math.max(
                                1,
                                Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE),
                              ),
                              ledgerPage + 1,
                            ),
                          )
                        }
                        disabled={
                          ledgerPage >=
                          Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE))
                        }
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      ) : loading ? (
        <div className="zs-loading-state">Loading inventory...</div>
      ) : !hasAnyInventory ? (
        <div className="zs-empty-state">
          <Warehouse size={30} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">
            No SKUs tracked yet
          </p>
          <p className="max-w-sm text-sm text-slate-400">
            Log your first opening count to start tracking real stock, per SKU.
          </p>
          {canWriteInventory && (
            <button
              onClick={() => setCountModalOpen(true)}
              className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              New count
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="px-4 py-4 lg:px-8">
            <div className="zs-summary-strip">
              <MetricCard
                icon={PackageCheck}
                label="On hand"
                value={summary.onHand.toLocaleString()}
                detail="units across tracked SKUs"
                tone="emerald"
              />
              <MetricCard
                icon={Truck}
                label="Incoming stock"
                value={summary.inbound.toLocaleString()}
                detail="purchase and transfer queue"
                tone="indigo"
              />
              <MetricCard
                icon={ShieldCheck}
                label="Stock value"
                value={money(summary.value)}
                detail="SKUs with a recorded unit cost"
              />
              <MetricCard
                icon={TrendingDown}
                label="Low Stock"
                value={reorderCount.toLocaleString()}
                detail="at or below the low stock alert"
                tone={reorderCount > 0 ? "amber" : "emerald"}
              />
            </div>
          </div>

          <div className="zs-toolbox">
            <div className="zs-toolbox-row">
              <div className="zs-toolbox-left">
                <div className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                  {focusOptions.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => setFocus(option.key)}
                      className={clsx(
                        "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors",
                        focus === option.key
                          ? "bg-white text-slate-900 shadow-sm shadow-slate-900/5"
                          : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {option.label}
                      <span className="tabular-nums text-slate-400">
                        {option.count}
                      </span>
                    </button>
                  ))}
                </div>
                <Popover
                  align="left"
                  widthClass="w-56"
                  trigger={() => (
                    <div className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                      <span className="text-slate-400">Warehouse:</span>
                      {warehouseFilter === "all"
                        ? "All warehouses"
                        : (warehouses.find((w) => w.id === warehouseFilter)
                            ?.name ?? "All warehouses")}
                      <ChevronDown size={11} className="text-slate-400" />
                    </div>
                  )}
                >
                  {(close) => (
                    <div className="py-1.5">
                      <button
                        onClick={() => {
                          setWarehouseFilter("all");
                          close();
                        }}
                        className={clsx(
                          "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                          warehouseFilter === "all"
                            ? "font-semibold text-indigo-600"
                            : "text-slate-700",
                        )}
                      >
                        All warehouses
                      </button>
                      {warehouses.map((warehouse) => (
                        <button
                          key={warehouse.id}
                          onClick={() => {
                            setWarehouseFilter(warehouse.id);
                            close();
                          }}
                          className={clsx(
                            "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                            warehouseFilter === warehouse.id
                              ? "font-semibold text-indigo-600"
                              : "text-slate-700",
                          )}
                        >
                          {warehouse.name}
                        </button>
                      ))}
                    </div>
                  )}
                </Popover>
                {binFilterOptions.length > 0 && (
                  <Popover
                    align="left"
                    widthClass="w-48"
                    trigger={() => (
                      <div className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                        <span className="text-slate-400">Shelf/bin:</span>
                        {binFilter === "all" ? "All shelves/bins" : binFilter}
                        <ChevronDown size={11} className="text-slate-400" />
                      </div>
                    )}
                  >
                    {(close) => (
                      <div className="py-1.5">
                        <button
                          onClick={() => {
                            setBinFilter("all");
                            close();
                          }}
                          className={clsx(
                            "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                            binFilter === "all"
                              ? "font-semibold text-indigo-600"
                              : "text-slate-700",
                          )}
                        >
                          All shelves/bins
                        </button>
                        {binFilterOptions.map((bin) => (
                          <button
                            key={bin}
                            onClick={() => {
                              setBinFilter(bin);
                              close();
                            }}
                            className={clsx(
                              "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                              binFilter === bin
                                ? "font-semibold text-indigo-600"
                                : "text-slate-700",
                            )}
                          >
                            {bin}
                          </button>
                        ))}
                      </div>
                    )}
                  </Popover>
                )}
                <Popover
                  align="left"
                  widthClass="w-56"
                  trigger={() => (
                    <div className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                      <span className="text-slate-400">Sort by:</span>
                      {SORT_LABELS[sortMode]}
                      <ChevronDown size={11} className="text-slate-400" />
                    </div>
                  )}
                >
                  {(close) => (
                    <div className="py-1.5">
                      {(Object.keys(SORT_LABELS) as SortMode[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => {
                            setSortMode(key);
                            close();
                          }}
                          className={clsx(
                            "flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50",
                            sortMode === key
                              ? "font-semibold text-indigo-600"
                              : "text-slate-700",
                          )}
                        >
                          {SORT_LABELS[key]}
                        </button>
                      ))}
                    </div>
                  )}
                </Popover>
              </div>
              <div className="zs-toolbox-right">
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

          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col">
              <div className="hidden min-w-0 lg:block">
                <table className="w-full min-w-0 table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[27%]" />
                    <col className="w-[14%]" />
                    <col className="w-[24%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                    <col className="w-[9%]" />
                  </colgroup>
                  <thead>
                    <tr className="zs-table-head">
                      <th className="py-3.5 pl-4 pr-3 xl:pl-6 xl:pr-5">
                        Item
                      </th>
                      <th className="px-3 py-3.5 xl:px-5">Location</th>
                      <th className="px-3 py-3.5 xl:px-5">Availability</th>
                      <th className="px-3 py-3.5 text-center xl:px-5">
                        Low Stock Alert
                      </th>
                      <th className="px-3 py-3.5 xl:px-5">Status</th>
                      <th className="py-3.5 pl-2 pr-4 text-right xl:pl-3 xl:pr-6">
                        Value
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageLevels.map((level) => {
                      const status = levelStatus(level);
                      const value =
                        level.unitCost != null
                          ? level.onHand * level.unitCost
                          : null;
                      return (
                        <tr
                          key={level.id}
                          className="zs-data-row border-b border-slate-100"
                        >
                          <td className="py-4 pl-4 pr-3 xl:pl-6 xl:pr-5">
                            <div className="flex min-w-0 items-center gap-3 xl:gap-4">
                              {level.productImage ? (
                                <img
                                  src={level.productImage}
                                  alt={level.productTitle ?? ""}
                                  className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover xl:h-14 xl:w-14"
                                />
                              ) : (
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300 xl:h-14 xl:w-14">
                                  <Package size={18} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate font-semibold text-slate-800">
                                    {level.productTitle ?? "Unlinked product"}
                                  </p>
                                  {level.variantId &&
                                    multiLocationVariantIds.has(
                                      level.variantId,
                                    ) && (
                                      <span
                                        title="Stocked at more than one location — cycle counts here can't auto-correct for in-transit stock, since the system can't tell which location it belongs to."
                                        className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 ring-1 ring-inset ring-violet-600/20"
                                      >
                                        Multi-location
                                      </span>
                                    )}
                                </div>
                                <p className="truncate text-xs text-slate-400">
                                  {level.variantLabel
                                    ? `${level.variantLabel} · `
                                    : ""}
                                  {level.sku ? `SKU ${level.sku}` : "No SKU"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-4 xl:px-5">
                            <div className="flex flex-col">
                              <span className="truncate font-medium text-slate-700">
                                {level.warehouseName}
                              </span>
                              {warehousesWithRealBins.has(
                                level.warehouseId,
                              ) && (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                                  <MapPin size={11} /> {level.bin}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4 xl:px-5">
                            <div className="grid grid-cols-3 gap-x-2 gap-y-1 text-xs xl:gap-x-4">
                              <div>
                                <p className="font-semibold tabular-nums text-slate-900">
                                  {level.onHand}
                                </p>
                                <p className="text-slate-400">on hand</p>
                              </div>
                              <ReservedCell level={level} />
                              <IncomingCell
                                level={level}
                                onReceived={applyLevelUpdate}
                                canReceive={canWriteInventory}
                                overdueDays={
                                  overdueDaysByLevelKey.get(levelKey(level)) ??
                                  null
                                }
                                shipments={
                                  openShipmentsByLevelKey.get(
                                    levelKey(level),
                                  ) ?? []
                                }
                              />
                            </div>
                          </td>
                          <td className="px-2 py-4 text-center xl:px-5">
                            <ReorderPointCell
                              level={level}
                              unitsPerDay={
                                level.variantId
                                  ? velocityByVariantId[level.variantId]
                                  : undefined
                              }
                              onSaved={applyLevelUpdate}
                              canEdit={canWriteInventory}
                            />
                          </td>
                          <td className="px-3 py-4 xl:px-5">
                            {status === "out" ? (
                              <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                                Out of stock
                              </span>
                            ) : status === "reorder" ? (
                              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                Low Stock
                              </span>
                            ) : status === "ok" ? (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                                In stock
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-500/15">
                                No alert set
                              </span>
                            )}
                          </td>
                          <td className="py-4 pl-2 pr-4 text-right font-semibold tabular-nums text-slate-800 xl:pl-3 xl:pr-6">
                            {value != null ? money(value) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-2.5 p-3 lg:hidden">
                {pageLevels.map((level) => {
                  const status = levelStatus(level);
                  const value =
                    level.unitCost != null ? level.onHand * level.unitCost : null;
                  return (
                    <div key={level.id} className="zs-surface p-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        {level.productImage ? (
                          <img
                            src={level.productImage}
                            alt={level.productTitle ?? ""}
                            className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                            <Package size={16} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-800">
                            {level.productTitle ?? "Unlinked product"}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {level.variantLabel ? `${level.variantLabel} · ` : ""}
                            {level.sku ? `SKU ${level.sku}` : "No SKU"}
                          </p>
                        </div>
                        {status === "out" ? (
                          <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">
                            Out of stock
                          </span>
                        ) : status === "reorder" ? (
                          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            Low Stock
                          </span>
                        ) : status === "ok" ? (
                          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            In stock
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">{level.warehouseName}</p>
                          {warehousesWithRealBins.has(level.warehouseId) && (
                            <span className="mt-0.5 flex items-center gap-1 text-slate-400">
                              <MapPin size={11} /> {level.bin}
                            </span>
                          )}
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums text-slate-800">
                          {value != null ? money(value) : "—"}
                        </p>
                      </div>

                      <div className="mt-2.5 grid grid-cols-3 gap-x-2 gap-y-1 text-xs">
                        <div>
                          <p className="font-semibold tabular-nums text-slate-900">{level.onHand}</p>
                          <p className="text-slate-400">on hand</p>
                        </div>
                        <ReservedCell level={level} />
                        <IncomingCell
                          level={level}
                          onReceived={applyLevelUpdate}
                          canReceive={canWriteInventory}
                          overdueDays={overdueDaysByLevelKey.get(levelKey(level)) ?? null}
                          shipments={openShipmentsByLevelKey.get(levelKey(level)) ?? []}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {levelsTotal === 0 && (
                <div className="py-16 text-center text-sm text-slate-400">
                  No inventory items match this view.
                </div>
              )}

              {levelsTotal > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5">
                  <span className="text-xs text-slate-400">
                    Showing{" "}
                    <span className="font-medium text-slate-600">
                      {(currentPage - 1) * PAGE_SIZE + 1}
                    </span>
                    -
                    <span className="font-medium text-slate-600">
                      {Math.min(levelsTotal, currentPage * PAGE_SIZE)}
                    </span>{" "}
                    of{" "}
                    <span className="font-medium text-slate-600">
                      {levelsTotal.toLocaleString()}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        void loadStockLevel(Math.max(1, currentPage - 1))
                      }
                      disabled={currentPage <= 1 || levelsLoading}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeft size={12} /> Prev
                    </button>
                    <span className="min-w-[76px] text-center text-xs text-slate-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() =>
                        void loadStockLevel(
                          Math.min(totalPages, currentPage + 1),
                        )
                      }
                      disabled={currentPage >= totalPages || levelsLoading}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <aside className="border-t border-slate-200 bg-slate-50 p-4 2xl:border-l 2xl:border-t-0">
              <div className="space-y-4">
                <section className="zs-surface p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">
                      Stock History
                    </h2>
                    <button
                      onClick={() => setView("ledger")}
                      className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      See all <ArrowRight size={12} />
                    </button>
                  </div>
                  <div className="mt-3 zs-table-body">
                    {movementRows.length === 0 && (
                      <div className="py-3 text-sm text-slate-400">
                        No inventory movements yet.
                      </div>
                    )}
                    {movementRows.map((movement) => (
                      <div
                        key={movement.id}
                        className="flex items-start justify-between gap-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {movement.reason}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {movement.productTitle ?? movement.sku}
                          </p>
                          <p className="text-xs text-slate-400">
                            {ageLabel(movement.createdAt)} ago
                            {movement.createdBy
                              ? ` · by ${movement.createdBy}`
                              : ""}
                          </p>
                          {movement.note && (
                            <p className="mt-0.5 whitespace-normal break-words text-xs italic text-slate-500">
                              "{movement.note}"
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={clsx(
                              "flex items-center justify-end gap-1 text-xs font-bold tabular-nums",
                              movement.delta >= 0
                                ? "text-emerald-600"
                                : "text-rose-600",
                            )}
                          >
                            {movement.delta >= 0 ? (
                              <ArrowUpRight size={12} />
                            ) : (
                              <ArrowDownRight size={12} />
                            )}
                            {movement.delta > 0 ? "+" : ""}
                            {movement.delta}
                          </span>
                          {movement.valueDelta != null &&
                            movement.valueDelta !== 0 && (
                              <p
                                className={clsx(
                                  "text-[11px] font-semibold",
                                  movement.valueDelta > 0
                                    ? "text-emerald-500"
                                    : "text-rose-500",
                                )}
                              >
                                {movement.valueDelta > 0 ? "+" : "-"}
                                {money(Math.abs(movement.valueDelta))}
                              </p>
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </aside>
          </div>
        </>
      )}
      {canWriteInventory && (
        <>
          <NewCountModal
            open={countModalOpen}
            warehouses={warehouses}
            suppliers={suppliers}
            onClose={() => setCountModalOpen(false)}
            onSaved={() => {
              void load();
              refreshShrinkageIfLoaded();
            }}
            onManageWarehouses={() => navigate("/inventory/warehouses")}
          />
          <NewInboundModal
            open={inboundModalOpen}
            suppliers={suppliers}
            warehouses={warehouses}
            onClose={() => {
              setInboundModalOpen(false);
              setInboundPrefill(null);
            }}
            onSaved={() => {
              void load();
              refreshShortfallsIfLoaded();
            }}
            onManageWarehouses={() => navigate("/inventory/warehouses")}
            initialSku={inboundPrefill?.sku ?? null}
            initialQuantity={inboundPrefill?.quantity}
            initialWarehouseId={inboundPrefill?.warehouseId}
          />
          <BulkInboundModal
            open={bulkInboundModalOpen}
            items={shortfalls
              .filter(
                (row) =>
                  selectedShortfallKeys.has(shortfallRowKey(row)) &&
                  row.productId &&
                  row.variantId,
              )
              .map((row) => {
                const suggestion = shortfallSuggestion(row);
                return {
                  key: shortfallRowKey(row),
                  sku: {
                    productId: row.productId!,
                    variantId: row.variantId!,
                    sku: row.sku,
                    productTitle: row.productTitle ?? row.sku,
                    productImage: row.productImage,
                    variantLabel: row.variantLabel ?? "",
                  },
                  quantity: suggestion.quantity,
                  warehouseId: suggestion.warehouseId,
                };
              })}
            suppliers={suppliers}
            warehouses={warehouses}
            onClose={() => setBulkInboundModalOpen(false)}
            onSaved={() => {
              void load();
              refreshShortfallsIfLoaded();
              setSelectedShortfallKeys(new Set());
            }}
            onManageWarehouses={() => navigate("/inventory/warehouses")}
          />
          <TransferStockModal
            open={transferModalOpen}
            warehouses={warehouses}
            onClose={() => setTransferModalOpen(false)}
            onSaved={() => {
              void load();
            }}
            onManageWarehouses={() => navigate("/inventory/warehouses")}
          />
        </>
      )}
    </div>
  );
}
