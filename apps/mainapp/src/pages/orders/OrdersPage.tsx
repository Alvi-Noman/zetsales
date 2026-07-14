import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ban,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  Download,
  Lock,
  MessageCircle,
  Package,
  Phone,
  PhoneCall,
  Plug,
  Plus,
  Search,
  ShieldAlert,
  Store as StoreIcon,
  UserX,
  X,
} from 'lucide-react';
import clsx from 'clsx';
import type { CancelReason, CourierAccountDTO, HoldReason, OrderDTO, OrderPaymentStatus, OrderStatsDTO, OrderTabKey, StoreDTO } from '@zetsales/shared';
import { useAuth } from '../../context/AuthContext';
import { AppBlock } from '../../components/apps/AppBlock';
import {
  blockCustomer,
  bulkMarkPaymentCollected,
  bulkRecheckFraud,
  bulkUpdateOrders,
  getOrderStats,
  listAllInventoryLevels,
  listCouriers,
  listOrders,
  listStores,
  splitOrder,
  unblockCustomer,
  type InventoryLevelDTO,
} from '../../lib/commerceApi';
import { OrderDetailDrawer } from '../../components/orders/OrderDetailDrawer';
import { CreateOrderModal } from '../../components/orders/CreateOrderModal';
import { PrintOrderModal, type PrintDocType } from '../../components/orders/PrintOrderModal';
import { CourierLabelModal } from '../../components/orders/CourierLabelModal';
import { BulkShipModal, type HandoverDetails } from '../../components/orders/BulkShipModal';
import { BulkStockPopup, type BulkStockResolution } from '../../components/orders/BulkStockPopup';
import { buildBinLookup, type BinLookup } from '../../components/orders/binLookup';
import { buildStockLookup, classifyOrdersByStock, summarizeOrderStock } from '../../components/orders/stockLookup';
import { ShopifyLogo, WooCommerceLogo } from '../../components/orders/platformLogos';
import { STAGE_TONE, STAGE_LABEL, PAYMENT_METHOD_SHORT, CLAIM_TONE } from '../../components/orders/orderTone';
import { ALL_HOLD_REASONS, CANCEL_REASONS_FOR_FILTER, canCancel, canHold, holdReasonsForMany } from '../../components/orders/reasons';
import { ImportOrdersModal } from '../../components/integrations/ImportOrdersModal';
import { ORDER_TABS } from '../../components/orders/tabs';
import { DateRangeMenu } from '../../components/orders/DateRangeMenu';
import { FilterMenu } from '../../components/orders/FilterMenu';
import { MoreFiltersMenu, EMPTY_ADVANCED_FILTERS, activeAdvancedFilterCount, type AdvancedFilters } from '../../components/orders/MoreFiltersMenu';
import { ExportOrdersModal, type ExportScope, type ExportFormat } from '../../components/orders/ExportOrdersModal';
import { BulkActionBar } from '../../components/orders/BulkActionBar';
import { FastTrackBanner } from '../../components/orders/FastTrackBanner';
import { PriorityCallsBanner } from '../../components/orders/PriorityCallsBanner';
import { CommandPalette } from '../../components/orders/CommandPalette';
import { RowActionsMenu } from '../../components/orders/RowActionsMenu';
import { OrderProductsCell } from '../../components/orders/OrderProductsCell';
import { Pagination } from '../../components/orders/Pagination';
import { Popover } from '../../components/ui/Popover';
import { getRangeBounds, type CustomDateRange, type DateRangeKey } from '../../components/orders/dateRange';
import { fastTrackEligibleIds } from '../../components/orders/fastTrack';
import { formatAbsoluteDateTime, relativeDayLabel, ageMinutes, pendingUrgency } from '../../components/orders/time';
import { telLink, waLink } from '../../components/orders/contact';
import { useToast } from '../../components/ui/ToastProvider';

const PLATFORM_META = {
  shopify: { label: 'Shopify', logo: ShopifyLogo },
  woocommerce: { label: 'WooCommerce', logo: WooCommerceLogo },
} as const;

const NEW_ORDERS_POLL_MS = 25_000;
// COD-workflow statuses first (COD Pending -> Advance Paid -> Collected, the path almost every
// order actually takes) — Paid/Refunded/Failed are real statuses (driven by non-COD/online-paid
// orders) but rare for a COD-heavy seller, so they trail behind rather than interrupting the ones
// staff actually use day to day.
const PAYMENT_STATUSES: OrderPaymentStatus[] = ['COD Pending', 'Advance Paid', 'Collected', 'Paid', 'Refunded', 'Failed'];

type SortKey = 'number' | 'total' | 'date';

const SORT_OPTIONS: { label: string; key: SortKey; dir: 'asc' | 'desc' }[] = [
  { label: 'Newest', key: 'date', dir: 'desc' },
  { label: 'Oldest', key: 'date', dir: 'asc' },
  { label: 'Highest amount', key: 'total', dir: 'desc' },
  { label: 'Lowest amount', key: 'total', dir: 'asc' },
];

function defaultSortForTab(tab: OrderTabKey): { key: SortKey; dir: 'asc' | 'desc' } {
  return { key: 'date', dir: tab === 'pending' || tab === 'hold' || tab === 'priority' ? 'asc' : 'desc' };
}

function TableSkeleton() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" style={{ animationDelay: `${i * 40}ms` }} />
      ))}
    </div>
  );
}

export function OrdersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [couriers, setCouriers] = useState<CourierAccountDTO[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [stats, setStats] = useState<OrderStatsDTO | null>(null);
  const [tab, setTab] = useState<OrderTabKey>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [holdReasonFilter, setHoldReasonFilter] = useState<string>('all');
  const [cancelReasonFilter, setCancelReasonFilter] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');
  const [statsDateRange, setStatsDateRange] = useState<DateRangeKey>('today');
  const [statsCustomRange, setStatsCustomRange] = useState<CustomDateRange | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [activeOrder, setActiveOrder] = useState<OrderDTO | null>(null);
  const [importTarget, setImportTarget] = useState<StoreDTO | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmPopupData, setConfirmPopupData] = useState<{ ready: OrderDTO[]; mixed: OrderDTO[]; fullyShort: OrderDTO[] } | null>(null);
  const [confirmPopupBusy, setConfirmPopupBusy] = useState(false);
  const [packPopupData, setPackPopupData] = useState<{ ready: OrderDTO[]; mixed: OrderDTO[]; fullyShort: OrderDTO[] } | null>(null);
  const [packPopupBusy, setPackPopupBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printDocType, setPrintDocType] = useState<PrintDocType | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [binLookup, setBinLookup] = useState<BinLookup | undefined>(undefined);
  // Backs the Confirmed-tab "Ready to pack"/"N short" badge and the Pending/Flagged "Mixed stock"
  // heads-up badge — loaded once up front (like stores/couriers) rather than per-tab, since both
  // surfaces need it.
  const [stockLevels, setStockLevels] = useState<InventoryLevelDTO[] | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const knownTabCountRef = useRef<number | null>(null);

  const loadStores = async () => {
    setStoresLoading(true);
    try {
      setStores(await listStores());
    } catch {
      toast.push('Could not load stores.', 'info');
    } finally {
      setStoresLoading(false);
    }
  };

  const loadCouriers = async () => {
    try {
      const { couriers: list } = await listCouriers();
      setCouriers(list);
    } catch {
      // Non-fatal — the courier dropdown just falls back to showing no connected options.
    }
  };

  const loadStats = async () => {
    try {
      const { from, to } = getRangeBounds(statsDateRange, statsCustomRange);
      const data = await getOrderStats({
        storeId: storeFilter !== 'all' ? storeFilter : undefined,
        dateFrom: from ?? undefined,
        dateTo: to ?? undefined,
      });
      setStats(data);
      knownTabCountRef.current = data.tabCounts[tab];
      setNewOrdersCount(0);
    } catch {
      // Stats support badges and live-order hints; the table can still work without them.
    }
  };

  const loadOrders = async (pageArg: number) => {
    setOrdersLoading(true);
    try {
      const { from, to } = getRangeBounds(dateRange);
      const res = await listOrders({
        storeId: storeFilter,
        tab,
        paymentStatus: paymentFilter,
        holdReason: tab === 'hold' && holdReasonFilter !== 'all' ? (holdReasonFilter as HoldReason) : undefined,
        cancelReason: tab === 'cancelled' && cancelReasonFilter !== 'all' ? (cancelReasonFilter as CancelReason) : undefined,
        stockStatus: tab === 'confirmed' && stockStatusFilter !== 'all' ? (stockStatusFilter as 'ready' | 'short') : undefined,
        search,
        dateFrom: from ?? undefined,
        dateTo: to ?? undefined,
        amountMin: advancedFilters.amountMin.trim() ? Number(advancedFilters.amountMin) : undefined,
        amountMax: advancedFilters.amountMax.trim() ? Number(advancedFilters.amountMax) : undefined,
        callAttemptsMin: advancedFilters.callAttemptsMin.trim() ? Number(advancedFilters.callAttemptsMin) : undefined,
        courierPartner: advancedFilters.courierPartner.trim() || undefined,
        sortKey: sort.key,
        sortDir: sort.dir,
        page: pageArg,
        pageSize,
      });
      setOrders(res.orders);
      setTotal(res.total);
    } catch {
      toast.push('Could not load orders.', 'info');
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    void loadStores();
    void loadCouriers();
    void loadStats();
    void listAllInventoryLevels()
      .then((levels) => setStockLevels(levels))
      .catch(() => {
        // The stock badges/mixed-order gating are a nice-to-have hint; the list still works without them.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    void loadOrders(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilter, tab, paymentFilter, holdReasonFilter, cancelReasonFilter, stockStatusFilter, dateRange, advancedFilters, search, sort, pageSize]);

  useEffect(() => {
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeFilter, statsDateRange, statsCustomRange, tab]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { from, to } = getRangeBounds(statsDateRange, statsCustomRange);
        const data = await getOrderStats({
          storeId: storeFilter !== 'all' ? storeFilter : undefined,
          dateFrom: from ?? undefined,
          dateTo: to ?? undefined,
        });
        const known = knownTabCountRef.current;
        if (known !== null && data.tabCounts[tab] > known) {
          setNewOrdersCount(data.tabCounts[tab] - known);
        }
      } catch {
        // Silent background nudge.
      }
    }, NEW_ORDERS_POLL_MS);
    return () => clearInterval(interval);
  }, [storeFilter, statsDateRange, statsCustomRange, tab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const storeById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
  const stockLookup = useMemo(() => (stockLevels ? buildStockLookup(stockLevels) : undefined), [stockLevels]);

  const refreshAll = () => {
    void loadStats();
    void loadOrders(page);
  };

  const handleImported = () => {
    void loadStores();
    refreshAll();
  };

  const goToPage = (next: number) => {
    setPage(next);
    setSelected(new Set());
    void loadOrders(next);
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === orders.length ? new Set() : new Set(orders.map((o) => o.id))));
  };

  const toggleSelect = (id: string, e: MouseEvent) => {
    e.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = async (ids: string[], patch: Parameters<typeof bulkUpdateOrders>[1], undoPatch?: Parameters<typeof bulkUpdateOrders>[1]) => {
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await bulkUpdateOrders(ids, patch);
      const successCount = res.results.filter((r) => r.success).length;
      const succeededIds = res.results.filter((r) => r.success).map((r) => r.orderId);
      setSelected(new Set());
      refreshAll();
      toast.push(
        `Updated ${successCount} of ${ids.length} order${ids.length === 1 ? '' : 's'}.`,
        'success',
        undoPatch && succeededIds.length > 0
          ? {
              duration: 6000,
              action: {
                label: 'Undo',
                onClick: () => {
                  void bulkUpdateOrders(succeededIds, undoPatch).then(() => {
                    toast.push('Reverted.');
                    refreshAll();
                  });
                },
              },
            }
          : undefined
      );
    } catch {
      toast.push('Bulk update failed.', 'info');
    } finally {
      setBulkBusy(false);
    }
  };

  // Same stock-check checkpoint as "Print & send to packing" (see PrintOrderModal), applied to
  // every place a Confirm click can happen — the bulk action bar, the command palette, the
  // fast-track banner, and even a single row's quick "Confirm order" — so a mixed or fully-short
  // order is never silently confirmed no matter which of those a staff member happens to use.
  // A clean selection (nothing mixed or fully out of stock) skips the popup entirely.
  const handleBulkConfirm = (ids: string[], undoPatch?: Parameters<typeof bulkUpdateOrders>[1]) => {
    if (ids.length === 0) return;
    const selectedForConfirm = orders.filter((o) => ids.includes(o.id));
    const { ready, mixed, fullyShort } = classifyOrdersByStock(selectedForConfirm, stockLookup);
    if (mixed.length === 0 && fullyShort.length === 0) {
      void runBulk(ids, { stage: 'Confirmed' }, undoPatch);
      return;
    }
    setConfirmPopupData({ ready, mixed, fullyShort });
  };

  const handleConfirmPopupProceed = async (resolution: BulkStockResolution) => {
    if (!confirmPopupData) return;
    setConfirmPopupBusy(true);
    try {
      // Splitting a Pending/Flagged order already confirms both halves in one call (see
      // splitOrder) — nothing further needed for those beyond the refresh below.
      await Promise.all(resolution.splitIds.map((id) => splitOrder(id)));
      const readyIds = confirmPopupData.ready.map((o) => o.id);
      const finalIds = [...readyIds, ...resolution.fullyShortProceedIds];
      setConfirmPopupData(null);
      if (finalIds.length > 0) {
        await runBulk(finalIds, { stage: 'Confirmed' });
      } else {
        setSelected(new Set());
        refreshAll();
        toast.push('Split complete.', 'success');
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not resolve those orders.', 'info');
    } finally {
      setConfirmPopupBusy(false);
    }
  };

  // Standalone "Send to packing" — same stock-check popup as "Print & send to packing"
  // (PrintOrderModal), but independent of printing entirely: sellers who don't print, or who print
  // separately from when packing actually starts, aren't forced through a print dialog to advance
  // Confirmed -> Processing.
  const handleBulkSendToPacking = (ids: string[]) => {
    if (ids.length === 0) return;
    const selectedForPacking = orders.filter((o) => ids.includes(o.id));
    const { ready, mixed, fullyShort } = classifyOrdersByStock(selectedForPacking, stockLookup);
    if (mixed.length === 0 && fullyShort.length === 0) {
      void runBulk(ids, { stage: 'Processing' });
      return;
    }
    setPackPopupData({ ready, mixed, fullyShort });
  };

  const handlePackPopupProceed = async (resolution: BulkStockResolution) => {
    if (!packPopupData) return;
    setPackPopupBusy(true);
    try {
      const splitResults = await Promise.all(resolution.splitIds.map((id) => splitOrder(id)));
      const readyIds = packPopupData.ready.map((o) => o.id);
      const finalIds = [...readyIds, ...splitResults.map((r) => r.original.id)];
      setPackPopupData(null);
      if (finalIds.length > 0) {
        await runBulk(finalIds, { stage: 'Processing' });
      } else {
        setSelected(new Set());
        refreshAll();
        toast.push('Split complete — nothing was ready to send to packing yet.', 'success');
      }
    } catch (err) {
      toast.push(err instanceof Error ? err.message : 'Could not resolve those orders.', 'info');
    } finally {
      setPackPopupBusy(false);
    }
  };

  // Folded into the order's own `note` field rather than a new dedicated field — no schema change,
  // and it shows up wherever an order's note already does (drawer, history). Only the parts staff
  // actually filled in appear; a rider pickup with no paperwork just logs the date.
  function composeHandoverNote(details: HandoverDetails): string {
    const parts = [`Handed to courier ${new Date(details.handoverAt).toLocaleString()}`];
    if (details.pickupPersonName) parts.push(`by ${details.pickupPersonName}`);
    if (details.pickupPersonPhone) parts.push(`(${details.pickupPersonPhone})`);
    let note = parts.join(' ');
    if (details.hvCode) note += ` — HV Code: ${details.hvCode}`;
    if (details.remark) note += ` — ${details.remark}`;
    return note;
  }

  const handleBulkMarkShipped = (details: HandoverDetails) => {
    setShipModalOpen(false);
    void runBulk(shippableSelectedIds, { stage: 'Shipped', note: composeHandoverNote(details) });
  };

  // Not part of the order patch schema either — a courier COD settlement is a batch payout that
  // doesn't map onto the normal stage/hold/cancel patch shape, so this goes through its own
  // dedicated bulk endpoint (bulkMarkPaymentCollected) rather than runBulk/bulkUpdateOrders.
  const handleBulkMarkCollected = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await bulkMarkPaymentCollected(ids);
      setSelected(new Set());
      refreshAll();
      // ids.length and modifiedCount should normally match (the frontend already filters to the
      // same Delivered/COD-Pending criteria the backend checks) — they can only diverge if an order
      // changed state between selecting it here and this request landing, so surface that when it happens.
      toast.push(
        res.modifiedCount === ids.length
          ? `Marked ${res.modifiedCount} order${res.modifiedCount === 1 ? '' : 's'} as collected.`
          : `Marked ${res.modifiedCount} of ${ids.length} selected orders as collected.`,
        'success'
      );
    } catch {
      toast.push('Could not mark those orders collected.', 'info');
    } finally {
      setBulkBusy(false);
    }
  };

  // Fills the admin.orders.index.bulk-action extension target's "Re-check fraud" button — its own
  // dedicated endpoint since it re-runs a heuristic, not a normal stage/hold/cancel patch.
  const handleBulkRecheckFraud = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await bulkRecheckFraud(ids);
      setSelected(new Set());
      refreshAll();
      toast.push(
        res.flaggedCount > 0
          ? `Flagged ${res.flaggedCount} of ${res.checked} checked order${res.checked === 1 ? '' : 's'} as suspicious.`
          : `Checked ${res.checked} order${res.checked === 1 ? '' : 's'} — none flagged.`,
        'success'
      );
    } catch {
      toast.push('Could not re-check those orders.', 'info');
    } finally {
      setBulkBusy(false);
    }
  };

  // Block/unblock aren't part of the order patch schema — blocking is a customer-level fact (by
  // phone), not a field on this one order — so they go through their own dedicated endpoints rather
  // than runBulk/bulkUpdateOrders.
  const handleToggleBlock = async (order: OrderDTO, next: boolean) => {
    try {
      if (next) await blockCustomer(order.id, null);
      else await unblockCustomer(order.id);
      refreshAll();
      toast.push(next ? 'Customer blocked — their future orders will be auto-cancelled.' : 'Customer unblocked.', 'success');
    } catch {
      toast.push('Could not update block status.', 'info');
    }
  };

  const downloadCsv = (ordersToExport: OrderDTO[], format: ExportFormat) => {
    const headers = ['Order ID', 'Customer', 'Phone', 'Product', 'Amount', 'Advance', 'Balance Due', 'Currency', 'Stage', 'Payment Method', 'Payment Status', 'Placed'];
    const rows = ordersToExport.map((o) => [
      o.number,
      o.customerName ?? '',
      o.customerPhone ?? '',
      o.lineItems[0]?.title ?? '',
      o.total,
      o.advanceAmount,
      Math.max(0, o.total - o.advanceAmount),
      o.currency,
      o.stage,
      o.paymentMethod,
      o.paymentStatus,
      o.createdAt,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    // Excel misreads plain UTF-8 CSV as Latin-1, mangling non-ASCII customer names — a leading
    // BOM is the standard fix and is what "CSV for Excel" actually means in practice.
    const content = format === 'excel' ? `﻿${csv}` : csv;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // "All orders matching filters" can span thousands of rows across many pages — pull them all
  // with the current filters/search/sort still applied, respecting the backend's page-size cap.
  const fetchAllMatching = async (): Promise<OrderDTO[]> => {
    const { from, to } = getRangeBounds(dateRange);
    const baseParams = {
      storeId: storeFilter,
      tab,
      paymentStatus: paymentFilter,
      holdReason: tab === 'hold' && holdReasonFilter !== 'all' ? (holdReasonFilter as HoldReason) : undefined,
      cancelReason: tab === 'cancelled' && cancelReasonFilter !== 'all' ? (cancelReasonFilter as CancelReason) : undefined,
      stockStatus: tab === 'confirmed' && stockStatusFilter !== 'all' ? (stockStatusFilter as 'ready' | 'short') : undefined,
      search,
      dateFrom: from ?? undefined,
      dateTo: to ?? undefined,
      amountMin: advancedFilters.amountMin.trim() ? Number(advancedFilters.amountMin) : undefined,
      amountMax: advancedFilters.amountMax.trim() ? Number(advancedFilters.amountMax) : undefined,
      callAttemptsMin: advancedFilters.callAttemptsMin.trim() ? Number(advancedFilters.callAttemptsMin) : undefined,
      courierPartner: advancedFilters.courierPartner.trim() || undefined,
      sortKey: sort.key,
      sortDir: sort.dir,
      pageSize: 100,
    };
    const all: OrderDTO[] = [];
    let fetchPage = 1;
    while (true) {
      const res = await listOrders({ ...baseParams, page: fetchPage });
      all.push(...res.orders);
      if (all.length >= res.total || res.orders.length === 0 || all.length >= 10_000) break;
      fetchPage += 1;
    }
    return all;
  };

  const handleExport = async (scope: ExportScope, format: ExportFormat) => {
    setExporting(true);
    try {
      let ordersToExport: OrderDTO[];
      if (scope === 'selected') ordersToExport = orders.filter((o) => selected.has(o.id));
      else if (scope === 'filtered') ordersToExport = await fetchAllMatching();
      else ordersToExport = orders;
      downloadCsv(ordersToExport, format);
      setExportModalOpen(false);
    } catch {
      toast.push('Export failed.', 'info');
    } finally {
      setExporting(false);
    }
  };

  // Bin lookup for bulk packing slips — fetched lazily since most bulk actions never need it.
  // Resolved per-order against each order's own fulfillmentWarehouseId (see binLookup.ts).
  const loadBinLookup = async () => {
    try {
      const levels = await listAllInventoryLevels();
      setBinLookup(buildBinLookup(levels));
    } catch {
      // Bin numbers are a nice-to-have on the packing slip; staff can still work without them.
    }
  };

  const selectedOrders = orders.filter((o) => selected.has(o.id));
  // Delivered/Partial Delivered only — a courier can't have settled cash for a parcel it hasn't
  // delivered yet, so a Processing/Shipped order in the selection is silently left out here (and
  // by the backend's own matching filter, as a second guard) rather than incorrectly offered.
  const collectibleSelectedIds = selectedOrders
    .filter((o) => o.paymentMethod === 'Cash on Delivery' && o.paymentStatus !== 'Collected' && ['Delivered', 'Partial Delivered'].includes(o.stage))
    .map((o) => o.id);
  // Fraud Checker's auto-flag heuristic only ever applies to still-Pending orders.
  const recheckableSelectedIds = selectedOrders.filter((o) => o.stage === 'Pending').map((o) => o.id);

  // Same reasoning as collectibleSelectedIds above — an action shouldn't be offered (or silently
  // applied) for orders it doesn't make sense for. Confirm only ever applies to Pending/Flagged;
  // Hold/Cancel already have their own per-stage eligibility rules (canHold/canCancel), same ones
  // the single-order drawer already gates its own buttons with. Splitting a mixed-stock order is
  // optional (see the drawer's split checkbox), so bulk-confirm doesn't exclude them — it behaves
  // exactly like a plain single-order confirm would (oversell policy decides Confirmed vs Flagged).
  const confirmableSelectedOrders = selectedOrders.filter((o) => o.stage === 'Pending' || o.stage === 'Flagged');
  const confirmableSelectedIds = confirmableSelectedOrders.map((o) => o.id);
  // Independent of printing — see BulkActionBar's onSendToPacking. Only Confirmed orders are
  // eligible; the stock-check popup (same one the print flow uses) decides what actually proceeds.
  const packableSelectedIds = selectedOrders.filter((o) => o.stage === 'Confirmed').map((o) => o.id);
  const holdableSelectedOrders = selectedOrders.filter((o) => canHold(o.stage));
  const holdableSelectedIds = holdableSelectedOrders.map((o) => o.id);
  const cancellableSelectedIds = selectedOrders.filter((o) => canCancel(o.stage)).map((o) => o.id);
  // Only orders actually in Processing can be marked Shipped — the fulfillment stock gate itself
  // is still enforced per-order by bulkUpdateOrders regardless, this just keeps the button from
  // offering itself at all when nothing selected is even at the right stage for it.
  const shippableSelectedOrders = selectedOrders.filter((o) => o.stage === 'Processing');
  const shippableSelectedIds = shippableSelectedOrders.map((o) => o.id);
  const shippableCourierSummary = (() => {
    const couriers = new Set(shippableSelectedOrders.map((o) => o.courierPartner ?? '').filter((c) => c !== ''));
    if (couriers.size === 0) return 'No courier set';
    if (couriers.size === 1) return [...couriers][0];
    return 'Multiple couriers';
  })();

  const copyOrderId = (order: OrderDTO, e: MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(order.number);
    setCopiedOrderId(order.id);
    setTimeout(() => setCopiedOrderId((id) => (id === order.id ? null : id)), 1200);
  };

  const copyPhone = (order: OrderDTO, e: MouseEvent) => {
    e.stopPropagation();
    if (!order.customerPhone) return;
    navigator.clipboard.writeText(order.customerPhone);
    setCopiedPhoneId(order.id);
    setTimeout(() => setCopiedPhoneId((id) => (id === order.id ? null : id)), 1200);
  };

  const handleTabChange = (nextTab: OrderTabKey) => {
    setTab(nextTab);
    setSort(defaultSortForTab(nextTab));
    if (nextTab !== 'hold') setHoldReasonFilter('all');
    if (nextTab !== 'cancelled') setCancelReasonFilter('all');
    if (nextTab !== 'confirmed') setStockStatusFilter('all');
  };

  const fastTrackIds = useMemo(() => (tab === 'pending' ? fastTrackEligibleIds(orders) : []), [tab, orders]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);
  const noFiltersActive =
    !search &&
    storeFilter === 'all' &&
    tab === 'all' &&
    paymentFilter === 'all' &&
    holdReasonFilter === 'all' &&
    cancelReasonFilter === 'all' &&
    stockStatusFilter === 'all' &&
    dateRange === 'all' &&
    activeAdvancedFilterCount(advancedFilters) === 0;

  const clearFilters = () => {
    setSearchInput('');
    setStoreFilter('all');
    handleTabChange('all');
    setPaymentFilter('all');
    setDateRange('all');
    setStatsDateRange('today');
    setStatsCustomRange(null);
    setAdvancedFilters(EMPTY_ADVANCED_FILTERS);
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-y-3 bg-white px-4 pt-4 lg:px-8 lg:pt-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">Orders</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums">
              {(stats?.totalOrders ?? total).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Track, manage and fulfill all your COD orders in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download size={14} /> Export
          </button>
          <button
            onClick={() => setCreateOrderOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={14} /> Create order
          </button>
        </div>
      </div>

      {storesLoading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Loading...</div>
      ) : stores.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
          <Package size={28} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-600">No orders yet</p>
          <p className="max-w-sm text-sm text-slate-400">Connect a Shopify or WooCommerce store and import your order history to see orders here.</p>
          <button
            onClick={() => navigate('/integrations')}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plug size={14} /> Go to Integrations
          </button>
        </div>
      ) : (
        <>
          {total === 0 && noFiltersActive && !ordersLoading ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
              <Package size={28} className="text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Nothing imported yet</p>
              <p className="max-w-sm text-sm text-slate-400">Click "Import orders" above on whichever store you want to pull in.</p>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 bg-white px-4 pb-3 pt-5 lg:px-8">
                {/* Status as flat underline tabs, not a dropdown or pill row — matches the pattern
                    Linear/GitHub/Stripe/Shopify all converge on for "filter one list by status,
                    show a live count" (see design-system references: joined pill tracks are for
                    segmented controls/settings toggles, not this). Every stage is one click away,
                    with its count right next to the label, nothing competing for visual weight. */}
                <div className="-mx-1 flex items-center gap-5 overflow-x-auto border-b border-slate-100 px-1 pb-3">
                  {ORDER_TABS.map((t) => {
                    const active = tab === t.key;
                    const count = stats?.tabCounts[t.key] ?? 0;
                    return (
                      <button
                        key={t.key}
                        onClick={() => handleTabChange(t.key)}
                        className={clsx(
                          'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap pb-2.5 pt-1 text-sm font-medium transition-colors',
                          active ? 'text-slate-900' : 'text-slate-500 hover:text-slate-700'
                        )}
                      >
                        {t.label}
                        <span
                          className={clsx(
                            'text-xs tabular-nums',
                            active
                              ? 'font-semibold text-slate-600'
                              : t.key === 'priority' && count > 0
                              ? 'font-semibold text-rose-600'
                              : 'text-slate-400'
                          )}
                        >
                          {count.toLocaleString()}
                        </span>
                        {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-slate-900" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <DateRangeMenu
                      value={statsDateRange}
                      onChange={setStatsDateRange}
                      customRange={statsCustomRange}
                      onCustomRangeChange={setStatsCustomRange}
                    />
                    <FilterMenu
                      icon={StoreIcon}
                      allLabel="All Channels"
                      value={storeFilter}
                      options={stores.map((s) => ({ value: s.id, label: s.displayName }))}
                      onChange={setStoreFilter}
                    />
                    {tab === 'hold' && (
                      <FilterMenu
                        icon={PhoneCall}
                        allLabel="All Hold Reasons"
                        value={holdReasonFilter}
                        options={ALL_HOLD_REASONS.map((r) => ({ value: r, label: r }))}
                        onChange={setHoldReasonFilter}
                      />
                    )}
                    {tab === 'cancelled' && (
                      <FilterMenu
                        icon={Ban}
                        allLabel="All Cancel Reasons"
                        value={cancelReasonFilter}
                        options={CANCEL_REASONS_FOR_FILTER.map((r) => ({ value: r, label: r }))}
                        onChange={setCancelReasonFilter}
                      />
                    )}
                    {tab === 'confirmed' && (
                      <FilterMenu
                        icon={Package}
                        allLabel="All Stock"
                        value={stockStatusFilter}
                        options={[
                          { value: 'ready', label: 'Ready to pack' },
                          { value: 'short', label: 'Short on stock' },
                        ]}
                        onChange={setStockStatusFilter}
                      />
                    )}
                    <FilterMenu
                      icon={CreditCard}
                      allLabel="All Payment Types"
                      value={paymentFilter}
                      options={PAYMENT_STATUSES.map((s) => ({ value: s, label: s }))}
                      onChange={setPaymentFilter}
                    />
                    <MoreFiltersMenu value={advancedFilters} onApply={setAdvancedFilters} />
                    {(!noFiltersActive || statsDateRange !== 'today') && (
                      <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                      >
                        <X size={12} /> Clear filters
                      </button>
                    )}
                  </div>
                  <div className="ml-auto flex items-center gap-3 border-l border-slate-200 pl-3">
                    <div className="relative w-64 sm:w-80">
                      <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        ref={searchRef}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search order #, customer, phone"
                        className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                      />
                    </div>
                    <Popover
                      align="right"
                      widthClass="w-44"
                      trigger={() => (
                        <div className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-slate-200/80 bg-white px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                          <span className="text-slate-400">Sort by:</span>
                          {SORT_OPTIONS.find((o) => o.key === sort.key && o.dir === sort.dir)?.label ?? 'Custom'}
                          <ChevronDown size={11} className="text-slate-400" />
                        </div>
                      )}
                    >
                      {(close: () => void) => (
                        <div className="py-1.5">
                          {SORT_OPTIONS.map((opt) => (
                            <button
                              key={opt.label}
                              onClick={() => {
                                setSort({ key: opt.key, dir: opt.dir });
                                close();
                              }}
                              className={clsx(
                                'flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-slate-50',
                                sort.key === opt.key && sort.dir === opt.dir ? 'font-semibold text-indigo-600' : 'text-slate-700'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </Popover>
                  </div>
                </div>
              </div>

              {tab !== 'priority' && (
                <PriorityCallsBanner count={stats?.tabCounts.priority ?? 0} onView={() => handleTabChange('priority')} />
              )}

              {newOrdersCount > 0 && (
                <button
                  onClick={refreshAll}
                  className="flex w-full animate-pop-in items-center justify-center gap-2 border-b border-indigo-100 bg-indigo-50 px-4 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                >
                  {newOrdersCount} new order{newOrdersCount === 1 ? '' : 's'} arrived. Click to refresh
                </button>
              )}

              <FastTrackBanner count={fastTrackIds.length} loading={bulkBusy} onConfirmAll={() => handleBulkConfirm(fastTrackIds)} />

              <div className={clsx('overflow-x-auto transition-opacity', ordersLoading && 'opacity-50')}>
                {ordersLoading && orders.length === 0 ? (
                  <TableSkeleton />
                ) : (
                  <table className="w-full min-w-[1100px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500">
                        <th className="w-10 px-4 py-2.5">
                          <input
                            type="checkbox"
                            checked={orders.length > 0 && selected.size === orders.length}
                            onChange={toggleSelectAll}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </th>
                        <th className="px-3 py-2.5">Order</th>
                        <th className="px-3 py-2.5">Customer</th>
                        <th className="px-3 py-2.5">Product</th>
                        <th className="px-3 py-2.5">Channel</th>
                        <th className="px-3 py-2.5">Amount</th>
                        <th className="px-3 py-2.5">Status</th>
                        <th className="px-3 py-2.5">Contact</th>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const store = storeById.get(order.storeId);
                        const meta = store ? PLATFORM_META[store.platform] : null;
                        const isSelected = selected.has(order.id);
                        const urgency =
                          order.stage === 'Pending' || order.stage === 'Flagged' ? pendingUrgency(ageMinutes(order.createdAt)) : 'normal';
                        // Only Confirmed orders get flagged here — that's the one stage where "no
                        // stock" is actually actionable right now (send to packing or not). A
                        // Pending/mixed order isn't a problem yet; it just hasn't been resolved,
                        // and gets caught by the confirm-time popup instead of cluttering the list.
                        const stockSummary = order.stage === 'Confirmed' && stockLookup ? summarizeOrderStock(order.lineItems, stockLookup) : null;
                        const isShortConfirmed = Boolean(stockSummary && stockSummary.shortCount > 0);
                        const isClaimedByOther = Boolean(order.claimedBy && order.claimedBy.userId !== user?.id);
                        return (
                          <tr
                            key={order.id}
                            onClick={() => setActiveOrder(order)}
                            className={clsx(
                              'cursor-pointer border-b border-l-4 border-slate-100 transition-colors hover:bg-slate-50',
                              isShortConfirmed ? 'border-l-rose-400 bg-rose-50/50 hover:bg-rose-50/70' : 'border-l-transparent',
                              !isShortConfirmed && isSelected && 'bg-indigo-50/50',
                              isClaimedByOther && 'bg-slate-50/80 opacity-60 grayscale-[30%] hover:bg-slate-50/80'
                            )}
                          >
                            <td className="px-4 py-3" onClick={(e) => toggleSelect(order.id, e)}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {}}
                                className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            </td>
                            <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                {order.isPriorityCall && (
                                  <span title={order.priorityNote ?? 'Marked as priority call'} className="text-orange-500">
                                    <PhoneCall size={13} />
                                  </span>
                                )}
                                {order.isCustomerBlocked && (
                                  <span title="This customer is blocked" className="text-rose-500">
                                    <UserX size={13} />
                                  </span>
                                )}
                                {user?.installedPlugins?.includes('fraudChecker') && order.stage === 'Flagged' && (
                                  <span title={order.flagReason ?? 'Flagged by ZetSales Order Risk Checker'} className="text-rose-500">
                                    <ShieldAlert size={13} />
                                  </span>
                                )}
                                <AppBlock target="admin.orders.index.row-badge" context={{ orderId: order.id }} />
                                {order.number}
                                <button onClick={(e) => copyOrderId(order, e)} title="Copy order ID" className="text-slate-300 hover:text-slate-500">
                                  {copiedOrderId === order.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <p className="font-medium text-slate-700">{order.customerName || 'No name'}</p>
                              {order.customerPhone && (
                                <div className="flex items-center gap-1">
                                  <p className="text-xs text-slate-400">{order.customerPhone}</p>
                                  <button
                                    onClick={(e) => copyPhone(order, e)}
                                    title="Copy phone number"
                                    className="text-slate-300 hover:text-slate-500"
                                  >
                                    {copiedPhoneId === order.id ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
                                  </button>
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {order.customerPhone && (
                                  <span
                                    title={order.isReturningCustomer ? 'This customer has ordered before' : "This is the customer's first order"}
                                    className={clsx(
                                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                                      order.isReturningCustomer ? 'bg-blue-50 text-blue-600 ring-blue-600/20' : 'bg-emerald-50 text-emerald-600 ring-emerald-600/20'
                                    )}
                                  >
                                    {order.isReturningCustomer ? 'Returning' : 'New'}
                                  </span>
                                )}
                                {user?.installedPlugins?.includes('fraudChecker') && order.riskLabel && (
                                  <span
                                    title={`${order.riskLabel} — ${order.riskSuccessRate}% delivery success with Steadfast/Pathao`}
                                    className={clsx(
                                      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset',
                                      order.riskLabel === 'Trusted'
                                        ? 'bg-violet-50 text-violet-600 ring-violet-600/20'
                                        : order.riskLabel === 'Risky'
                                          ? 'bg-rose-50 text-rose-600 ring-rose-600/20'
                                          : 'bg-slate-100 text-slate-500 ring-slate-500/10'
                                    )}
                                  >
                                    {order.riskLabel} {order.riskSuccessRate}%
                                  </span>
                                )}
                                {isClaimedByOther && order.claimedBy && (
                                  <span
                                    title={`${order.claimedBy.email} is currently calling this customer`}
                                    className={clsx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset', CLAIM_TONE)}
                                  >
                                    <Lock size={9} /> {order.claimedBy.email.split('@')[0]}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <OrderProductsCell lineItems={order.lineItems} currency={order.currency} />
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              {meta && store && (
                                <span className="inline-flex items-center gap-1.5 text-slate-600">
                                  <meta.logo size={18} className="shrink-0 rounded" />
                                  {store.displayName}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-3 font-medium tabular-nums text-slate-800 whitespace-nowrap">
                              {order.currency} {order.total.toLocaleString()}
                              <p className="text-xs font-normal text-slate-400">{PAYMENT_METHOD_SHORT[order.paymentMethod]}</p>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <span className={clsx('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', STAGE_TONE[order.stage])}>
                                  {STAGE_LABEL[order.stage]}
                                </span>
                                {isShortConfirmed && stockSummary && (
                                  <span
                                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white"
                                    title={stockSummary.shortItems.map((s) => `${s.title}: only ${s.free} free of ${s.quantity}`).join(', ')}
                                  >
                                    <span className="text-[9px] font-bold leading-none">!</span>
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              {order.customerPhone ? (
                                <div className="flex items-center gap-1">
                                  <a href={telLink(order.customerPhone)} title="Call" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600">
                                    <Phone size={14} />
                                  </a>
                                  <a
                                    href={waLink(order.customerPhone)}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="WhatsApp"
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600"
                                  >
                                    <MessageCircle size={14} />
                                  </a>
                                </div>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <p
                                className={clsx(
                                  urgency === 'critical' ? 'font-semibold text-rose-600' : urgency === 'warn' ? 'font-medium text-amber-600' : 'text-slate-700'
                                )}
                              >
                                {formatAbsoluteDateTime(order.createdAt)}
                              </p>
                              <p className="text-xs text-slate-400">{relativeDayLabel(order.createdAt)}</p>
                            </td>
                            <td className="px-3 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <RowActionsMenu
                                order={order}
                                onView={() => setActiveOrder(order)}
                                onConfirm={() => handleBulkConfirm([order.id], { stage: order.stage })}
                                onCancel={(reason: CancelReason) =>
                                  void runBulk([order.id], { stage: 'Cancelled', cancelReason: reason, note: null }, { stage: order.stage })
                                }
                                onTogglePriority={(next) =>
                                  void runBulk(
                                    [order.id],
                                    { isPriorityCall: next, priorityNote: null },
                                    { isPriorityCall: order.isPriorityCall, priorityNote: order.priorityNote }
                                  )
                                }
                                onToggleBlock={(next) => void handleToggleBlock(order, next)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {!ordersLoading && orders.length === 0 && <div className="py-16 text-center text-sm text-slate-400">No orders match your filters.</div>}
              </div>

              {total > 0 && (
                <Pagination
                  page={page}
                  totalPages={totalPages}
                  total={total}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                  pageSize={pageSize}
                  loading={ordersLoading}
                  onGoToPage={goToPage}
                  onPageSizeChange={(size) => setPageSize(size)}
                />
              )}
            </>
          )}
        </>
      )}

      <BulkActionBar
        count={selected.size}
        busy={bulkBusy}
        onClear={() => setSelected(new Set())}
        onConfirm={confirmableSelectedIds.length > 0 ? () => handleBulkConfirm(confirmableSelectedIds) : undefined}
        onMarkShipped={shippableSelectedIds.length > 0 ? () => setShipModalOpen(true) : undefined}
        onSendToPacking={packableSelectedIds.length > 0 ? () => handleBulkSendToPacking(packableSelectedIds) : undefined}
        onHold={
          holdableSelectedIds.length > 0
            ? (reason, note, rescheduledFor) => void runBulk(holdableSelectedIds, { stage: 'On Hold', holdReason: reason as HoldReason, note: note || null, rescheduledFor })
            : undefined
        }
        onCancel={
          cancellableSelectedIds.length > 0
            ? (reason, note) => void runBulk(cancellableSelectedIds, { stage: 'Cancelled', cancelReason: reason as CancelReason, note: note || null })
            : undefined
        }
        onMarkCollected={collectibleSelectedIds.length > 0 ? () => void handleBulkMarkCollected(collectibleSelectedIds) : undefined}
        onRecheckFraud={
          user?.installedPlugins?.includes('fraudChecker') && recheckableSelectedIds.length > 0
            ? () => void handleBulkRecheckFraud(recheckableSelectedIds)
            : undefined
        }
        holdReasons={holdReasonsForMany(holdableSelectedOrders.map((o) => o.stage))}
        onPrintInvoices={() => setPrintDocType('invoice')}
        onPrintPackingSlips={() => {
          void loadBinLookup();
          setPrintDocType('packingSlip');
        }}
        onPrintCombined={() => {
          void loadBinLookup();
          setPrintDocType('combined');
        }}
        onPrintLabels={() => setLabelModalOpen(true)}
      />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelectTab={setTab}
        onOpenOrder={setActiveOrder}
        onClearFilters={clearFilters}
        onFocusSearch={() => searchRef.current?.focus()}
        selectedCount={confirmableSelectedIds.length}
        onBulkConfirmSelected={() => handleBulkConfirm(confirmableSelectedIds)}
      />

      <OrderDetailDrawer
        order={activeOrder}
        store={activeOrder ? storeById.get(activeOrder.storeId) ?? null : null}
        couriers={couriers}
        onClose={() => setActiveOrder(null)}
        onUpdated={refreshAll}
      />
      <PrintOrderModal
        open={printDocType !== null}
        onClose={() => setPrintDocType(null)}
        orders={selectedOrders}
        docType={printDocType ?? 'invoice'}
        binLookup={binLookup}
        stockLookup={stockLookup}
        onOrdersProcessed={refreshAll}
      />
      <CourierLabelModal open={labelModalOpen} onClose={() => setLabelModalOpen(false)} orders={selectedOrders} />
      <BulkShipModal
        open={shipModalOpen}
        count={shippableSelectedIds.length}
        courierSummary={shippableCourierSummary}
        busy={bulkBusy}
        onClose={() => setShipModalOpen(false)}
        onSubmit={handleBulkMarkShipped}
      />
      <ImportOrdersModal store={importTarget} onClose={() => setImportTarget(null)} onImported={handleImported} />
      <ExportOrdersModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        pageCount={orders.length}
        filteredCount={total}
        selectedCount={selected.size}
        hasActiveFilters={!noFiltersActive}
        exporting={exporting}
        onExport={(scope, format) => void handleExport(scope, format)}
      />
      <CreateOrderModal
        open={createOrderOpen}
        onClose={() => setCreateOrderOpen(false)}
        stores={stores}
        onCreated={(order) => {
          setCreateOrderOpen(false);
          refreshAll();
          setActiveOrder(order);
        }}
      />
      <BulkStockPopup
        open={confirmPopupData !== null}
        mode="confirm"
        mixedOrders={confirmPopupData?.mixed ?? []}
        fullyShortOrders={confirmPopupData?.fullyShort ?? []}
        readyCount={confirmPopupData?.ready.length ?? 0}
        stockLookup={stockLookup}
        busy={confirmPopupBusy}
        onClose={() => setConfirmPopupData(null)}
        onProceed={(resolution) => void handleConfirmPopupProceed(resolution)}
      />
      <BulkStockPopup
        open={packPopupData !== null}
        mode="pack"
        mixedOrders={packPopupData?.mixed ?? []}
        fullyShortOrders={packPopupData?.fullyShort ?? []}
        readyCount={packPopupData?.ready.length ?? 0}
        stockLookup={stockLookup}
        busy={packPopupBusy}
        onClose={() => setPackPopupData(null)}
        onProceed={(resolution) => void handlePackPopupProceed(resolution)}
      />
    </div>
  );
}
