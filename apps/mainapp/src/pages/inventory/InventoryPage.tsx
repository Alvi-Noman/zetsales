import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
} from 'lucide-react';
import clsx from 'clsx';
import {
  addWarehouseBin,
  confirmReturnPackageQc,
  createInventoryInbound,
  createSupplier,
  createWarehouse,
  deleteWarehouse,
  getCountContext,
  getInventorySettings,
  getLevelReservations,
  getOverdueShipments,
  getReturnsQueue,
  getShrinkageReport,
  listMovements,
  listBins,
  listInventory,
  listInventorySkuOptions,
  listSuppliers,
  listWarehouses,
  processManualReturn,
  receiveAndConfirmReturnPackage,
  receiveInboundStock,
  receiveReturnPackage,
  removeWarehouseBin,
  renameWarehouse,
  searchDeliveredOrders,
  setInventoryCount,
  setInventoryReorderPoint,
  transferStock,
  updateInventorySettings,
  writeOffInboundStock,
  type CountContextDTO,
  type InboundWriteOffReason,
  type InventoryInboundPayload,
  type InventoryCountPayload,
  type InventoryLevelDTO,
  type InventoryMovementDTO,
  type InventorySkuOptionDTO,
  type ManualReturnSearchResultDTO,
  type OverdueShipmentDTO,
  type QcResult,
  type ReservationDTO,
  type ReturnsPackageActionPayload,
  type ReturnsPackageDTO,
  type ReturnsWorkflow,
  type ShrinkageReportDTO,
  type SupplierDTO,
  type WarehouseDTO,
} from '../../lib/commerceApi';
import { Modal } from '../../components/ui/Modal';
import { Popover } from '../../components/ui/Popover';
import { useToast } from '../../components/ui/ToastProvider';
import { useClickOutside } from '../../hooks/useClickOutside';

const DEFAULT_LEAD_TIME_DAYS = 7;

type FocusMode = 'all' | 'inbound' | 'overdue' | 'reorder' | 'reserved' | 'dead';
type SortMode = 'onHand' | 'title';
type PageView = 'stock' | 'returns' | 'shrinkage' | 'ledger';

const SORT_LABELS: Record<SortMode, string> = {
  onHand: 'On hand (highest first)',
  title: 'Alphabetical',
};

const PAGE_SIZE = 50;

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function ageLabel(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// A package sitting in the returns queue for a long time is a real, common failure mode (forgotten
// in QC Pending for weeks) — this just didn't have any way to stand out from one that arrived an
// hour ago. Held packages are excluded: they're already flagged as needing attention for a
// different reason (paused on purpose), so also calling them "aging" would just be noise.
const RETURNS_AGING_DAYS = 3;
function isAgingPackage(pkg: { waitingSince: string; isHeld: boolean }) {
  return !pkg.isHeld && Date.now() - new Date(pkg.waitingSince).getTime() > RETURNS_AGING_DAYS * 24 * 60 * 60 * 1000;
}

// Suggested reorder point from real sales velocity (units/day, computed live from order history
// server-side) times a lead-time buffer — a starting point the merchant can accept or override.
// A flat default lead time is used since levels aren't yet linked to a specific supplier's lead
// time; wiring that through is a reasonable future refinement, not required for this to be useful.
function suggestedReorderPoint(unitsPerDay: number | undefined): number | null {
  if (!unitsPerDay || unitsPerDay <= 0) return null;
  return Math.ceil(unitsPerDay * DEFAULT_LEAD_TIME_DAYS);
}

function levelStatus(level: InventoryLevelDTO): 'out' | 'reorder' | 'ok' | 'unset' {
  const available = level.onHand - level.reserved;
  if (available <= 0) return 'out';
  if (level.reorderPoint == null) return 'unset';
  return available <= level.reorderPoint ? 'reorder' : 'ok';
}

// Capital sitting on a shelf with no buyers — stock you have, but haven't sold, not stock you
// don't have. Matches the same trailing 30-day window sales velocity is already computed over
// (see computeVelocityByVariantId server-side), so "0 units/day" and "dead stock" mean the same
// 30 days consistently. Requires the level itself to be at least that old too — a variant counted
// in only yesterday hasn't had a fair chance to sell yet, and shouldn't be flagged as dead on day one.
const DEAD_STOCK_WINDOW_DAYS = 30;

function isDeadStock(level: InventoryLevelDTO, unitsPerDay: number | undefined): boolean {
  if (level.onHand <= 0) return false;
  const ageDays = (Date.now() - new Date(level.createdAt).getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays < DEAD_STOCK_WINDOW_DAYS) return false;
  return !unitsPerDay || unitsPerDay <= 0;
}

// "Unassigned" is the silent placeholder used before any real shelf/bin exists — it gets created
// automatically the first time a business saves a count or shipment, with no field ever shown for
// it. Its mere existence shouldn't be what flips the Shelf/Bin picker on everywhere afterward; that
// should only happen once a business has deliberately named a real shelf (via Manage warehouses, or
// by actually typing one into that field once it's visible). Otherwise "Unassigned" would quietly
// turn into forced bin-tracking complexity for a business that never asked for it.
function hasRealBins(bins: string[]): boolean {
  return bins.some((bin) => bin !== 'Unassigned');
}

// Whether a transfer between two distinct locations is even possible — either two separate
// warehouses, or a single warehouse split across more than one shelf/bin (predefined on the
// warehouse itself, or just historically typed into a count). A transfer is a move between two
// locations, not specifically between two warehouses, so this is what should actually gate the
// feature rather than warehouse count alone.
function canTransferBetweenLocations(warehouses: WarehouseDTO[], levels: InventoryLevelDTO[]): boolean {
  if (warehouses.length >= 2) return true;
  return warehouses.some((warehouse) => {
    const bins = new Set([...warehouse.bins, ...levels.filter((level) => level.warehouseId === warehouse.id).map((level) => level.bin)]);
    return bins.size > 1;
  });
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'slate',
}: {
  icon: typeof Package;
  label: string;
  value: string;
  detail: string;
  tone?: 'slate' | 'emerald' | 'amber' | 'indigo' | 'rose';
}) {
  const toneClass = {
    slate: 'bg-slate-100 text-slate-500',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    rose: 'bg-rose-50 text-rose-600',
  }[tone];

  return (
    <div className="min-w-[180px] flex-1 border-r border-slate-200 px-4 py-3 last:border-r-0">
      <div className="flex items-center gap-2">
        <span className={clsx('flex h-7 w-7 items-center justify-center rounded-lg', toneClass)}>
          <Icon size={15} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-xl font-bold tabular-nums text-slate-900">{value}</span>
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
function SkuPicker({ value, onChange }: { value: InventorySkuOptionDTO | null; onChange: (option: InventorySkuOptionDTO) => void }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<InventorySkuOptionDTO[]>([]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void listInventorySkuOptions(query).then((res) => setOptions(res.options));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold text-slate-600">Product / variant</label>
      <Popover
        align="left"
        matchTriggerWidth
        trigger={() => (
          <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
            <Search size={14} className="shrink-0 text-slate-400" />
            {value ? (
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-slate-800">{value.productTitle}</span>
                <span className="text-slate-400"> — {value.variantLabel} ({value.sku ?? 'no SKU'})</span>
              </span>
            ) : (
              <span className="flex-1 truncate text-slate-400">Search product title or SKU...</span>
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
                <div className="px-2.5 py-2 text-sm text-slate-400">No matching variants found.</div>
              ) : (
                options.map((option) => {
                  const isSelected = value?.variantId === option.variantId;
                  return (
                    <button
                      key={option.variantId}
                      type="button"
                      onClick={() => {
                        onChange(option);
                        setQuery('');
                        close();
                      }}
                      className={clsx(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                        isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                      )}
                    >
                      {option.productImage ? (
                        <img src={option.productImage} alt="" className="h-8 w-8 shrink-0 rounded-md border border-slate-200 object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-300">
                          <Package size={14} />
                        </div>
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium text-slate-800">{option.productTitle}</span>
                        <span className="text-slate-400"> — {option.variantLabel} ({option.sku ?? 'no SKU'})</span>
                      </span>
                      {isSelected && <Check size={13} className="shrink-0 text-indigo-600" />}
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

const COUNT_REASON_OPTIONS: { value: InventoryCountPayload['reason']; description: string; guide: string; icon: typeof PackageCheck }[] = [
  {
    value: 'Opening balance',
    description: 'Starting stock — done once',
    guide: 'Use this the very first time you add a product to the system — before you\'ve sold anything, just tell us how many you actually have right now.',
    icon: PackageCheck,
  },
  {
    value: 'Cycle count',
    description: 'Occasional shelf recount',
    guide:
      'Use this when you walk up to a shelf, count what\'s really there, and want to check it against the system. It automatically ignores stock that\'s out for delivery or on its way back from a return, so you won\'t be blamed for stock that\'s simply on the road.',
    icon: ClipboardCheck,
  },
  {
    value: 'Damaged stock',
    description: 'Broke in the warehouse',
    guide: 'Use this when something breaks or gets ruined while just sitting in your warehouse — not something a customer sent back broken, plain warehouse damage.',
    icon: AlertTriangle,
  },
  {
    value: 'Lost',
    description: 'Went missing, no idea why',
    guide: 'Use this when stock simply disappears and you don\'t know why — could be theft, could be misplaced somewhere and never turned up.',
    icon: TrendingDown,
  },
  {
    value: 'Found stock',
    description: 'Missing stock turned up',
    guide: 'Use this when stock you thought was lost or damaged turns up again — like finding it in the wrong corner of the warehouse. It cancels out some of that old loss on the Loss Report.',
    icon: PackagePlus,
  },
  {
    value: 'Manual adjustment',
    description: 'Anything else',
    guide:
      'Use this for a stock change that doesn\'t fit any other reason — like giving away free samples, using a unit for a photoshoot, or throwing out old stock that isn\'t damaged, just no longer wanted.',
    icon: SlidersHorizontal,
  },
  {
    value: 'Wrong entry',
    description: 'Fixing a typo',
    guide: 'Use this to fix a typo or mistake from an earlier entry — like if you accidentally typed the wrong number before. This is just a correction, not a real loss.',
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
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
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
    <div ref={wrapperRef} className="relative shrink-0" onMouseEnter={show} onMouseLeave={hide}>
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
            style={{ top: coords.top, left: coords.left, width: INFO_TOOLTIP_WIDTH }}
            className="fixed z-[100] -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-[11px] leading-relaxed text-slate-600 shadow-lg shadow-slate-900/10"
          >
            {text}
          </div>,
          document.body
        )}
    </div>
  );
}

// Same "modern card" popover style as QcReasonPicker, just collapsed to one line by default so it
// reads as a dropdown — the card treatment only needs to show once it's actually open.
function CountReasonPicker({ value, onChange }: { value: InventoryCountPayload['reason']; onChange: (reason: InventoryCountPayload['reason']) => void }) {
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
                className={clsx('flex items-center gap-1 rounded-lg pr-1.5 transition-colors', selected ? 'bg-indigo-50' : 'hover:bg-slate-50')}
              >
                <button
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2.5 px-2.5 py-2 text-left"
                >
                  <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400')}>
                    <option.icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block text-xs font-semibold', selected ? 'text-indigo-700' : 'text-slate-700')}>{option.value}</span>
                    <span className="block text-[11px] text-slate-400">{option.description}</span>
                  </span>
                  {selected && <Check size={13} className="mt-0.5 shrink-0 text-indigo-600" />}
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
function FilterPicker({
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
          <span className="flex-1 truncate">{selected?.label ?? placeholder}</span>
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
                key={o.value || '__all__'}
                onClick={() => {
                  onChange(o.value);
                  close();
                }}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors',
                  isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                )}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {isSelected && <Check size={13} className="shrink-0 text-indigo-600" />}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

function WarehousePicker({
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
            'flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 hover:bg-slate-50',
            compact ? 'h-8 px-2 text-xs' : 'h-10 w-full px-3 text-sm'
          )}
        >
          <Warehouse size={compact ? 12 : 14} className="shrink-0 text-slate-400" />
          <span className={clsx('truncate', compact ? 'max-w-[110px]' : 'flex-1')}>{selected?.name ?? placeholder ?? 'Select warehouse'}</span>
          <ChevronDown size={compact ? 12 : 14} className="shrink-0 text-slate-400" />
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
                className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50')}
              >
                <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400')}>
                  <Warehouse size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{w.name}</span>
                {isSelected && <Check size={13} className="shrink-0 text-indigo-600" />}
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
function BinPicker({
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
            'flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white text-slate-800 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/15',
            compact ? 'h-8 w-36 px-2 text-xs' : 'h-10 w-full px-3 text-sm'
          )}
        >
          <MapPin size={compact ? 12 : 14} className="shrink-0 text-slate-400" />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? 'Select or type a bin'}
            className={clsx('h-full min-w-0 flex-1 bg-transparent text-slate-800 outline-none placeholder-slate-400', compact ? 'text-xs' : 'text-sm')}
          />
          <ChevronDown size={compact ? 12 : 14} className="shrink-0 text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="max-h-56 overflow-y-auto p-1.5">
          {options.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-slate-400">No bins here yet — keep typing to use a new one.</p>
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
                  className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50')}
                >
                  <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400')}>
                    <MapPin size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{b}</span>
                  {isSelected && <Check size={13} className="shrink-0 text-indigo-600" />}
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
function SupplierPicker({ suppliers, value, onChange }: { suppliers: SupplierDTO[]; value: string; onChange: (id: string) => void }) {
  const selected = suppliers.find((s) => s.id === value);
  const label = value === '__new' ? 'Create new supplier' : (selected?.name ?? 'No supplier selected');
  return (
    <Popover
      align="left"
      matchTriggerWidth
      trigger={() => (
        <div className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
          <Building2 size={14} className="shrink-0 text-slate-400" />
          <span className={clsx('flex-1 truncate', !selected && value !== '__new' && 'text-slate-400')}>{label}</span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="max-h-72 overflow-y-auto p-1.5">
          <button
            onClick={() => {
              onChange('');
              close();
            }}
            className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', value === '' ? 'bg-indigo-50' : 'hover:bg-slate-50')}
          >
            <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', value === '' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400')}>
              <Building2 size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">No supplier selected</span>
            {value === '' && <Check size={13} className="shrink-0 text-indigo-600" />}
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
                className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50')}
              >
                <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400')}>
                  <Building2 size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{supplier.name}</span>
                {isSelected && <Check size={13} className="shrink-0 text-indigo-600" />}
              </button>
            );
          })}
          <div className="my-1 border-t border-slate-100" />
          <button
            onClick={() => {
              onChange('__new');
              close();
            }}
            className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', value === '__new' ? 'bg-indigo-50' : 'hover:bg-slate-50')}
          >
            <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', value === '__new' ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-indigo-500')}>
              <Plus size={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-xs font-semibold text-indigo-600">Create new supplier</span>
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
function isAbsoluteReason(reason: InventoryCountPayload['reason']): boolean {
  return reason === 'Opening balance' || reason === 'Cycle count' || reason === 'Wrong entry';
}

// Sensible default direction per reason — always changeable, since e.g. a "Manual adjustment"
// could go either way.
function defaultDirectionFor(reason: InventoryCountPayload['reason']): 'add' | 'subtract' {
  return reason === 'Damaged stock' || reason === 'Lost' ? 'subtract' : 'add';
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
        <p className="text-sm font-semibold text-slate-800">Add a warehouse first</p>
        <p className="max-w-xs text-xs text-slate-500">
          {message ?? "You haven't set up any warehouses yet. Add your first real location to start tracking stock."}
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
      ? parsedUnitPrice + ((Number(shippingCost) || 0) + (Number(dutiesCost) || 0)) / quantity
      : null;

  return (
    <div className="col-span-2 grid grid-cols-3 gap-3">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Unit price (৳, optional)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={unitPrice}
          onChange={(e) => setUnitPrice(e.target.value)}
          placeholder={currentUnitCost != null ? undefined : 'No cost on file yet'}
          className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Shipping (৳, total)</label>
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
        <label className="mb-1.5 block text-xs font-semibold text-slate-600">Duties (৳, total)</label>
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
          ? `Landed cost per unit ≈ ৳${landedCostPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })} (shipping + duties spread across ${quantity} unit${quantity === 1 ? '' : 's'}).`
          : currentUnitCost != null
            ? `Currently ৳${currentUnitCost.toLocaleString()} on file — leave blank to keep it, or enter a unit price to update it.`
            : 'Shipping and duties are optional, but split evenly across the units in this batch when given.'}
      </p>
    </div>
  );
}

function NewCountModal({
  open,
  levels,
  warehouses,
  suppliers,
  onClose,
  onSaved,
  onManageWarehouses,
  initialSku,
  initialQuantity,
}: {
  open: boolean;
  levels: InventoryLevelDTO[];
  warehouses: WarehouseDTO[];
  suppliers: SupplierDTO[];
  onClose: () => void;
  onSaved: () => void;
  onManageWarehouses: () => void;
  initialSku?: InventorySkuOptionDTO | null;
  initialQuantity?: number;
}) {
  const toast = useToast();
  const [reason, setReason] = useState<InventoryCountPayload['reason']>('Opening balance');
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
      setReason('Found stock');
      justOpenedViaShortcutRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialSku]);
  const [warehouseId, setWarehouseId] = useState('');
  useEffect(() => {
    if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);
  // "Unassigned" — the industry-standard name for stock that's physically arrived but hasn't been
  // put away to a real shelf yet. Opening balance and a brand-new SKU are both "stock exists, exact
  // shelf not decided yet" moments, so that's the sensible default rather than making someone commit
  // to a real location before it's actually there. Anything else (Cycle count, Damaged stock, etc.)
  // is about stock that's already sitting somewhere real, so it starts blank instead — see the
  // reason-change effect below.
  const [bin, setBin] = useState('Unassigned');
  const [quantity, setQuantity] = useState('');
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [unitPrice, setUnitPrice] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [dutiesCost, setDutiesCost] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [note, setNote] = useState('');
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
      setReason('Opening balance');
      setSku(null);
      setBin('Unassigned');
      setQuantity('');
      setUnitPrice('');
      setShippingCost('');
      setDutiesCost('');
      setSupplierId('');
      setNewSupplierName('');
      setNote('');
    }
  }, [open]);

  useEffect(() => {
    setDirection(defaultDirectionFor(reason));
    if (reason === 'Found stock' && justOpenedViaShortcutRef.current) {
      justOpenedViaShortcutRef.current = false;
      setQuantity(initialQuantity != null && initialQuantity > 0 ? String(initialQuantity) : '');
    } else {
      setQuantity('');
    }
    // Cycle count is the one reason that needs a deliberate, real shelf choice — you're physically
    // counting a specific location, so a silent "Unassigned" default would make the count meaningless.
    // Forced blank only when the Shelf/Bin field is actually visible to fill back in; this warehouse
    // not using bins yet means that field stays hidden, so an empty value would be an unfixable dead
    // end blocking Save entirely. Every other reason defaults to "Unassigned," same as Opening balance.
    setBin(reason === 'Cycle count' ? (usesBins ? '' : 'Unassigned') : 'Unassigned');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  const matchedLevel = sku ? levels.find((l) => l.productId === sku.productId && l.variantId === sku.variantId) : null;
  const currentOnHand = matchedLevel?.onHand ?? 0;
  const absoluteMode = isAbsoluteReason(reason);

  // Cost has nowhere else to go if someone never uses the separate "Incoming Stock" flow — this
  // is often the only screen a SKU's cost ever gets entered on, so it needs to live here too, not
  // just on the inbound path. Pre-fills from whatever's already on file so a routine recount doesn't
  // force you to re-type a cost that hasn't changed; shipping/duties are left blank since they
  // aren't part of the recorded weighted average.
  useEffect(() => {
    setUnitPrice(matchedLevel?.unitCost != null ? String(matchedLevel.unitCost) : '');
    setShippingCost('');
    setDutiesCost('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  // For a cycle count, comparing a real physical count against raw onHand is wrong whenever any of
  // this SKU is out for delivery, mid-RTO, or awaiting QC — onHand deliberately still counts that
  // stock until it's confirmed delivered, so a physical count would honestly come up short for
  // reasons that have nothing to do with loss. This fetches the corrected number to compare against
  // instead, debounced since `bin` is free text and changes on every keystroke.
  const [countContext, setCountContext] = useState<CountContextDTO | null>(null);
  useEffect(() => {
    setCountContext(null);
    if (reason !== 'Cycle count' || !sku || !bin.trim()) return;
    const handle = setTimeout(() => {
      void getCountContext(sku.productId, sku.variantId, warehouseId, bin.trim()).then(setCountContext).catch(() => setCountContext(null));
    }, 300);
    return () => clearTimeout(handle);
  }, [reason, sku, warehouseId, bin]);

  const expectedForCycleCount = countContext?.expectedPhysicalCount ?? currentOnHand;

  // The actual new absolute total sent to the API — computed here so the backend never has to know
  // about "delta mode," it just keeps setting onHand to a number like it always has.
  const resolvedQuantity = (() => {
    const entered = Number(quantity);
    if (!quantity.trim() || Number.isNaN(entered)) return null;
    if (absoluteMode) return entered;
    return Math.max(0, currentOnHand + (direction === 'add' ? entered : -entered));
  })();

  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? warehouses[0];
  const canSave =
    sku &&
    resolvedQuantity != null &&
    resolvedQuantity >= 0 &&
    bin.trim().length > 0 &&
    !!selectedWarehouse &&
    (reason !== 'Opening balance' || supplierId !== '__new' || newSupplierName.trim().length > 0) &&
    !saving;

  // Counting doesn't know about incoming shipments — it just overwrites on-hand to whatever
  // number you type. If this SKU already has pending incoming stock, a count that happens to
  // include those newly-arrived units would leave "incoming" stuck showing stock as still on the
  // way, permanently out of sync with reality. Surface it instead of letting that drift silently.
  const pendingIncoming = matchedLevel && matchedLevel.inbound > 0 ? matchedLevel : null;

  // Damage, loss, or a found-stock surprise turning up during a return's inspection belongs in the
  // Returns to process QC step (or the manual return search, for orders that never went through a
  // courier) — both update the actual order, not just the raw stock number. These reasons are for
  // events with no order behind them at all: warehouse damage, breakage during putaway, theft,
  // misplaced stock later turning up — nothing to redirect to.
  //
  // Excludes 'Found stock' when it was opened via the "+ Log as found stock" shortcut (initialSku
  // set) — that shortcut IS the Returns to process flow this hint would otherwise redirect to, so
  // showing it there would tell someone to go do the thing they just did to get here.
  const showsUntrackedReturnHint = reason === 'Damaged stock' || reason === 'Lost' || (reason === 'Found stock' && !initialSku);

  const save = async () => {
    if (!canSave || !sku || !selectedWarehouse || resolvedQuantity == null) return;
    setSaving(true);
    try {
      let selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
      if (reason === 'Opening balance' && supplierId === '__new') {
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
        unitPrice: (reason === 'Opening balance' || reason === 'Found stock') && unitPrice.trim() ? Number(unitPrice) : undefined,
        shippingCost: (reason === 'Opening balance' || reason === 'Found stock') && shippingCost.trim() ? Number(shippingCost) : undefined,
        dutiesCost: (reason === 'Opening balance' || reason === 'Found stock') && dutiesCost.trim() ? Number(dutiesCost) : undefined,
        supplierId: reason === 'Opening balance' ? selectedSupplier?.id : undefined,
        supplierName: reason === 'Opening balance' ? selectedSupplier?.name : undefined,
        note: note.trim() || undefined,
      });
      toast.push('Inventory count saved.', 'success');
      setSupplierId('');
      setNewSupplierName('');
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || 'Could not save inventory count.', 'info');
    } finally {
      setSaving(false);
    }
  };

  if (open && warehouses.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="New inventory count" subtitle="Set ZetSales-owned stock for a specific SKU and location." widthClass="max-w-2xl">
        <WarehouseRequiredNotice onManageWarehouses={onManageWarehouses} onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="New inventory count" subtitle="Set ZetSales-owned stock for a specific SKU and location." widthClass="max-w-2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Reason</label>
            <CountReasonPicker value={reason} onChange={setReason} />
          </div>
          {showsUntrackedReturnHint && (
            <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              If this was found while inspecting a return, use <strong>Returns to process</strong> instead — either the QC step, or its
              "Return a delivered order" search for orders that never went through a courier. Use this reason only for something with no
              order behind it at all — warehouse damage, breakage during putaway, theft, misplaced stock, or previously-lost stock
              turning up on its own.
            </div>
          )}
          <div className="col-span-2">
            <SkuPicker value={sku} onChange={setSku} />
          </div>
          {pendingIncoming && (
            <div className="col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
              This item has <strong>{pendingIncoming.inbound} unit{pendingIncoming.inbound === 1 ? '' : 's'}</strong> marked as incoming. If this
              count already includes newly-arrived stock, use <strong>Mark received</strong> on the incoming number in the main table instead — a
              plain count here won't clear the incoming number, so it'll keep showing that stock as still on the way even after you've counted it in.
            </div>
          )}
          <div className={usesBins ? undefined : 'col-span-2'}>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Warehouse</label>
            <WarehousePicker warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} />
          </div>
          {usesBins && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Shelf/Bin</label>
              <BinPicker value={bin} onChange={setBin} options={binOptions} placeholder="A-1-01" />
            </div>
          )}
          <div className={reason === 'Opening balance' ? undefined : 'col-span-2'}>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              {absoluteMode ? (reason === 'Cycle count' ? 'Quantity counted' : 'Quantity on hand') : 'How many units'}
            </label>
            {reason === 'Cycle count' && matchedLevel && (
              <p className="mb-1.5 text-[11px] text-slate-400">
                {countContext && (countContext.physicallyAbsentQuantity > 0 || countContext.awaitingQcHereQuantity > 0 || countContext.isMultiLocation) ? (
                  <>
                    Just enter what you physically count — <strong>{countContext.expectedPhysicalCount}</strong> is expected here ({currentOnHand} on
                    hand{countContext.physicallyAbsentQuantity > 0 && `, ${countContext.physicallyAbsentQuantity} out for delivery or mid-return`}
                    {countContext.awaitingQcHereQuantity > 0 && `, including ${countContext.awaitingQcHereQuantity} already sitting here awaiting QC`}).
                    The out-for-delivery/mid-return units are added back automatically — they won't be logged as lost.
                    {countContext.isMultiLocation && (
                      <span className="text-amber-600">
                        {' '}This item is stocked at more than one location — in-transit units are matched to whichever location currently
                        holds the most stock, so this is a best-effort estimate here, not exact.
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
                  {(['add', 'subtract'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDirection(d)}
                      className={clsx(
                        'rounded-md px-3 text-sm font-semibold capitalize transition-colors',
                        direction === d ? 'bg-white text-slate-900 shadow-sm shadow-slate-900/5' : 'text-slate-500 hover:text-slate-700'
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
            {reason === 'Cycle count' && matchedLevel && quantity.trim() !== '' && resolvedQuantity != null && (
              <p className={clsx('mt-1 text-[11px]', resolvedQuantity === expectedForCycleCount ? 'text-slate-400' : resolvedQuantity < expectedForCycleCount ? 'text-rose-600' : 'text-emerald-600')}>
                {resolvedQuantity === expectedForCycleCount
                  ? 'No variance — matches what was expected.'
                  : `Variance: ${resolvedQuantity > expectedForCycleCount ? '+' : ''}${resolvedQuantity - expectedForCycleCount} (will be logged as a ${resolvedQuantity < expectedForCycleCount ? 'loss' : 'gain'}).`}
              </p>
            )}
            {!absoluteMode && quantity.trim() !== '' && resolvedQuantity != null && (
              <p className="mt-1 text-[11px] text-slate-400">
                New total will be {resolvedQuantity} (currently {currentOnHand}).
              </p>
            )}
          </div>
          {(reason === 'Opening balance' || reason === 'Found stock') && (
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
          {reason === 'Opening balance' && (
            <>
              <div className="col-span-2">
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Supplier (optional)</label>
                <SupplierPicker suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
              </div>
              {supplierId === '__new' && (
                <div className="col-span-2">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-600">New supplier name</label>
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
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional audit note"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-2.5 text-xs text-indigo-700">
          This count updates ZetSales inventory only. Shopify/WooCommerce stock is ignored and will not be changed.
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Saving...' : 'Save count'}
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
}: {
  open: boolean;
  suppliers: SupplierDTO[];
  warehouses: WarehouseDTO[];
  onClose: () => void;
  onSaved: () => void;
  onManageWarehouses: () => void;
}) {
  const toast = useToast();
  const [sku, setSku] = useState<InventorySkuOptionDTO | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  useEffect(() => {
    if (!warehouseId && warehouses[0]) setWarehouseId(warehouses[0].id);
  }, [warehouses, warehouseId]);
  // Incoming stock is by definition not on a shelf yet — "Unassigned" (the industry-standard name
  // for received-but-not-put-away stock) is always the right default here, no reason toggle needed
  // like the count modal.
  const [bin, setBin] = useState('Unassigned');
  const [quantity, setQuantity] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [dutiesCost, setDutiesCost] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [expectedAt, setExpectedAt] = useState('');
  const [note, setNote] = useState('');
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
      setBin('Unassigned');
      setQuantity('');
      setUnitPrice('');
      setShippingCost('');
      setDutiesCost('');
      setNote('');
    }
  }, [open]);

  const selectedWarehouse = warehouses.find((warehouse) => warehouse.id === warehouseId) ?? warehouses[0];
  const canSave =
    sku &&
    quantity.trim() !== '' &&
    Number(quantity) > 0 &&
    bin.trim().length > 0 &&
    (supplierId !== '__new' || newSupplierName.trim().length > 0) &&
    !!selectedWarehouse &&
    !saving;

  const save = async () => {
    if (!canSave || !sku || !selectedWarehouse) return;
    setSaving(true);
    try {
      let selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId) ?? null;
      if (supplierId === '__new') {
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
      toast.push('Incoming stock created.', 'success');
      setSupplierId('');
      setNewSupplierName('');
      setExpectedAt('');
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || 'Could not create incoming stock.', 'info');
    } finally {
      setSaving(false);
    }
  };

  if (open && warehouses.length === 0) {
    return (
      <Modal open={open} onClose={onClose} title="Incoming Stock" subtitle="Record stock that is on the way but not available yet." widthClass="max-w-2xl">
        <WarehouseRequiredNotice onManageWarehouses={onManageWarehouses} onClose={onClose} />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Incoming Stock" subtitle="Record stock that is on the way but not available yet." widthClass="max-w-2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <SkuPicker value={sku} onChange={setSku} />
          </div>
          <div className={usesBins ? undefined : 'col-span-2'}>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Warehouse</label>
            <WarehousePicker warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} />
          </div>
          {usesBins && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">Shelf/Bin</label>
              <BinPicker value={bin} onChange={setBin} options={binOptions} />
            </div>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Incoming quantity</label>
            <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
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
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Expected arrival</label>
            <input type="date" value={expectedAt} onChange={(e) => setExpectedAt(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
          </div>
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Supplier</label>
            <SupplierPicker suppliers={suppliers} value={supplierId} onChange={setSupplierId} />
          </div>
          {supplierId === '__new' && (
            <div className="col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-slate-600">New supplier name</label>
              <input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="e.g. ABC Garments" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
            </div>
          )}
          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional receiving note" className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15" />
          </div>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-700">
          Incoming stock is not sellable yet. It becomes on-hand stock later when you receive it.
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={save} disabled={!canSave} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">
            {saving ? 'Saving...' : 'Create shipment'}
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
  levels,
  warehouses,
  onClose,
  onSaved,
  onManageWarehouses,
}: {
  open: boolean;
  levels: InventoryLevelDTO[];
  warehouses: WarehouseDTO[];
  onClose: () => void;
  onSaved: () => void;
  onManageWarehouses: () => void;
}) {
  const toast = useToast();
  const [sku, setSku] = useState<InventorySkuOptionDTO | null>(null);
  const [fromWarehouseId, setFromWarehouseId] = useState('');
  const [fromBin, setFromBin] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [toBin, setToBin] = useState('');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!toWarehouseId && warehouses[0]) setToWarehouseId(warehouses[0].id);
  }, [warehouses, toWarehouseId]);

  // Where this SKU actually IS right now — a transfer can only ever move real stock, so "From"
  // shouldn't be a free pick the way "To" is (a destination can reasonably be a brand-new bin
  // nobody's used yet; a source can't be, or there'd be nothing there to move). Locations with zero
  // on hand are excluded outright: picking one would just be picking a place to fail from.
  const stockLocations = useMemo(
    () =>
      sku
        ? levels.filter((l) => l.productId === sku.productId && l.variantId === sku.variantId && l.onHand > 0).sort((a, b) => b.onHand - a.onHand)
        : [],
    [sku, levels]
  );

  // Same "Unassigned doesn't count as a real shelf" rule as the main table — a warehouse that's
  // never had a real bin named shouldn't show "— Unassigned" tacked onto every location here either.
  const warehousesWithRealBins = useMemo(() => {
    const set = new Set<string>();
    for (const warehouse of warehouses) {
      if (hasRealBins(warehouse.bins)) set.add(warehouse.id);
    }
    for (const level of levels) {
      if (level.bin !== 'Unassigned') set.add(level.warehouseId);
    }
    return set;
  }, [warehouses, levels]);
  const locationLabel = (loc: InventoryLevelDTO) => (warehousesWithRealBins.has(loc.warehouseId) ? `${loc.warehouseName} — ${loc.bin}` : loc.warehouseName);

  // Single real location — lock straight to it, no dropdown, nothing to pick wrong. More than one —
  // default to the biggest and let the location picker below choose between the actual candidates
  // only (never every warehouse/bin in the system, most of which don't even have this SKU).
  useEffect(() => {
    if (stockLocations.length === 0) {
      setFromWarehouseId('');
      setFromBin('');
      return;
    }
    const stillValid = stockLocations.some((l) => l.warehouseId === fromWarehouseId && l.bin === fromBin);
    if (!stillValid) {
      setFromWarehouseId(stockLocations[0].warehouseId);
      setFromBin(stockLocations[0].bin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockLocations]);

  const currentFromLocation = stockLocations.find((l) => l.warehouseId === fromWarehouseId && l.bin === fromBin) ?? null;

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
      setToBin('');
      setQuantity('');
      setNote('');
    }
  }, [open]);

  const toWarehouse = warehouses.find((w) => w.id === toWarehouseId) ?? warehouses[0];
  const sameLocation = !!currentFromLocation && currentFromLocation.warehouseId === toWarehouseId && currentFromLocation.bin === toBin.trim();

  const canSave =
    sku &&
    !!currentFromLocation &&
    !sameLocation &&
    quantity.trim() !== '' &&
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
      toast.push('Stock transferred.', 'success');
      onSaved();
      onClose();
    } catch (err) {
      toast.push((err as Error).message || 'Could not transfer this stock.', 'info');
    } finally {
      setSaving(false);
    }
  };

  if (open && !canTransferBetweenLocations(warehouses, levels)) {
    return (
      <Modal open={open} onClose={onClose} title="Transfer stock" subtitle="Move stock between two of your own locations in one step." widthClass="max-w-2xl">
        <WarehouseRequiredNotice
          onManageWarehouses={onManageWarehouses}
          onClose={onClose}
          message={
            warehouses.length === 0
              ? undefined
              : 'You need at least two warehouses, or one warehouse split across more than one shelf/bin, to transfer stock between locations.'
          }
        />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Transfer stock" subtitle="Move stock between two of your own locations in one step." widthClass="max-w-2xl">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <SkuPicker value={sku} onChange={setSku} />
          </div>

          <div className="col-span-2 rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">From</p>
            {!sku ? (
              <p className="text-sm text-slate-400">Pick a product to see where it's currently stocked.</p>
            ) : stockLocations.length === 0 ? (
              <p className="text-sm text-rose-600">No stock on file for this item anywhere yet — nothing to transfer.</p>
            ) : stockLocations.length === 1 ? (
              <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                <MapPin size={14} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{locationLabel(stockLocations[0])}</span>
                <span className="shrink-0 text-xs text-slate-400">{stockLocations[0].onHand} units</span>
              </div>
            ) : (
              <Popover
                align="left"
                matchTriggerWidth
                trigger={() => (
                  <div className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
                    <MapPin size={14} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">{currentFromLocation ? locationLabel(currentFromLocation) : 'Select a location'}</span>
                    <span className="shrink-0 text-xs text-slate-400">{currentFromLocation?.onHand ?? 0} units</span>
                    <ChevronDown size={14} className="shrink-0 text-slate-400" />
                  </div>
                )}
              >
                {(close) => (
                  <div className="max-h-56 overflow-y-auto p-1.5">
                    {stockLocations.map((loc) => {
                      const isSelected = loc.warehouseId === fromWarehouseId && loc.bin === fromBin;
                      return (
                        <button
                          key={`${loc.warehouseId}::${loc.bin}`}
                          onClick={() => {
                            setFromWarehouseId(loc.warehouseId);
                            setFromBin(loc.bin);
                            close();
                          }}
                          className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50')}
                        >
                          <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', isSelected ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400')}>
                            <MapPin size={14} />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{locationLabel(loc)}</span>
                          <span className="shrink-0 text-[11px] text-slate-400">{loc.onHand} units</span>
                          {isSelected && <Check size={13} className="shrink-0 text-indigo-600" />}
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
            <div className={usesToBins ? 'grid grid-cols-2 gap-3' : undefined}>
              <WarehousePicker warehouses={warehouses} value={toWarehouseId} onChange={setToWarehouseId} />
              {usesToBins && <BinPicker value={toBin} onChange={setToBin} options={toBinOptions} placeholder="Shelf/bin" />}
            </div>
          </div>
          {sameLocation && (
            <div className="col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
              Source and destination are the same location — pick a different warehouse or bin to transfer to.
            </div>
          )}

          <div className="col-span-2">
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Quantity to transfer</label>
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
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">Note</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional audit note"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={() => void save()}
            disabled={!canSave}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? 'Transferring...' : 'Transfer stock'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Click-to-edit reorder point cell. Shows a "Suggested: N" hint (from real sales velocity) only
// while no manual value has been set — once you set one, your number wins and the hint goes away.
function ReorderPointCell({ level, unitsPerDay, onSaved }: { level: InventoryLevelDTO; unitsPerDay: number | undefined; onSaved: (level: InventoryLevelDTO) => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(level.reorderPoint != null ? String(level.reorderPoint) : '');
  const [saving, setSaving] = useState(false);
  const suggested = suggestedReorderPoint(unitsPerDay);

  const save = async () => {
    setSaving(true);
    try {
      const parsed = value.trim() === '' ? null : Number(value);
      const res = await setInventoryReorderPoint(level.id, parsed);
      onSaved(res.level);
      setEditing(false);
    } catch (err) {
      toast.push((err as Error).message || 'Could not save low stock alert.', 'info');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void save()}
          onBlur={() => void save()}
          className="h-7 w-16 rounded-md border border-indigo-300 px-2 text-sm outline-none"
        />
        {saving && <span className="text-xs text-slate-400">Saving…</span>}
      </div>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="group flex items-center gap-1.5 text-left">
      <span className="font-medium tabular-nums text-slate-700">{level.reorderPoint ?? '—'}</span>
      <Pencil size={11} className="text-slate-300 opacity-0 group-hover:opacity-100" />
      {level.reorderPoint == null && suggested != null && <span className="text-xs text-indigo-500">Suggested: {suggested}</span>}
    </button>
  );
}

// Reserved stock is opaque without this — the reason a unit is locked up lives in the orders
// system, not here. Lazy-loads the drill-down only when opened, since most rows are never clicked.
function ReservedCell({ level }: { level: InventoryLevelDTO }) {
  const [orders, setOrders] = useState<ReservationDTO[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (level.reserved <= 0) {
    return (
      <div>
        <p className="font-semibold tabular-nums text-slate-400">0</p>
        <p className="text-slate-400">reserved</p>
      </div>
    );
  }

  const load = () => {
    if (orders || loading) return;
    setLoading(true);
    getLevelReservations(level.id)
      .then((res) => setOrders(res.orders))
      .finally(() => setLoading(false));
  };

  return (
    <Popover
      align="left"
      widthClass="w-72"
      trigger={() => (
        <button type="button" onClick={load} className="text-left hover:opacity-70">
          <p className="font-semibold tabular-nums text-indigo-700 underline decoration-dotted underline-offset-2">{level.reserved}</p>
          <p className="text-slate-400">reserved</p>
        </button>
      )}
    >
      {() => (
        <div className="max-h-72 overflow-y-auto p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">Held for these orders</p>
          {loading ? (
            <p className="py-3 text-center text-sm text-slate-400">Loading...</p>
          ) : !orders || orders.length === 0 ? (
            <p className="py-3 text-center text-sm text-slate-400">No matching orders found.</p>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <div key={o.orderId} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-xs">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-700">{o.orderNumber}</p>
                    <p className="truncate text-slate-400">{o.customerName ?? 'Unknown customer'} · {o.stage}</p>
                  </div>
                  <span className="shrink-0 font-bold tabular-nums text-indigo-700">{o.quantity}</span>
                </div>
              ))}
            </div>
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
function IncomingCell({
  level,
  onReceived,
  overdueDays,
}: {
  level: InventoryLevelDTO;
  onReceived: (level: InventoryLevelDTO) => void;
  overdueDays: number | null;
}) {
  const toast = useToast();
  const [quantity, setQuantity] = useState(String(level.inbound));
  const [saving, setSaving] = useState(false);
  const [writingOff, setWritingOff] = useState(false);
  // A remainder isn't automatically a loss — it could just as easily still be on the way (nothing
  // to do here at all), or a typo in the original shipment entry (a correction, not a real loss).
  // Only "not coming at all" actually needs a loss reason, so that's revealed as its own step rather
  // than dumping all the options in one row and implying they're all equally "a write-off."
  const [remainderStage, setRemainderStage] = useState<'choice' | 'writeOffReasons'>('choice');

  if (level.inbound <= 0) {
    return (
      <div>
        <p className="font-semibold tabular-nums text-slate-400">0</p>
        <p className="text-slate-400">incoming</p>
      </div>
    );
  }

  const submit = async (close: () => void) => {
    const qty = Number(quantity);
    if (!qty || qty <= 0) return;
    setSaving(true);
    try {
      const res = await receiveInboundStock(level.id, qty);
      onReceived(res.level);
      toast.push(`${qty} unit${qty === 1 ? '' : 's'} received into on-hand stock.`, 'success');
      close();
    } catch (err) {
      toast.push((err as Error).message || 'Could not mark this as received.', 'info');
    } finally {
      setSaving(false);
    }
  };

  // Only makes sense once the typed number is actually less than the full incoming amount —
  // otherwise "the rest" is a lie, since nothing's been carved off yet. Shows the exact remaining
  // count rather than a vague "the rest," and handles both halves of the real event in one click:
  // whatever was typed goes to on-hand first, then whatever's left over gets written off — instead
  // of requiring two separate trips through this popover to record one actual delivery.
  const receivedQty = Math.max(0, Math.min(level.inbound, Number(quantity) || 0));
  const remainderQty = Math.max(0, level.inbound - receivedQty);

  const writeOff = async (reason: InboundWriteOffReason, close: () => void) => {
    setWritingOff(true);
    try {
      if (receivedQty > 0) {
        const receiveRes = await receiveInboundStock(level.id, receivedQty);
        onReceived(receiveRes.level);
      }
      const res = await writeOffInboundStock(level.id, reason);
      if (!res.success) {
        toast.push(res.message || 'Could not write this off.', 'info');
      } else {
        onReceived(res.level);
        const remainderPhrase = reason === 'Wrong entry' ? `${remainderQty} corrected — not counted as a loss` : `${remainderQty} written off as ${reason.toLowerCase()}`;
        toast.push(receivedQty > 0 ? `${receivedQty} received, ${remainderPhrase}.` : `${remainderPhrase[0].toUpperCase()}${remainderPhrase.slice(1)}.`, 'success');
        close();
      }
    } catch (err) {
      toast.push((err as Error).message || 'Could not write this off.', 'info');
    } finally {
      setWritingOff(false);
    }
  };

  return (
    <Popover
      align="left"
      widthClass="w-64"
      trigger={() => (
        <button
          type="button"
          onClick={() => {
            setQuantity(String(level.inbound));
            setRemainderStage('choice');
          }}
          className="text-left hover:opacity-70"
        >
          <p className="font-semibold tabular-nums text-emerald-700 underline decoration-dotted underline-offset-2">{level.inbound}</p>
          <p className={overdueDays != null ? 'font-semibold text-rose-600' : 'text-slate-400'}>{overdueDays != null ? `${overdueDays}d overdue` : 'incoming'}</p>
        </button>
      )}
    >
      {(close) => (
        <div className="p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">Mark as received</p>
          {overdueDays != null && (
            <p className="mb-2 rounded-md bg-rose-50 px-2 py-1.5 text-[11px] font-medium text-rose-700">
              This shipment was expected {overdueDays} day{overdueDays === 1 ? '' : 's'} ago — worth chasing up with the supplier.
            </p>
          )}
          <p className="mb-2 text-xs text-slate-400">How many of the {level.inbound} incoming units have actually arrived?</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max={level.inbound}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-8 w-20 rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => void submit(close)}
              disabled={saving}
              className="flex-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Saving...' : 'Mark received'}
            </button>
          </div>
          {remainderQty > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2.5">
              <p className="mb-1.5 text-[11px] text-slate-400">
                The other <strong className="text-slate-600">{remainderQty}</strong> unit{remainderQty === 1 ? '' : 's'} — what's the situation?
              </p>
              {remainderStage === 'choice' ? (
                <div className="space-y-1.5">
                  <button
                    onClick={() => (receivedQty > 0 ? void submit(close) : close())}
                    disabled={saving}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Still on the way
                    <span className="block font-normal text-slate-400">Receive the {receivedQty}, leave the rest incoming</span>
                  </button>
                  <button
                    onClick={() => void writeOff('Wrong entry', close)}
                    disabled={writingOff}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    My mistake, fix it
                    <span className="block font-normal text-slate-400">Wrong quantity entered — not a real loss</span>
                  </button>
                  <button
                    onClick={() => setRemainderStage('writeOffReasons')}
                    className="w-full rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-left text-[11px] font-semibold text-amber-700 hover:bg-amber-100"
                  >
                    Not coming — write it off
                    <span className="block font-normal text-amber-600/70">A real loss — counts on the Loss Report</span>
                  </button>
                </div>
              ) : (
                <div>
                  <button onClick={() => setRemainderStage('choice')} className="mb-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-600">
                    ← Back
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => void writeOff('Short-shipped by supplier', close)}
                      disabled={writingOff}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Supplier shorted it
                    </button>
                    <button
                      onClick={() => void writeOff('Lost in transit', close)}
                      disabled={writingOff}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Lost in transit
                    </button>
                    <button
                      onClick={() => void writeOff('Damaged on arrival', close)}
                      disabled={writingOff}
                      className="col-span-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Damaged on arrival
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}

// One row per SKU/variant awaiting a warehouse action — quantity-first by design, since inventory
// receives a stack of boxes off a courier van, not a specific order number. Submitting resolves
// against the oldest matching orders first; if the batch doesn't fully clear (not enough matching
// orders exist yet, or the last order it touched pushed slightly past the requested count), that's
// reported back rather than hidden.
// One card per physical package (a full order, or the returned slice of a Partial Delivered
// order) — a courier hands back one sealed parcel at a time, so that's the unit staff actually
// process, not an abstract quantity that secretly has to line up with hidden order boundaries.
// Checking a package off is unambiguous: there's no number to type, so there's nothing to get
// wrong or overshoot.
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
  onSubmit: (orderId: string, payload: ReturnsPackageActionPayload) => Promise<{ success: boolean; message?: string }>;
  onDone: () => void;
}) {
  const toast = useToast();
  // Defaults to wherever this order's stock actually shipped from — that's the same pickup point a
  // courier's RTO physically lands at, so it's a real prediction of where the box in front of you
  // is, not a guess. Falls back to the Returns Inspection warehouse, then whatever's first, for
  // orders placed before fulfillment warehouse tracking existed.
  const [warehouseId, setWarehouseId] = useState('');
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const fulfillment = pkg.fulfillmentWarehouseId && warehouses.some((w) => w.id === pkg.fulfillmentWarehouseId) ? pkg.fulfillmentWarehouseId : null;
      setWarehouseId(fulfillment ?? warehouses.find((w) => w.name === 'Returns Inspection')?.id ?? warehouses[0].id);
    }
  }, [warehouses, warehouseId, pkg.fulfillmentWarehouseId]);
  // A returned package hasn't been put away to a real shelf yet either — same "Unassigned" default
  // as Incoming Stock, not a hardcoded guess at a specific holding bin.
  const [bin, setBin] = useState('Unassigned');
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
      const warehouse = warehouses.find((w) => w.id === warehouseId) ?? warehouses[0];
      const res = await onSubmit(pkg.orderId, {
        isPartial: pkg.isPartial,
        location: showsLocation && warehouse ? { warehouseId: warehouse.id, warehouseName: warehouse.name, bin: bin.trim() } : undefined,
      });
      if (!res.success) {
        toast.push(res.message || 'Could not process this package.', 'info');
      } else {
        toast.push('Package moved forward.', 'success');
        onDone();
      }
    } catch (err) {
      toast.push((err as Error).message || 'Could not process this package.', 'info');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-100 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-800">{pkg.orderNumber}</p>
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
            {pkg.customerName ?? 'Unknown customer'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'} · waiting{' '}
            <span className={isAgingPackage(pkg) ? 'font-semibold text-rose-600' : undefined}>{ageLabel(pkg.waitingSince)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {pkg.isHeld ? (
            <p className="max-w-[220px] text-right text-[11px] text-orange-600">{pkg.holdReason || 'On hold'} — resume from Orders before processing.</p>
          ) : (
            <>
              {showsLocation && warehouses.length > 0 && (
                <>
                  <WarehousePicker warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} compact />
                  {usesBins && <BinPicker value={bin} onChange={setBin} options={binOptions} placeholder="Bin" compact />}
                </>
              )}
              <button
                onClick={() => void submit()}
                disabled={saving}
                title="Confirms the box is physically in your hands and sends it to QC for inspection."
                className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <PackageSearch size={13} /> Received <ArrowRight size={11} className="text-slate-400" /> Send to QC
              </button>
            </>
          )}
        </div>
      </div>
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
        {pkg.lineItems.map((li, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
            {li.image ? (
              <img src={li.image} alt="" className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover" />
            ) : (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                <Package size={10} />
              </div>
            )}
            <span className="truncate">
              {li.title}
              {li.variant ? ` — ${li.variant}` : ''}
            </span>
            <span className="ml-auto shrink-0 font-semibold text-slate-700">×{li.quantity}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact sibling of SkuPicker for one specific micro-decision: "what did they actually send
// instead?" No standalone label (it reads inline, right under the Wrong Product reason), smaller
// footprint, otherwise the same search-and-pick mechanics.
function ReceivedInsteadPicker({ value, onChange }: { value: InventorySkuOptionDTO | null; onChange: (option: InventorySkuOptionDTO) => void }) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<InventorySkuOptionDTO[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      void listInventorySkuOptions(query).then((res) => setOptions(res.options));
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
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
            <div className="px-3 py-2 text-xs text-slate-400">No matching variants found.</div>
          ) : (
            options.map((option) => (
              <button
                key={option.variantId}
                type="button"
                onClick={() => {
                  onChange(option);
                  setQuery('');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50"
              >
                {option.productImage ? (
                  <img src={option.productImage} alt="" className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                    <Package size={10} />
                  </div>
                )}
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-800">{option.productTitle}</span>
                  <span className="text-slate-400"> — {option.variantLabel}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const QC_BAD_REASONS: NonNullable<QcResult['badReason']>[] = ['Damaged stock', 'Lost in transit', 'Wrong Product'];

const QC_REASON_META: Record<NonNullable<QcResult['badReason']>, { icon: typeof AlertTriangle; description: string }> = {
  'Damaged stock': { icon: AlertTriangle, description: 'Arrived, but unsellable' },
  'Lost in transit': { icon: Truck, description: 'Never actually showed up' },
  'Wrong Product': { icon: RefreshCw, description: 'A different item came back than expected' },
};

// A native <select> hides the "why" behind a shortfall in a barely-readable dropdown — this shows
// each reason as its own row with an icon and a one-line explanation, so picking between "damaged"
// and "never arrived" is a glance, not a read.
function QcReasonPicker({ value, onChange }: { value: NonNullable<QcResult['badReason']>; onChange: (reason: NonNullable<QcResult['badReason']>) => void }) {
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
                className={clsx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', selected ? 'bg-amber-50' : 'hover:bg-slate-50')}
              >
                <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', selected ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400')}>
                  <m.icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={clsx('block text-xs font-semibold', selected ? 'text-amber-700' : 'text-slate-700')}>{reason}</span>
                  <span className="block text-[11px] text-slate-400">{m.description}</span>
                </span>
                {selected && <Check size={13} className="mt-1 shrink-0 text-amber-600" />}
              </button>
            );
          })}
        </div>
      )}
    </Popover>
  );
}

const RETURNS_WORKFLOW_META: Record<ReturnsWorkflow, { label: string; description: string }> = {
  combined: { label: 'One step (same team)', description: 'Receiving and QC happen together — match the order, check it, done in one action.' },
  separate: { label: 'Two steps (separate QC team)', description: 'Confirm physical receipt first; QC inspects and restocks separately, later.' },
};

// Whether receiving and QC are one click or two is a real per-business choice, not a fixed rule —
// most small/medium sellers have the same person do both in one pass, but a business with an
// actual separate QC department benefits from keeping the stages distinct. Exposed here, not
// buried in a settings page, since it's the one control that changes what the whole returns queue
// looks like.
function ReturnsWorkflowPicker({ value, onChange }: { value: ReturnsWorkflow; onChange: (mode: ReturnsWorkflow) => void }) {
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
          {(Object.keys(RETURNS_WORKFLOW_META) as ReturnsWorkflow[]).map((mode) => {
            const m = RETURNS_WORKFLOW_META[mode];
            const selected = mode === value;
            return (
              <button
                key={mode}
                onClick={() => {
                  onChange(mode);
                  close();
                }}
                className={clsx('flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors', selected ? 'bg-indigo-50' : 'hover:bg-slate-50')}
              >
                <span className="min-w-0 flex-1">
                  <span className={clsx('block text-xs font-semibold', selected ? 'text-indigo-700' : 'text-slate-700')}>{m.label}</span>
                  <span className="block text-[11px] text-slate-400">{m.description}</span>
                </span>
                {selected && <Check size={13} className="mt-1 shrink-0 text-indigo-600" />}
              </button>
            );
          })}
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
function QcPackageCard({ pkg, onDone, onLogFoundStock }: { pkg: ReturnsPackageDTO; onDone: () => void; onLogFoundStock: (option: InventorySkuOptionDTO, quantity: number) => void }) {
  const toast = useToast();
  const [good, setGood] = useState<Record<number, string>>(() => Object.fromEntries(pkg.lineItems.map((li, i) => [i, String(li.quantity)])));
  const [reasons, setReasons] = useState<Record<number, NonNullable<QcResult['badReason']>>>({});
  const [receivedInstead, setReceivedInstead] = useState<Record<number, InventorySkuOptionDTO>>({});
  const [saving, setSaving] = useState(false);
  const totalUnits = pkg.lineItems.reduce((sum, li) => sum + li.quantity, 0);
  const hasShortfall = pkg.lineItems.some((li, i) => Math.min(li.quantity, Math.max(0, Number(good[i]) || 0)) < li.quantity);

  const submit = async () => {
    setSaving(true);
    try {
      const results: QcResult[] = pkg.lineItems.map((li, i) => {
        const goodQuantity = Math.min(li.quantity, Math.max(0, Number(good[i]) || 0));
        const instead = receivedInstead[i];
        return {
          sku: li.sku,
          variant: li.variant,
          goodQuantity,
          badReason: goodQuantity < li.quantity ? reasons[i] ?? 'Damaged stock' : undefined,
          receivedInstead: instead ? { sku: instead.sku, variant: instead.variantLabel, title: instead.productTitle } : undefined,
        };
      });
      const res = await confirmReturnPackageQc(pkg.orderId, { isPartial: pkg.isPartial, results });
      if (!res.success) {
        toast.push(res.message || 'Could not process this package.', 'info');
      } else {
        toast.push(hasShortfall ? 'Restocked, with the shortfall logged as a loss.' : 'Package restocked.', 'success');
        onDone();
      }
    } catch (err) {
      toast.push((err as Error).message || 'Could not process this package.', 'info');
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
              <p className="truncate text-sm font-semibold text-slate-800">{pkg.orderNumber}</p>
              {pkg.isPartial && (
                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Partial return
                </span>
              )}
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-600/20">On hold</span>
            </div>
            <p className="truncate text-xs text-slate-400">
              {pkg.customerName ?? 'Unknown customer'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'} · waiting{' '}
            <span className={isAgingPackage(pkg) ? 'font-semibold text-rose-600' : undefined}>{ageLabel(pkg.waitingSince)}</span>
            </p>
          </div>
          <p className="max-w-[220px] shrink-0 text-right text-[11px] text-orange-600">{pkg.holdReason || 'On hold'} — resume from Orders before processing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-100 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-800">{pkg.orderNumber}</p>
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
            {pkg.customerName ?? 'Unknown customer'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'} · waiting{' '}
            <span className={isAgingPackage(pkg) ? 'font-semibold text-rose-600' : undefined}>{ageLabel(pkg.waitingSince)}</span>
          </p>
        </div>
        <button
          onClick={() => void submit()}
          disabled={saving}
          title={hasShortfall ? 'Restocks only the confirmed-good units and logs the rest as a loss.' : 'All units confirmed good — restocks the full quantity.'}
          className={clsx(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40',
            hasShortfall ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-900 hover:bg-slate-800'
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
          const goodQty = Math.min(li.quantity, Math.max(0, Number(good[i]) || 0));
          const badQty = li.quantity - goodQty;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {li.image ? (
                  <img src={li.image} alt="" className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                    <Package size={10} />
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {li.title}
                  {li.variant ? ` — ${li.variant}` : ''} · expected ×{li.quantity}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">Good</span>
                <input
                  type="number"
                  min="0"
                  max={li.quantity}
                  value={good[i] ?? ''}
                  onChange={(e) => setGood((prev) => ({ ...prev, [i]: e.target.value }))}
                  className="h-7 w-12 shrink-0 rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
                />
                {badQty > 0 && (
                  <>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-600">{badQty} ×</span>
                    <QcReasonPicker value={reasons[i] ?? 'Damaged stock'} onChange={(reason) => setReasons((prev) => ({ ...prev, [i]: reason }))} />
                  </>
                )}
              </div>
              {badQty > 0 && reasons[i] === 'Wrong Product' && (
                <div className="ml-8 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                  <p className="mb-1.5 text-right text-[11px] font-semibold text-indigo-700">What did they actually send back?</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <ReceivedInsteadPicker value={receivedInstead[i] ?? null} onChange={(option) => setReceivedInstead((prev) => ({ ...prev, [i]: option }))} />
                    </div>
                    {receivedInstead[i] && (
                      <button
                        type="button"
                        onClick={() => onLogFoundStock(receivedInstead[i], badQty)}
                        className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                      >
                        <Plus size={11} /> Log as found stock
                      </button>
                    )}
                  </div>
                  {!receivedInstead[i] && (
                    <p className="mt-1.5 text-right text-[10px] text-indigo-400">
                      Search by product name or SKU. Once picked, you can log it as found stock right here in one click.
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
  const [warehouseId, setWarehouseId] = useState('');
  useEffect(() => {
    if (!warehouseId && warehouses.length > 0) {
      const fulfillment = pkg.fulfillmentWarehouseId && warehouses.some((w) => w.id === pkg.fulfillmentWarehouseId) ? pkg.fulfillmentWarehouseId : null;
      setWarehouseId(fulfillment ?? warehouses.find((w) => w.name === 'Returns Inspection')?.id ?? warehouses[0].id);
    }
  }, [warehouses, warehouseId, pkg.fulfillmentWarehouseId]);
  // A returned package hasn't been put away to a real shelf yet either — same "Unassigned" default
  // as Incoming Stock, not a hardcoded guess at a specific holding bin.
  const [bin, setBin] = useState('Unassigned');
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

  const [good, setGood] = useState<Record<number, string>>(() => Object.fromEntries(pkg.lineItems.map((li, i) => [i, String(li.quantity)])));
  const [reasons, setReasons] = useState<Record<number, NonNullable<QcResult['badReason']>>>({});
  const [receivedInstead, setReceivedInstead] = useState<Record<number, InventorySkuOptionDTO>>({});
  const [saving, setSaving] = useState(false);
  const totalUnits = pkg.lineItems.reduce((sum, li) => sum + li.quantity, 0);
  const hasShortfall = pkg.lineItems.some((li, i) => Math.min(li.quantity, Math.max(0, Number(good[i]) || 0)) < li.quantity);

  const submit = async () => {
    setSaving(true);
    try {
      const warehouse = warehouses.find((w) => w.id === warehouseId);
      const results: QcResult[] = pkg.lineItems.map((li, i) => {
        const goodQuantity = Math.min(li.quantity, Math.max(0, Number(good[i]) || 0));
        const instead = receivedInstead[i];
        return {
          sku: li.sku,
          variant: li.variant,
          goodQuantity,
          badReason: goodQuantity < li.quantity ? reasons[i] ?? 'Damaged stock' : undefined,
          receivedInstead: instead ? { sku: instead.sku, variant: instead.variantLabel, title: instead.productTitle } : undefined,
        };
      });
      const res = await receiveAndConfirmReturnPackage(pkg.orderId, {
        isPartial: pkg.isPartial,
        location: warehouse ? { warehouseId: warehouse.id, warehouseName: warehouse.name, bin: bin.trim() } : undefined,
        results,
      });
      if (!res.success) {
        toast.push(res.message || 'Could not process this package.', 'info');
      } else {
        toast.push(hasShortfall ? 'Restocked, with the shortfall logged as a loss.' : 'Received and restocked.', 'success');
        onDone();
      }
    } catch (err) {
      toast.push((err as Error).message || 'Could not process this package.', 'info');
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
              <p className="truncate text-sm font-semibold text-slate-800">{pkg.orderNumber}</p>
              {pkg.isPartial && (
                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
                  Partial return
                </span>
              )}
              <span className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 ring-1 ring-inset ring-orange-600/20">On hold</span>
            </div>
            <p className="truncate text-xs text-slate-400">
              {pkg.customerName ?? 'Unknown customer'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'} · waiting{' '}
            <span className={isAgingPackage(pkg) ? 'font-semibold text-rose-600' : undefined}>{ageLabel(pkg.waitingSince)}</span>
            </p>
          </div>
          <p className="max-w-[220px] shrink-0 text-right text-[11px] text-orange-600">{pkg.holdReason || 'On hold'} — resume from Orders before processing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-100 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-800">{pkg.orderNumber}</p>
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
            {pkg.customerName ?? 'Unknown customer'} · {totalUnits} unit{totalUnits === 1 ? '' : 's'} · waiting{' '}
            <span className={isAgingPackage(pkg) ? 'font-semibold text-rose-600' : undefined}>{ageLabel(pkg.waitingSince)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {warehouses.length > 0 && (
            <>
              <WarehousePicker warehouses={warehouses} value={warehouseId} onChange={setWarehouseId} compact />
              {usesBins && <BinPicker value={bin} onChange={setBin} options={binOptions} placeholder="Bin" compact />}
            </>
          )}
          <button
            onClick={() => void submit()}
            disabled={saving}
            title={
              hasShortfall
                ? 'Restocks only the confirmed-good units and logs the rest as a loss.'
                : 'All units confirmed good — receives and restocks the full quantity.'
            }
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40',
              hasShortfall ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-900 hover:bg-slate-800'
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
          const goodQty = Math.min(li.quantity, Math.max(0, Number(good[i]) || 0));
          const badQty = li.quantity - goodQty;
          return (
            <div key={i} className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {li.image ? (
                  <img src={li.image} alt="" className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover" />
                ) : (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                    <Package size={10} />
                  </div>
                )}
                <span className="min-w-0 flex-1 truncate">
                  {li.title}
                  {li.variant ? ` — ${li.variant}` : ''} · expected ×{li.quantity}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">Good</span>
                <input
                  type="number"
                  min="0"
                  max={li.quantity}
                  value={good[i] ?? ''}
                  onChange={(e) => setGood((prev) => ({ ...prev, [i]: e.target.value }))}
                  className="h-7 w-12 shrink-0 rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
                />
                {badQty > 0 && (
                  <>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-600">{badQty} ×</span>
                    <QcReasonPicker value={reasons[i] ?? 'Damaged stock'} onChange={(reason) => setReasons((prev) => ({ ...prev, [i]: reason }))} />
                  </>
                )}
              </div>
              {badQty > 0 && reasons[i] === 'Wrong Product' && (
                <div className="ml-8 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                  <p className="mb-1.5 text-right text-[11px] font-semibold text-indigo-700">What did they actually send back?</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <ReceivedInsteadPicker value={receivedInstead[i] ?? null} onChange={(option) => setReceivedInstead((prev) => ({ ...prev, [i]: option }))} />
                    </div>
                    {receivedInstead[i] && (
                      <button
                        type="button"
                        onClick={() => onLogFoundStock(receivedInstead[i], badQty)}
                        className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                      >
                        <Plus size={11} /> Log as found stock
                      </button>
                    )}
                  </div>
                  {!receivedInstead[i] && (
                    <p className="mt-1.5 text-right text-[10px] text-indigo-400">
                      Search by product name or SKU. Once picked, you can log it as found stock right here in one click.
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
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ManualReturnSearchResultDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ManualReturnSearchResultDTO | null>(null);
  const [good, setGood] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, NonNullable<QcResult['badReason']>>>({});
  const [receivedInstead, setReceivedInstead] = useState<Record<number, InventorySkuOptionDTO>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
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
    setGood(Object.fromEntries(order.lineItems.map((li, i) => [i, String(li.quantity)])));
    setReasons({});
  };

  const hasShortfall = selected ? selected.lineItems.some((li, i) => Math.min(li.quantity, Math.max(0, Number(good[i]) || 0)) < li.quantity) : false;

  const submit = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const results: QcResult[] = selected.lineItems.map((li, i) => {
        const goodQuantity = Math.min(li.quantity, Math.max(0, Number(good[i]) || 0));
        const instead = receivedInstead[i];
        return {
          sku: li.sku,
          variant: li.variant,
          goodQuantity,
          badReason: goodQuantity < li.quantity ? reasons[i] ?? 'Damaged stock' : undefined,
          receivedInstead: instead ? { sku: instead.sku, variant: instead.variantLabel, title: instead.productTitle } : undefined,
        };
      });
      const res = await processManualReturn(selected.orderId, results);
      if (!res.success) {
        toast.push(res.message || 'Could not process this return.', 'info');
      } else {
        toast.push('Return processed.', 'success');
        onSaved();
        onClose();
      }
    } catch (err) {
      toast.push((err as Error).message || 'Could not process this return.', 'info');
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
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search order number or customer name..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-400"
            />
          </div>
          {searching && <p className="py-4 text-center text-sm text-slate-400">Searching...</p>}
          {!searching && query.trim() && results.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">No delivered order matches "{query.trim()}".</p>
          )}
          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {results.map((order) => (
              <button
                key={order.orderId}
                onClick={() => selectOrder(order)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-left hover:border-indigo-200 hover:bg-indigo-50/50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{order.orderNumber}</p>
                  <p className="truncate text-xs text-slate-400">{order.customerName ?? 'Unknown customer'} · delivered {ageLabel(order.deliveredAt)} ago</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-indigo-600">Select</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700">
            <ArrowLeft size={12} /> Back to search
          </button>
          <div>
            <p className="text-sm font-semibold text-slate-800">{selected.orderNumber}</p>
            <p className="text-xs text-slate-400">{selected.customerName ?? 'Unknown customer'}</p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-slate-100 p-3">
            {selected.lineItems.map((li, i) => {
              const goodQty = Math.min(li.quantity, Math.max(0, Number(good[i]) || 0));
              const badQty = li.quantity - goodQty;
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    {li.image ? (
                      <img src={li.image} alt="" className="h-6 w-6 shrink-0 rounded border border-slate-200 object-cover" />
                    ) : (
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-300">
                        <Package size={10} />
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {li.title}
                      {li.variant ? ` — ${li.variant}` : ''} · expected ×{li.quantity}
                    </span>
                    <span className="shrink-0 text-[11px] text-slate-400">Good</span>
                    <input
                      type="number"
                      min="0"
                      max={li.quantity}
                      value={good[i] ?? ''}
                      onChange={(e) => setGood((prev) => ({ ...prev, [i]: e.target.value }))}
                      className="h-7 w-12 shrink-0 rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
                    />
                    {badQty > 0 && (
                      <>
                        <span className="shrink-0 text-[11px] font-semibold text-amber-600">{badQty} ×</span>
                        <QcReasonPicker value={reasons[i] ?? 'Damaged stock'} onChange={(reason) => setReasons((prev) => ({ ...prev, [i]: reason }))} />
                      </>
                    )}
                  </div>
                  {badQty > 0 && reasons[i] === 'Wrong Product' && (
                    <div className="ml-8 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
                      <p className="mb-1.5 text-right text-[11px] font-semibold text-indigo-700">What did they actually send back?</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <ReceivedInsteadPicker value={receivedInstead[i] ?? null} onChange={(option) => setReceivedInstead((prev) => ({ ...prev, [i]: option }))} />
                        </div>
                        {receivedInstead[i] && (
                          <button
                            type="button"
                            onClick={() => onLogFoundStock(receivedInstead[i], badQty)}
                            className="flex h-8 shrink-0 items-center gap-1 rounded-md bg-indigo-600 px-2.5 text-[11px] font-semibold text-white hover:bg-indigo-700"
                          >
                            <Plus size={11} /> Log as found stock
                          </button>
                        )}
                      </div>
                      {!receivedInstead[i] && (
                        <p className="mt-1.5 text-right text-[10px] text-indigo-400">
                          Search by product name or SKU. Once picked, you can log it as found stock right here in one click.
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
              'flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40',
              hasShortfall ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-900 hover:bg-slate-800'
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

// Warehouses used to be a hardcoded list of three names that had nothing to do with any real
// business using this. Renaming, adding, or removing one here updates it everywhere else in
// Inventory. Bins are deliberately optional and de-emphasized (a small "+ Add bin" field, not a
// form) — most small businesses don't track shelf-level detail, and nothing here requires them to.
function WarehouseSettingsModal({
  open,
  warehouses,
  onClose,
  onSaved,
}: {
  open: boolean;
  warehouses: WarehouseDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newBinByWarehouse, setNewBinByWarehouse] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const addWarehouse = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createWarehouse(newName.trim());
      setNewName('');
      onSaved();
    } catch (err) {
      toast.push((err as Error).message || 'Could not add this warehouse.', 'info');
    } finally {
      setCreating(false);
    }
  };

  const saveRename = async (id: string) => {
    const name = editingName.trim();
    setEditingId(null);
    if (!name) return;
    try {
      await renameWarehouse(id, name);
      onSaved();
    } catch (err) {
      toast.push((err as Error).message || 'Could not rename this warehouse.', 'info');
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await deleteWarehouse(id);
      if (!res.success) toast.push(res.message || 'Could not delete this warehouse.', 'info');
      else onSaved();
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
      onSaved();
    } catch (err) {
      toast.push((err as Error).message || 'Could not add this bin.', 'info');
    }
  };

  const removeBin = async (id: string, name: string) => {
    try {
      await removeWarehouseBin(id, name);
      onSaved();
    } catch (err) {
      toast.push((err as Error).message || 'Could not remove this bin.', 'info');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage warehouses" subtitle="Add your real locations. Bins are optional — only set them up if you actually track shelf-level detail." widthClass="max-w-xl">
      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void addWarehouse()}
            placeholder="e.g. Sylhet Storage"
            className="h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
          <button
            onClick={() => void addWarehouse()}
            disabled={creating || !newName.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={14} /> Add warehouse
          </button>
        </div>

        <div className="max-h-96 space-y-3 overflow-y-auto">
          {warehouses.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No warehouses yet — add your first one above.</p>}
          {warehouses.map((w) => (
            <div key={w.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                {editingId === w.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => void saveRename(w.id)}
                    onKeyDown={(e) => e.key === 'Enter' && void saveRename(w.id)}
                    className="h-8 flex-1 rounded-md border border-indigo-300 px-2 text-sm outline-none"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(w.id);
                      setEditingName(w.name);
                    }}
                    className="group flex flex-1 items-center gap-1.5 text-left text-sm font-semibold text-slate-800"
                  >
                    {w.name}
                    <Pencil size={11} className="text-slate-300 opacity-0 group-hover:opacity-100" />
                  </button>
                )}
                <button
                  onClick={() => void remove(w.id)}
                  disabled={busyId === w.id}
                  className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                  placeholder="+ Add bin (optional)"
                  className="h-6 w-36 rounded-full border border-dashed border-slate-300 px-2 text-[11px] text-slate-600 outline-none focus:border-indigo-400"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function InventoryPage() {
  const toast = useToast();
  const [view, setView] = useState<PageView>('stock');
  const [levels, setLevels] = useState<InventoryLevelDTO[]>([]);
  const [movements, setMovements] = useState<InventoryMovementDTO[]>([]);
  const [velocityByVariantId, setVelocityByVariantId] = useState<Record<string, number>>({});
  const [skuOptions, setSkuOptions] = useState<InventorySkuOptionDTO[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);
  const [warehouseModalOpen, setWarehouseModalOpen] = useState(false);
  const [manualReturnModalOpen, setManualReturnModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [focus, setFocus] = useState<FocusMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('onHand');
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [binFilter, setBinFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [countModalOpen, setCountModalOpen] = useState(false);
  const [inboundModalOpen, setInboundModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [foundStockPrefill, setFoundStockPrefill] = useState<{ sku: InventorySkuOptionDTO; quantity: number } | null>(null);
  // Carries the actual bad quantity from the return line item along with the SKU, so the count
  // modal opens with "how many units" already filled in — the person already typed that number
  // once (as the bad-quantity split), re-typing it here would just be busywork.
  const logAsFoundStock = (option: InventorySkuOptionDTO, quantity: number) => {
    setFoundStockPrefill({ sku: option, quantity });
    setCountModalOpen(true);
  };

  const [shrinkage, setShrinkage] = useState<ShrinkageReportDTO | null>(null);
  const [shrinkageLoading, setShrinkageLoading] = useState(false);

  const [ledgerMovements, setLedgerMovements] = useState<InventoryMovementDTO[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerReasons, setLedgerReasons] = useState<string[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerReason, setLedgerReason] = useState('');
  const [ledgerWarehouseId, setLedgerWarehouseId] = useState('');
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const LEDGER_PAGE_SIZE = 25;

  const [awaitingReceipt, setAwaitingReceipt] = useState<ReturnsPackageDTO[]>([]);
  const [awaitingQc, setAwaitingQc] = useState<ReturnsPackageDTO[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsLoaded, setReturnsLoaded] = useState(false);
  const [returnsWorkflow, setReturnsWorkflow] = useState<ReturnsWorkflow>('combined');
  const [returnsWarehouseFilter, setReturnsWarehouseFilter] = useState('');
  const [returnsToProcessPage, setReturnsToProcessPage] = useState(1);
  const RETURNS_TO_PROCESS_PAGE_SIZE = 10;
  const [overdueShipments, setOverdueShipments] = useState<OverdueShipmentDTO[]>([]);
  const agingReceiptCount = awaitingReceipt.filter(isAgingPackage).length;
  const agingQcCount = awaitingQc.filter(isAgingPackage).length;
  const returnsToProcessTotalPages = Math.max(1, Math.ceil(awaitingReceipt.length / RETURNS_TO_PROCESS_PAGE_SIZE));
  const returnsToProcessCurrentPage = Math.min(returnsToProcessPage, returnsToProcessTotalPages);
  const pagedAwaitingReceipt = awaitingReceipt.slice(
    (returnsToProcessCurrentPage - 1) * RETURNS_TO_PROCESS_PAGE_SIZE,
    returnsToProcessCurrentPage * RETURNS_TO_PROCESS_PAGE_SIZE
  );

  const load = async () => {
    setLoading(true);
    try {
      const [inventoryRes, skusRes, supplierRes, warehouseRes, settingsRes, overdueRes] = await Promise.all([
        listInventory(),
        listInventorySkuOptions(),
        listSuppliers(),
        listWarehouses(),
        getInventorySettings(),
        getOverdueShipments(),
      ]);
      setLevels(inventoryRes.levels);
      setMovements(inventoryRes.movements);
      setVelocityByVariantId(inventoryRes.velocityByVariantId);
      setSkuOptions(skusRes.options);
      setSuppliers(supplierRes.suppliers);
      setWarehouses(warehouseRes.warehouses);
      setReturnsWorkflow(settingsRes.settings.returnsWorkflow);
      setOverdueShipments(overdueRes.shipments);
    } catch {
      toast.push('Could not load inventory workspace.', 'info');
    } finally {
      setLoading(false);
    }
  };

  const loadShrinkage = async () => {
    setShrinkageLoading(true);
    try {
      setShrinkage(await getShrinkageReport());
    } catch {
      toast.push('Could not load the loss report.', 'info');
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
        dateFrom: ledgerDateFrom ? new Date(ledgerDateFrom).toISOString() : undefined,
        dateTo: ledgerDateTo ? new Date(`${ledgerDateTo}T23:59:59`).toISOString() : undefined,
        page: targetPage,
        pageSize: LEDGER_PAGE_SIZE,
      });
      setLedgerMovements(res.movements);
      setLedgerTotal(res.total);
      setLedgerReasons(res.reasons);
      setLedgerPage(targetPage);
    } catch {
      toast.push('Could not load the movement ledger.', 'info');
    } finally {
      setLedgerLoading(false);
    }
  };

  // Called after every action that can log a shrinkage-relevant movement (a damaged/lost/cycle
  // count, an inbound write-off, a return QC'd with a shortfall) — only actually refetches if the
  // report's already been loaded once this session, so it stays in sync in the background without
  // forcing a fetch nobody's asked to see yet.
  const refreshShrinkageIfLoaded = () => {
    if (shrinkage) void loadShrinkage();
  };

  const changeReturnsWorkflow = async (mode: ReturnsWorkflow) => {
    if (mode === returnsWorkflow) return;
    setReturnsWorkflow(mode);
    setReturnsToProcessPage(1);
    try {
      await updateInventorySettings(mode);
    } catch {
      toast.push('Could not save this preference.', 'info');
    }
  };

  const loadReturnsQueue = async () => {
    setReturnsLoading(true);
    try {
      const res = await getReturnsQueue(returnsWarehouseFilter || undefined);
      setAwaitingReceipt(res.awaitingReceipt);
      setAwaitingQc(res.awaitingQc);
      setReturnsLoaded(true);
    } catch {
      toast.push('Could not load the returns queue.', 'info');
    } finally {
      setReturnsLoading(false);
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
      .catch(() => toast.push('Could not load the returns queue.', 'info'));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Always refetches on switching to this tab (unlike returns, which only loads once) — shrinkage
    // is exactly the kind of number someone checks right after logging a damaged/lost count, and a
    // stale cached report from an earlier visit would silently hide the thing they just came to see.
    if (view === 'shrinkage') void loadShrinkage();
    if (view === 'returns' && !returnsLoaded) void loadReturnsQueue();
    if (view === 'ledger') void loadLedger(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Debounced so typing in the search box doesn't fire a request per keystroke — every filter
  // change restarts on page 1, since a stale page number from a previous, differently-filtered
  // result set wouldn't mean anything here.
  useEffect(() => {
    if (view !== 'ledger') return;
    const handle = setTimeout(() => void loadLedger(1), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledgerSearch, ledgerReason, ledgerWarehouseId, ledgerDateFrom, ledgerDateTo]);

  // Only worth offering once a warehouse is actually picked (a bin name means nothing across
  // multiple warehouses at once) and once that warehouse has stock spread across more than one bin
  // — a single bin isn't something worth filtering by, and most businesses on this system never
  // name bins at all, so the dropdown would otherwise show up as permanent, useless clutter.
  const binFilterOptions = useMemo(() => {
    if (warehouseFilter === 'all') return [];
    const bins = new Set(levels.filter((level) => level.warehouseId === warehouseFilter).map((level) => level.bin));
    return bins.size > 1 ? [...bins].sort() : [];
  }, [levels, warehouseFilter]);

  // Which warehouses have a real, deliberately-named shelf on record — same "Unassigned doesn't
  // count" rule as everywhere else bin-tracking turns on. Drives whether the main table's Location
  // column shows a bin line at all: a warehouse nobody's ever shelved anything in shouldn't show
  // "Unassigned" under every single row as if that were meaningful shelf information.
  const warehousesWithRealBins = useMemo(() => {
    const set = new Set<string>();
    for (const warehouse of warehouses) {
      if (hasRealBins(warehouse.bins)) set.add(warehouse.id);
    }
    for (const level of levels) {
      if (level.bin !== 'Unassigned') set.add(level.warehouseId);
    }
    return set;
  }, [warehouses, levels]);

  useEffect(() => {
    setBinFilter('all');
  }, [warehouseFilter]);

  // Overdue shipments are keyed by product+variant+warehouse+bin, same as a level — this maps each
  // affected level to the worst (largest) days-overdue among its open shipments, so a level with
  // more than one overdue shipment still shows a single, honest "how late" number.
  const overdueDaysByLevelKey = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of overdueShipments) {
      const key = `${s.productId}::${s.variantId}::${s.warehouseId}::${s.bin}`;
      map.set(key, Math.max(map.get(key) ?? 0, s.daysOverdue));
    }
    return map;
  }, [overdueShipments]);
  const levelKey = (level: InventoryLevelDTO) => `${level.productId}::${level.variantId}::${level.warehouseId}::${level.bin}`;

  const filteredLevels = levels.filter((level) => {
    const haystack = `${level.productTitle ?? ''} ${level.variantLabel ?? ''} ${level.sku ?? ''}`.toLowerCase();
    const matchesSearch = haystack.includes(search.trim().toLowerCase());
    const matchesFocus =
      focus === 'all'
        ? true
        : focus === 'inbound'
          ? level.inbound > 0
          : focus === 'overdue'
            ? overdueDaysByLevelKey.has(levelKey(level))
            : focus === 'reserved'
              ? level.reserved > 0
              : focus === 'dead'
                ? isDeadStock(level, level.variantId ? velocityByVariantId[level.variantId] : undefined)
                : ['reorder', 'out'].includes(levelStatus(level));
    const matchesWarehouse = warehouseFilter === 'all' || level.warehouseId === warehouseFilter;
    const matchesBin = binFilter === 'all' || level.bin === binFilter;
    return matchesSearch && matchesFocus && matchesWarehouse && matchesBin;
  });

  const sortedLevels = [...filteredLevels].sort((a, b) => {
    if (sortMode === 'onHand') return b.onHand - a.onHand;
    return (a.productTitle ?? a.variantLabel ?? '').localeCompare(b.productTitle ?? b.variantLabel ?? '');
  });

  const totalPages = Math.max(1, Math.ceil(sortedLevels.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageLevels = sortedLevels.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, focus, sortMode, warehouseFilter, binFilter]);

  const summary = levels.reduce(
    (acc, level) => {
      acc.onHand += level.onHand;
      acc.inbound += level.inbound;
      acc.value += level.unitCost != null ? level.onHand * level.unitCost : 0;
      return acc;
    },
    { onHand: 0, inbound: 0, value: 0 }
  );

  const inboundCount = levels.filter((l) => l.inbound > 0).length;
  const overdueLevelsCount = levels.filter((l) => overdueDaysByLevelKey.has(levelKey(l))).length;
  const reorderCount = levels.filter((l) => ['reorder', 'out'].includes(levelStatus(l))).length;
  const reservedCount = levels.filter((l) => l.reserved > 0).length;
  const deadCount = levels.filter((l) => isDeadStock(l, l.variantId ? velocityByVariantId[l.variantId] : undefined)).length;
  // Ordered by urgency, not alphabetically or by when each filter was added — restock risk costs
  // sales today, an overdue shipment means a supplier commitment already slipped and needs chasing,
  // reserved stock is diagnostic ("why can't I sell this"), dead stock is capital tied up but not
  // urgent, incoming (on schedule, nothing wrong yet) is the least urgent of all.
  const focusOptions: { key: FocusMode; label: string; count: number }[] = [
    { key: 'all', label: 'All items', count: levels.length },
    { key: 'reorder', label: 'Low Stock', count: reorderCount },
    { key: 'overdue', label: 'Overdue shipments', count: overdueLevelsCount },
    { key: 'reserved', label: 'Has reserved stock', count: reservedCount },
    { key: 'dead', label: 'Dead stock', count: deadCount },
    { key: 'inbound', label: 'Incoming stock', count: inboundCount },
  ];

  const movementRows = movements.slice(0, 8);

  // A variant stocked at more than one warehouse/bin can't get the automatic cycle-count
  // correction (see New Count → Cycle count) — order line items don't carry a location, so the
  // system can't safely tell which location's in-transit units belong to which shelf. Flagging it
  // here means nobody's surprised by a false-looking discrepancy without knowing why.
  const multiLocationVariantIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of levels) {
      if (!l.variantId) continue;
      counts.set(l.variantId, (counts.get(l.variantId) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([variantId]) => variantId));
  }, [levels]);

  const applyLevelUpdate = (updated: InventoryLevelDTO) => {
    setLevels((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    // Covers the inbound write-off action (a shrinkage source) along with plain reorder-point edits
    // and ordinary "mark received" (which aren't) — cheap and harmless to over-trigger since it's a
    // no-op unless the report's already loaded.
    refreshShrinkageIfLoaded();
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex flex-wrap items-center justify-between gap-y-3 border-b border-slate-200 bg-white px-4 py-4 lg:px-8 lg:py-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Inventory</h1>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">Command center</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Per-SKU stock counts, low stock alerts, incoming stock and loss.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setWarehouseModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Warehouse size={14} /> Manage warehouses
          </button>
          <button onClick={() => setCountModalOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus size={14} /> New count
          </button>
          <button onClick={() => setInboundModalOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
            <Truck size={14} /> Incoming Stock
          </button>
          {canTransferBetweenLocations(warehouses, levels) && (
            <button onClick={() => setTransferModalOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-700">
              <ArrowLeftRight size={14} /> Transfer stock
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 pt-3 lg:px-8">
        <div className="flex flex-wrap items-center gap-1">
          {(['stock', 'returns', 'ledger', 'shrinkage'] as PageView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={clsx(
                'rounded-t-lg px-4 py-2 text-sm font-semibold transition-colors',
                view === v ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {v === 'stock' ? 'Stock levels' : v === 'returns' ? 'Returns to process' : v === 'shrinkage' ? 'Loss Report' : 'Stock History'}
              {v === 'returns' && awaitingReceipt.length + awaitingQc.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
                  {awaitingReceipt.length + awaitingQc.length}
                </span>
              )}
              {v === 'returns' && agingReceiptCount + agingQcCount > 0 && (
                <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{agingReceiptCount + agingQcCount} aging</span>
              )}
            </button>
          ))}
        </div>
        {view === 'returns' && (
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setManualReturnModalOpen(true)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <Search size={12} className="text-slate-400" /> Return a delivered order
            </button>
            <ReturnsWorkflowPicker value={returnsWorkflow} onChange={(mode) => void changeReturnsWorkflow(mode)} />
            {warehouses.length > 1 && (
              <FilterPicker
                icon={Warehouse}
                value={returnsWarehouseFilter}
                onChange={changeReturnsWarehouseFilter}
                placeholder="All warehouses"
                options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
              />
            )}
          </div>
        )}
      </div>

      {view === 'returns' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
          {returnsLoading && !returnsLoaded ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading returns queue...</div>
          ) : (
            <div className="space-y-6">
              {returnsWorkflow === 'combined' ? (
                <>
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-sm font-bold text-slate-900">Returns to process</h2>
                        {awaitingReceipt.length > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{awaitingReceipt.length}</span>
                        )}
                        {agingReceiptCount > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{agingReceiptCount} aging</span>}
                      </div>
                      <PackageCheck size={15} className="text-slate-400" />
                    </div>
                    <p className="mb-3 text-xs text-slate-400">
                      Match the box in front of you to the order below, check what's actually inside, and confirm — this receives it and finishes QC in one step.
                    </p>
                    {awaitingReceipt.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-400">Nothing waiting to be processed.</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {pagedAwaitingReceipt.map((pkg) => (
                            <ReceiveAndQcPackageCard
                              key={pkg.orderId}
                              pkg={pkg}
                              warehouses={warehouses}
                              onDone={() => {
                                void loadReturnsQueue();
                                refreshShrinkageIfLoaded();
                              }}
                              onLogFoundStock={logAsFoundStock}
                            />
                          ))}
                        </div>
                        {returnsToProcessTotalPages > 1 && (
                          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
                            <span className="text-xs text-slate-400">
                              Page <span className="font-medium text-slate-600">{returnsToProcessCurrentPage}</span> of{' '}
                              <span className="font-medium text-slate-600">{returnsToProcessTotalPages}</span>
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setReturnsToProcessPage((p) => Math.max(1, p - 1))}
                                disabled={returnsToProcessCurrentPage <= 1}
                                className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ArrowLeft size={12} /> Prev
                              </button>
                              <button
                                onClick={() => setReturnsToProcessPage((p) => Math.min(returnsToProcessTotalPages, p + 1))}
                                disabled={returnsToProcessCurrentPage >= returnsToProcessTotalPages}
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
                    <section className="rounded-xl border border-slate-200 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <h2 className="text-sm font-bold text-slate-900">Awaiting QC (from before switching)</h2>
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{awaitingQc.length}</span>
                          {agingQcCount > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{agingQcCount} aging</span>}
                        </div>
                        <ShieldCheck size={15} className="text-slate-400" />
                      </div>
                      <p className="mb-3 text-xs text-slate-400">These were already received under the two-step flow — finish inspecting them here.</p>
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {awaitingQc.map((pkg) => (
                          <QcPackageCard
                            key={pkg.orderId}
                            pkg={pkg}
                            onDone={() => {
                              void loadReturnsQueue();
                              refreshShrinkageIfLoaded();
                            }}
                            onLogFoundStock={logAsFoundStock}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                </>
              ) : (
                <>
                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-sm font-bold text-slate-900">Awaiting warehouse receipt</h2>
                        {awaitingReceipt.length > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{awaitingReceipt.length}</span>
                        )}
                        {agingReceiptCount > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{agingReceiptCount} aging</span>}
                      </div>
                      <PackageSearch size={15} className="text-slate-400" />
                    </div>
                    <p className="mb-3 text-xs text-slate-400">Courier reported these as failed deliveries coming back. Confirm once the box is physically in your hands.</p>
                    {awaitingReceipt.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-400">Nothing waiting on a warehouse receipt.</p>
                    ) : (
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {awaitingReceipt.map((pkg) => (
                          <ReturnsPackageCard
                            key={pkg.orderId}
                            pkg={pkg}
                            warehouses={warehouses}
                            showsLocation
                            onSubmit={receiveReturnPackage}
                            onDone={() => {
                              void loadReturnsQueue();
                              refreshShrinkageIfLoaded();
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-sm font-bold text-slate-900">Awaiting QC</h2>
                        {awaitingQc.length > 0 && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{awaitingQc.length}</span>
                        )}
                        {agingQcCount > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">{agingQcCount} aging</span>}
                      </div>
                      <ShieldCheck size={15} className="text-slate-400" />
                    </div>
                    <p className="mb-3 text-xs text-slate-400">Back in the warehouse, waiting on inspection. Confirming here restocks it and makes it sellable again.</p>
                    {awaitingQc.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-400">Nothing waiting on inspection.</p>
                    ) : (
                      <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {awaitingQc.map((pkg) => (
                          <QcPackageCard
                            key={pkg.orderId}
                            pkg={pkg}
                            onDone={() => {
                              void loadReturnsQueue();
                              refreshShrinkageIfLoaded();
                            }}
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
      ) : view === 'shrinkage' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
          {shrinkageLoading || !shrinkage ? (
            <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading loss report...</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <MetricCard
                  icon={TrendingDown}
                  label="Net value lost"
                  value={money(shrinkage.netValueLost)}
                  detail={`${shrinkage.netUnitsLost.toLocaleString()} units, after recoveries`}
                  tone="rose"
                />
                <MetricCard icon={ShieldCheck} label="Gross value lost" value={money(shrinkage.totalValueLost)} detail={`${shrinkage.totalUnitsLost.toLocaleString()} units, before recoveries`} />
                <MetricCard
                  icon={PackagePlus}
                  label="Recovered"
                  value={money(shrinkage.recoveredValue)}
                  detail={shrinkage.recoveredUnits > 0 ? `${shrinkage.recoveredUnits.toLocaleString()} units found` : 'no found stock logged yet'}
                  tone="emerald"
                />
                <MetricCard
                  icon={ClipboardCheck}
                  label="Top reason"
                  value={shrinkage.byReason[0]?.reason ?? '—'}
                  detail={shrinkage.byReason[0] ? `${shrinkage.byReason[0].units} units` : 'no loss recorded'}
                />
              </div>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-4">
                  <h2 className="mb-3 text-sm font-bold text-slate-900">By reason</h2>
                  {shrinkage.byReason.length === 0 ? (
                    <p className="text-sm text-slate-400">No losses recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {shrinkage.byReason.map((r) => (
                        <div key={r.reason} className="flex items-center justify-between text-sm">
                          <span className="text-slate-700">{r.reason}</span>
                          <span className="tabular-nums text-slate-500">
                            {r.units} units · {money(r.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 p-4">
                  <h2 className="mb-3 text-sm font-bold text-slate-900">By variant</h2>
                  {shrinkage.byVariant.length === 0 ? (
                    <p className="text-sm text-slate-400">No losses recorded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {shrinkage.byVariant.slice(0, 10).map((s) => (
                        <div key={s.variantId ?? `${s.productTitle}-${s.variantLabel}`} className="flex items-center justify-between text-sm">
                          <span className="truncate text-slate-700">
                            {s.productTitle ?? 'Unknown item'}
                            {s.variantLabel ? ` — ${s.variantLabel}` : ''}
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

              <section className="rounded-xl border border-slate-200 p-4">
                <h2 className="mb-3 text-sm font-bold text-slate-900">Loss events</h2>
                {shrinkage.movements.length === 0 ? (
                  <p className="text-sm text-slate-400">No losses recorded yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {shrinkage.movements.map((m) => (
                      <div key={m.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">
                            {m.productTitle ?? m.sku ?? 'Inventory item'}
                            {m.variantLabel ? ` — ${m.variantLabel}` : ''}
                          </p>
                          <p className="text-xs text-slate-400">
                            {m.reason} · {ageLabel(m.createdAt)} ago{m.createdBy ? ` · by ${m.createdBy}` : ''}
                          </p>
                          {m.note && <p className="mt-0.5 whitespace-normal break-words text-xs italic text-slate-500">"{m.note}"</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          {/* A short-shipped/lost inbound write-off never touches onHand (delta stays 0 by
                              design), but real units and real money are still involved — show the actual
                              quantity and "never arrived" instead of a misleading 0. */}
                          <p className="font-bold tabular-nums text-rose-600">
                            {m.delta !== 0 ? m.delta : `${m.quantity} unit${m.quantity === 1 ? '' : 's'}`}
                          </p>
                          {m.delta === 0 && <p className="text-[10px] text-slate-400">never arrived</p>}
                          {m.valueDelta != null && <p className="text-[11px] font-semibold text-rose-500">{money(Math.abs(m.valueDelta))}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      ) : view === 'ledger' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 lg:px-8 lg:py-6">
          <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
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
                  options={[{ value: '', label: 'All reasons' }, ...ledgerReasons.map((r) => ({ value: r, label: r }))]}
                />
                <FilterPicker
                  icon={Warehouse}
                  value={ledgerWarehouseId}
                  onChange={setLedgerWarehouseId}
                  placeholder="All warehouses"
                  options={[{ value: '', label: 'All warehouses' }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
                />
                <div className="flex items-center gap-1.5">
                  <input type="date" value={ledgerDateFrom} onChange={(e) => setLedgerDateFrom(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-indigo-400" />
                  <span className="text-xs text-slate-400">to</span>
                  <input type="date" value={ledgerDateTo} onChange={(e) => setLedgerDateTo(e.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-indigo-400" />
                </div>
                {(ledgerSearch || ledgerReason || ledgerWarehouseId || ledgerDateFrom || ledgerDateTo) && (
                  <button
                    onClick={() => {
                      setLedgerSearch('');
                      setLedgerReason('');
                      setLedgerWarehouseId('');
                      setLedgerDateFrom('');
                      setLedgerDateTo('');
                    }}
                    className="h-9 rounded-lg px-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              {ledgerLoading && ledgerMovements.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-slate-400">Loading movement ledger...</div>
              ) : ledgerMovements.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No movements match this filter.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="px-2 py-2 text-left font-semibold">Date</th>
                          <th className="px-2 py-2 text-left font-semibold">Reason</th>
                          <th className="px-2 py-2 text-left font-semibold">Product</th>
                          <th className="px-2 py-2 text-right font-semibold">Qty</th>
                          <th className="px-2 py-2 text-right font-semibold">Unit cost</th>
                          <th className="px-2 py-2 text-right font-semibold">Value</th>
                          <th className="px-2 py-2 text-left font-semibold">Warehouse</th>
                          <th className="px-2 py-2 text-left font-semibold">Note</th>
                          <th className="px-2 py-2 text-left font-semibold">By</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ledgerMovements.map((m) => (
                          <tr key={m.id}>
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">{new Date(m.createdAt).toLocaleDateString()}</td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{m.reason}</span>
                            </td>
                            <td className="px-2 py-2 text-slate-700">
                              {m.productTitle ?? '—'}
                              {m.variantLabel ? ` · ${m.variantLabel}` : ''}
                              {m.sku ? <span className="text-slate-400"> ({m.sku})</span> : null}
                            </td>
                            <td className={clsx('px-2 py-2 text-right tabular-nums font-semibold', m.delta > 0 ? 'text-emerald-600' : m.delta < 0 ? 'text-rose-600' : 'text-slate-500')}>
                              {m.delta !== 0 ? `${m.delta > 0 ? '+' : ''}${m.delta}` : `${m.quantity} unit${m.quantity === 1 ? '' : 's'}`}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">{m.unitCost != null ? money(m.unitCost) : '—'}</td>
                            <td className="px-2 py-2 text-right tabular-nums font-semibold text-slate-800">{m.valueDelta != null ? money(m.valueDelta) : '—'}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">{m.warehouseName ?? '—'}</td>
                            <td className="max-w-[160px] truncate px-2 py-2 text-slate-400" title={m.note ?? undefined}>{m.note ?? '—'}</td>
                            <td className="whitespace-nowrap px-2 py-2 text-slate-400">{m.createdBy ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {ledgerTotal} movement{ledgerTotal === 1 ? '' : 's'}
                    </span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => void loadLedger(Math.max(1, ledgerPage - 1))} disabled={ledgerPage <= 1} className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30">
                        <ArrowLeft size={14} />
                      </button>
                      <span>
                        Page {ledgerPage} of {Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() => void loadLedger(Math.min(Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE)), ledgerPage + 1))}
                        disabled={ledgerPage >= Math.max(1, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE))}
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
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading inventory...</div>
      ) : levels.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <Warehouse size={30} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No SKUs tracked yet</p>
          <p className="max-w-sm text-sm text-slate-400">Log your first opening count to start tracking real stock, per SKU.</p>
          <button onClick={() => setCountModalOpen(true)} className="mt-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            New count
          </button>
        </div>
      ) : (
        <>
          <div className="border-b border-slate-200 bg-white">
            <div className="flex flex-wrap">
              <MetricCard icon={PackageCheck} label="On hand" value={summary.onHand.toLocaleString()} detail="units across tracked SKUs" tone="emerald" />
              <MetricCard icon={Truck} label="Incoming stock" value={summary.inbound.toLocaleString()} detail="purchase and transfer queue" tone="indigo" />
              <MetricCard icon={ShieldCheck} label="Stock value" value={money(summary.value)} detail="SKUs with a recorded unit cost" />
              <MetricCard icon={TrendingDown} label="Low Stock" value={reorderCount.toLocaleString()} detail="at or below the low stock alert" tone={reorderCount > 0 ? 'amber' : 'emerald'} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap rounded-lg border border-slate-200 bg-slate-50 p-0.5">
              {focusOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setFocus(option.key)}
                  className={clsx(
                    'flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors',
                    focus === option.key ? 'bg-white text-slate-900 shadow-sm shadow-slate-900/5' : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  {option.label}
                  <span className="tabular-nums text-slate-400">{option.count}</span>
                </button>
              ))}
            </div>
            <Popover
              align="left"
              widthClass="w-56"
              trigger={() => (
                <div className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-50">
                  <span className="text-slate-400">Warehouse:</span>
                  {warehouseFilter === 'all' ? 'All warehouses' : (warehouses.find((w) => w.id === warehouseFilter)?.name ?? 'All warehouses')}
                  <ChevronDown size={11} className="text-slate-400" />
                </div>
              )}
            >
              {(close) => (
                <div className="py-1.5">
                  <button
                    onClick={() => {
                      setWarehouseFilter('all');
                      close();
                    }}
                    className={clsx(
                      'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                      warehouseFilter === 'all' ? 'font-semibold text-indigo-600' : 'text-slate-700'
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
                        'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                        warehouseFilter === warehouse.id ? 'font-semibold text-indigo-600' : 'text-slate-700'
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
                    {binFilter === 'all' ? 'All shelves/bins' : binFilter}
                    <ChevronDown size={11} className="text-slate-400" />
                  </div>
                )}
              >
                {(close) => (
                  <div className="py-1.5">
                    <button
                      onClick={() => {
                        setBinFilter('all');
                        close();
                      }}
                      className={clsx(
                        'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                        binFilter === 'all' ? 'font-semibold text-indigo-600' : 'text-slate-700'
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
                          'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                          binFilter === bin ? 'font-semibold text-indigo-600' : 'text-slate-700'
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
                        'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                        sortMode === key ? 'font-semibold text-indigo-600' : 'text-slate-700'
                      )}
                    >
                      {SORT_LABELS[key]}
                    </button>
                  ))}
                </div>
              )}
            </Popover>
            <div className="relative ml-auto w-full sm:w-64 lg:w-80">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search product, variant or SKU"
                className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_360px] xl:overflow-hidden">
            <div className="flex min-h-0 flex-col">
              <div className="xl:flex-1 xl:overflow-y-auto">
                <table className="w-full min-w-0 table-fixed border-collapse text-sm xl:min-w-[1040px]">
                  <colgroup>
                    <col className="w-[30%]" />
                    <col className="w-[16%]" />
                    <col className="w-[18%]" />
                    <col className="w-[14%]" />
                    <col className="w-[12%]" />
                    <col className="w-[10%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                      <th className="py-3.5 pl-6 pr-5">Item</th>
                      <th className="px-5 py-3.5">Location</th>
                      <th className="px-5 py-3.5">Availability</th>
                      <th className="px-5 py-3.5">Low Stock Alert</th>
                      <th className="px-5 py-3.5">Status</th>
                      <th className="py-3.5 pl-3 pr-6 text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageLevels.map((level) => {
                      const status = levelStatus(level);
                      const value = level.unitCost != null ? level.onHand * level.unitCost : null;
                      return (
                        <tr key={level.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-4 pl-6 pr-5">
                            <div className="flex min-w-0 items-center gap-4">
                              {level.productImage ? (
                                <img src={level.productImage} alt={level.productTitle ?? ''} className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" />
                              ) : (
                                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                                  <Package size={18} />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate font-semibold text-slate-800">{level.productTitle ?? 'Unlinked product'}</p>
                                  {level.variantId && multiLocationVariantIds.has(level.variantId) && (
                                    <span
                                      title="Stocked at more than one location — cycle counts here can't auto-correct for in-transit stock, since the system can't tell which location it belongs to."
                                      className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-600 ring-1 ring-inset ring-violet-600/20"
                                    >
                                      Multi-location
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-xs text-slate-400">
                                  {level.variantLabel ? `${level.variantLabel} · ` : ''}{level.sku ? `SKU ${level.sku}` : 'No SKU'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-700">{level.warehouseName}</span>
                              {warehousesWithRealBins.has(level.warehouseId) && (
                                <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                                  <MapPin size={11} /> {level.bin}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="font-semibold tabular-nums text-slate-900">{level.onHand}</p>
                                <p className="text-slate-400">on hand</p>
                              </div>
                              <ReservedCell level={level} />
                              <IncomingCell level={level} onReceived={applyLevelUpdate} overdueDays={overdueDaysByLevelKey.get(levelKey(level)) ?? null} />
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <ReorderPointCell level={level} unitsPerDay={level.variantId ? velocityByVariantId[level.variantId] : undefined} onSaved={applyLevelUpdate} />
                          </td>
                          <td className="px-5 py-4">
                            {status === 'out' ? (
                              <span className="inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-600/20">Out of stock</span>
                            ) : status === 'reorder' ? (
                              <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">Low Stock</span>
                            ) : status === 'ok' ? (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/20">In stock</span>
                            ) : (
                              <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-500/15">No alert set</span>
                            )}
                          </td>
                          <td className="py-4 pl-3 pr-6 text-right font-semibold tabular-nums text-slate-800">{value != null ? money(value) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sortedLevels.length === 0 && <div className="py-16 text-center text-sm text-slate-400">No inventory items match this view.</div>}
              </div>

              {sortedLevels.length > 0 && (
                <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5">
                  <span className="text-xs text-slate-400">
                    Showing <span className="font-medium text-slate-600">{(currentPage - 1) * PAGE_SIZE + 1}</span>-
                    <span className="font-medium text-slate-600">{Math.min(sortedLevels.length, currentPage * PAGE_SIZE)}</span> of{' '}
                    <span className="font-medium text-slate-600">{sortedLevels.length.toLocaleString()}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ArrowLeft size={12} /> Prev
                    </button>
                    <span className="min-w-[76px] text-center text-xs text-slate-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next <ArrowRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <aside className="border-t border-slate-200 bg-slate-50 p-4 xl:overflow-y-auto xl:border-l xl:border-t-0">
              <div className="space-y-4">
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-slate-900">Stock History</h2>
                    <button onClick={() => setView('ledger')} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                      See all <ArrowRight size={12} />
                    </button>
                  </div>
                  <div className="mt-3 divide-y divide-slate-100">
                    {movementRows.length === 0 && <div className="py-3 text-sm text-slate-400">No inventory movements yet.</div>}
                    {movementRows.map((movement) => (
                      <div key={movement.id} className="flex items-start justify-between gap-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700">{movement.reason}</p>
                          <p className="truncate text-xs text-slate-400">{movement.productTitle ?? movement.sku}</p>
                          <p className="text-xs text-slate-400">
                            {ageLabel(movement.createdAt)} ago{movement.createdBy ? ` · by ${movement.createdBy}` : ''}
                          </p>
                          {movement.note && <p className="mt-0.5 whitespace-normal break-words text-xs italic text-slate-500">"{movement.note}"</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={clsx('flex items-center justify-end gap-1 text-xs font-bold tabular-nums', movement.delta >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
                            {movement.delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {movement.delta > 0 ? '+' : ''}
                            {movement.delta}
                          </span>
                          {movement.valueDelta != null && movement.valueDelta !== 0 && (
                            <p className={clsx('text-[11px] font-semibold', movement.valueDelta > 0 ? 'text-emerald-500' : 'text-rose-500')}>
                              {movement.valueDelta > 0 ? '+' : '-'}
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
      <NewCountModal
        open={countModalOpen}
        levels={levels}
        warehouses={warehouses}
        suppliers={suppliers}
        onClose={() => {
          setCountModalOpen(false);
          setFoundStockPrefill(null);
        }}
        onSaved={() => {
          void load();
          refreshShrinkageIfLoaded();
        }}
        onManageWarehouses={() => setWarehouseModalOpen(true)}
        initialSku={foundStockPrefill?.sku ?? null}
        initialQuantity={foundStockPrefill?.quantity}
      />
      <NewInboundModal
        open={inboundModalOpen}
        suppliers={suppliers}
        warehouses={warehouses}
        onClose={() => setInboundModalOpen(false)}
        onSaved={() => {
          void load();
        }}
        onManageWarehouses={() => setWarehouseModalOpen(true)}
      />
      <TransferStockModal
        open={transferModalOpen}
        levels={levels}
        warehouses={warehouses}
        onClose={() => setTransferModalOpen(false)}
        onSaved={() => {
          void load();
        }}
        onManageWarehouses={() => setWarehouseModalOpen(true)}
      />
      <WarehouseSettingsModal
        open={warehouseModalOpen}
        warehouses={warehouses}
        onClose={() => setWarehouseModalOpen(false)}
        onSaved={() => void load()}
      />
      <ManualReturnModal
        open={manualReturnModalOpen}
        onClose={() => setManualReturnModalOpen(false)}
        onSaved={() => {
          void loadReturnsQueue();
          refreshShrinkageIfLoaded();
        }}
        onLogFoundStock={logAsFoundStock}
      />
    </div>
  );
}
