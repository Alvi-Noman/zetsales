import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  Check,
  FileText,
  Package,
  Printer,
  RotateCcw,
  Search,
  ShoppingCart,
  Tags,
  Truck,
  X,
} from "lucide-react";
import type { OrderDTO } from "@zetsales/shared";
import {
  bulkUpdateOrders,
  getBrandingSettings,
  getOrderInventorySnapshot,
  listOrders,
  listPurchaseOrders,
  listReadyToPrintOrders,
  listWarehouses,
  type InventoryLevelDTO,
  type PurchaseOrderDTO,
  type PurchaseOrderStatus,
  type WarehouseDTO,
} from "../../lib/commerceApi";
import { CourierLabelModal } from "../../components/orders/CourierLabelModal";
import {
  DocumentPage,
  PrintOrderModal,
  type InvoiceFormat,
  type PrintDocType,
} from "../../components/orders/PrintOrderModal";
import { STAGE_LABEL, STAGE_TONE } from "../../components/orders/orderTone";
import { formatAbsoluteDateTime } from "../../components/orders/time";
import {
  buildBinLookup,
  type BinLookup,
} from "../../components/orders/binLookup";
import { PrintPurchaseOrderModal } from "../../components/supplyChain/PrintPurchaseOrderModal";
import { Select } from "../../components/ui/Select";
import { useToast } from "../../components/ui/ToastProvider";
import { ageLabel } from "../inventory/InventoryPage";
import classicPdf from "../../assets/PDFs/Classic.pdf";
import modernPdf from "../../assets/PDFs/Modern.pdf";
import minimalPdf from "../../assets/PDFs/Minimal.pdf";
import compactPdf from "../../assets/PDFs/Compact.pdf";
import retailPdf from "../../assets/PDFs/Retail.pdf";
import statementPdf from "../../assets/PDFs/Statement.pdf";

// Saved, real print output for each format (see apps/mainapp/src/assets/PDFs) — shown directly in
// the picker's preview panel instead of re-rendering the React component, since these are the
// actual files that came out of printing, not a live approximation of them. Re-save the matching
// file here whenever a format's design changes, or this preview will drift from what actually
// prints.
const FORMAT_PDF_URLS: Record<InvoiceFormat, string> = {
  Classic: classicPdf,
  Modern: modernPdf,
  Minimal: minimalPdf,
  Compact: compactPdf,
  Retail: retailPdf,
  Statement: statementPdf,
};

type PrintTask =
  | "invoice"
  | "packingSlip"
  | "combined"
  | "courierLabel"
  | "purchaseOrder";
type PackingPrintSource = "packing" | "readyForPickup" | "both";

const PRINT_TASKS: {
  key: PrintTask;
  title: string;
  detail: string;
  icon: typeof FileText;
}[] = [
  {
    key: "invoice",
    title: "Only Print Invoice",
    detail: "Packing and ready-for-pickup orders that need invoices.",
    icon: FileText,
  },
  {
    key: "packingSlip",
    title: "Print Packing Slip",
    detail: "Packing and ready-for-pickup orders, for warehouse picking.",
    icon: Package,
  },
  {
    key: "combined",
    title: "Print Invoice + Slip",
    detail: "Packing and ready-for-pickup orders with both pages.",
    icon: Printer,
  },
  {
    key: "courierLabel",
    title: "Print Courier Label",
    detail: "Ready-for-pickup parcels that need shipping labels.",
    icon: Tags,
  },
  {
    key: "purchaseOrder",
    title: "Print Purchase Orders",
    detail: "Supplier purchase order documents.",
    icon: ShoppingCart,
  },
];

const ORDER_DOC_TYPE: Partial<Record<PrintTask, PrintDocType>> = {
  invoice: "invoice",
  packingSlip: "packingSlip",
  combined: "combined",
};

const PO_STATUS_OPTIONS: {
  value: PurchaseOrderStatus | "all";
  label: string;
}[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "partially_received", label: "Partially received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

const PACKING_SOURCE_OPTIONS: { value: PackingPrintSource; label: string }[] = [
  { value: "packing", label: "Source: Packing" },
  { value: "readyForPickup", label: "Source: Ready for pickup" },
  { value: "both", label: "Source: Packing + Ready" },
];

const INVOICE_FORMATS: {
  value: InvoiceFormat;
  detail: string;
}[] = [
  {
    value: "Classic",
    detail: "Traditional invoice with familiar totals and line-item spacing.",
  },
  {
    value: "Modern",
    detail: "Sharper header, stronger hierarchy, and cleaner sections.",
  },
  {
    value: "Minimal",
    detail: "Quiet layout with only the essentials brought forward.",
  },
  {
    value: "Compact",
    detail: "Dense spacing for batch printing and shorter paper trails.",
  },
  {
    value: "Retail",
    detail: "Receipt-like emphasis for customer-facing parcels.",
  },
  {
    value: "Statement",
    detail: "Balanced invoice with a strong filled table heading.",
  },
];

const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

const PO_STATUS_TONE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-600 ring-slate-200",
  sent: "bg-indigo-50 text-indigo-700 ring-indigo-100",
  partially_received: "bg-amber-50 text-amber-700 ring-amber-100",
  received: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  cancelled: "bg-rose-50 text-rose-700 ring-rose-100",
};

function orderMoney(order: OrderDTO) {
  return `${order.currency} ${order.total.toLocaleString()}`;
}

function poMoney(value: number) {
  return `BDT ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function itemCount(order: OrderDTO) {
  return order.lineItems.reduce((sum, item) => sum + item.quantity, 0);
}

function printCode(order: OrderDTO) {
  return order.invoiceNo ?? order.number;
}

// No backend exists for a saved default invoice format (that's the separate, backend-persisted
// InvoiceTemplateDTO/print-templates system) — persisting to localStorage is the cheapest way to
// survive a page refresh without inventing that infrastructure. Guarded against a stale/renamed
// value ever getting stuck in a user's browser.
const INVOICE_FORMAT_STORAGE_KEY = "zs:printOut:invoiceFormat";

function readStoredInvoiceFormat(): InvoiceFormat {
  const stored = localStorage.getItem(INVOICE_FORMAT_STORAGE_KEY);
  return INVOICE_FORMATS.some((format) => format.value === stored)
    ? (stored as InvoiceFormat)
    : "Classic";
}

export function PrintOutPage() {
  const toast = useToast();
  const [task, setTask] = useState<PrintTask>("invoice");
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [binLookup, setBinLookup] = useState<BinLookup | undefined>(undefined);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [invoiceFormatModalOpen, setInvoiceFormatModalOpen] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [markingReadyForPickup, setMarkingReadyForPickup] = useState(false);
  const [printingPo, setPrintingPo] = useState<PurchaseOrderDTO | null>(null);
  const [invoiceFormat, setInvoiceFormat] = useState<InvoiceFormat>(
    readStoredInvoiceFormat,
  );
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [packingSource, setPackingSource] =
    useState<PackingPrintSource>("packing");
  const [poStatus, setPoStatus] = useState<PurchaseOrderStatus | "all">("all");
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);

  const loadSupportData = async () => {
    try {
      const warehouseRes = await listWarehouses();
      setWarehouses(warehouseRes.warehouses);
    } catch {
      toast.push("Could not load print settings.", "info");
    }
  };

  const loadTaskRows = async (nextTask = task) => {
    setLoading(true);
    try {
      if (nextTask === "purchaseOrder") {
        const res = await listPurchaseOrders({
          status: poStatus,
          pageSize: 100,
        });
        setPurchaseOrders(res.purchaseOrders);
        setOrders([]);
        setSelectedIds(new Set());
        return;
      }

      const res =
        nextTask === "invoice"
          ? await listReadyToPrintOrders(packingSource)
          : nextTask === "courierLabel"
            ? await listOrders({
                tab: "courierBooked",
                sortKey: "date",
                sortDir: "asc",
                pageSize: 100,
              })
            : await listPackingPrintableOrders(packingSource);

      setOrders(res.orders);
      setPurchaseOrders([]);
      setSelectedIds(new Set(res.orders.map((order) => order.id)));
    } catch {
      toast.push("Could not load printable rows.", "info");
      setOrders([]);
      setPurchaseOrders([]);
      setSelectedIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSupportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadTaskRows(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task, poStatus, packingSource]);

  const activeTask = PRINT_TASKS.find((item) => item.key === task)!;
  const isPurchaseTask = task === "purchaseOrder";
  const isCourierLabelTask = task === "courierLabel";
  const isPackingPrintTask = task === "packingSlip" || task === "combined";
  const isInvoiceTask = task === "invoice";

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasActiveFilters =
    search.trim() !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    warehouseFilter !== "all" ||
    (isPurchaseTask && poStatus !== "all");
  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setWarehouseFilter("all");
    setPoStatus("all");
  };

  const dateInRange = (iso: string) => {
    const createdAt = new Date(iso);
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(`${dateTo}T23:59:59.999`) : null;
    if (from && createdAt < from) return false;
    if (to && createdAt > to) return false;
    return true;
  };

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((order) => {
      if (
        warehouseFilter === "unassigned" &&
        order.fulfillmentWarehouseId !== null
      )
        return false;
      if (
        warehouseFilter !== "all" &&
        warehouseFilter !== "unassigned" &&
        order.fulfillmentWarehouseId !== warehouseFilter
      )
        return false;
      if (!dateInRange(order.createdAt)) return false;
      if (query) {
        const haystack = [
          order.invoiceNo,
          order.number,
          order.customerName,
          order.customerPhone,
          order.customerAltPhone,
          order.courierPartner,
          order.courierTrackingId,
          order.courierConsignmentId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search, dateFrom, dateTo, warehouseFilter]);

  const filteredPurchaseOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (warehouseFilter !== "all" && po.warehouseId !== warehouseFilter)
        return false;
      if (!dateInRange(po.createdAt)) return false;
      if (query) {
        const haystack =
          `${po.poNumber} ${po.supplierName} ${po.warehouseName}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseOrders, search, dateFrom, dateTo, warehouseFilter]);

  const visibleIds = isPurchaseTask
    ? filteredPurchaseOrders.map((po) => po.id)
    : filteredOrders.map((order) => order.id);
  const selectedVisibleCount = visibleIds.filter((id) =>
    selectedIds.has(id),
  ).length;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const selectedOrders = orders.filter((order) => selectedIds.has(order.id));

  const toggleSelectAllVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      visibleIds.forEach((id) => {
        if (allVisibleSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const handlePrimaryPrint = async () => {
    if (isPurchaseTask) {
      const selectedPo = purchaseOrders.find((po) => selectedIds.has(po.id));
      if (selectedPo) setPrintingPo(selectedPo);
      return;
    }
    if (isCourierLabelTask) {
      setLabelModalOpen(true);
      return;
    }
    setPreparingPrint(true);
    try {
      const snapshots = await Promise.all(
        selectedOrders.map((order) =>
          getOrderInventorySnapshot(order.id)
            .then((res) => res.levels)
            .catch(() => [] as InventoryLevelDTO[]),
        ),
      );
      setBinLookup(buildBinLookup(snapshots.flat()));
    } catch {
      setBinLookup(undefined);
      toast.push("Could not load shelf bins for these orders.", "info");
    } finally {
      setPreparingPrint(false);
    }
    setOrderModalOpen(true);
  };

  // Both the invoice tab and packing-slip/combined tasks share the same packing/readyForPickup/
  // both source selector, so their lists can include Ready for Pickup orders too — only the
  // Processing-stage ones within the current selection are actually eligible for this transition.
  const readyForPickupEligible = selectedOrders.filter(
    (order) => order.stage === "Processing",
  );

  const handleReadyForPickup = async () => {
    const ids = readyForPickupEligible.map((order) => order.id);
    if (ids.length === 0) return;
    setMarkingReadyForPickup(true);
    try {
      const res = await bulkUpdateOrders(ids, { stage: "Ready for Pickup" });
      const successCount = res.results.filter((r) => r.success).length;
      toast.push(
        `Marked ${successCount} of ${ids.length} order${ids.length === 1 ? "" : "s"} ready for pickup.`,
        successCount > 0 ? "success" : "info",
      );
      setSelectedIds(new Set());
      void loadTaskRows(task);
    } catch {
      toast.push("Could not mark orders ready for pickup.", "info");
    } finally {
      setMarkingReadyForPickup(false);
    }
  };

  const selectedPoCount = purchaseOrders.filter((po) =>
    selectedIds.has(po.id),
  ).length;
  const primaryPrintDisabled = isPurchaseTask
    ? selectedPoCount !== 1
    : selectedOrders.length === 0;
  const docType = ORDER_DOC_TYPE[task] ?? "invoice";

  return (
    <div className="zs-page">
      <div className="zs-page-header flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="zs-page-title">Print Out</h1>
          <p className="zs-page-description">
            Choose what you need to print first; the list below will only show
            matching records.
          </p>
        </div>
        <button
          onClick={() => void loadTaskRows(task)}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      <div className="border-b border-slate-200 bg-white px-4 py-4 lg:px-8">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {PRINT_TASKS.map((item) => {
            const Icon = item.icon;
            const active = task === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setTask(item.key)}
                className={clsx(
                  "min-h-[104px] rounded-lg border p-3 text-left transition",
                  active
                    ? "border-indigo-300 bg-indigo-50 ring-2 ring-indigo-500/10"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                )}
              >
                <span
                  className={clsx(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    active
                      ? "bg-white text-indigo-700"
                      : "bg-slate-100 text-slate-500",
                  )}
                >
                  <Icon size={17} />
                </span>
                <span className="mt-3 block text-sm font-bold text-slate-900">
                  {item.title}
                </span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  {item.detail}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <div>
              <p className="text-sm font-bold text-slate-900">
                {activeTask.title}
              </p>
              <p className="text-xs text-slate-500">{activeTask.detail}</p>
            </div>
          </div>

          <div className="zs-toolbox-right">
            {(isPackingPrintTask || isInvoiceTask) && (
              <Select
                value={packingSource}
                onChange={(value) =>
                  setPackingSource(value as PackingPrintSource)
                }
                options={PACKING_SOURCE_OPTIONS}
              />
            )}
            {isInvoiceTask && (
              <button
                type="button"
                onClick={() => setInvoiceFormatModalOpen(true)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              >
                <FileText size={14} /> Invoice Format: {invoiceFormat}
              </button>
            )}
            {isPurchaseTask && (
              <Select
                value={poStatus}
                onChange={(value) =>
                  setPoStatus(value as PurchaseOrderStatus | "all")
                }
                options={PO_STATUS_OPTIONS}
              />
            )}
            {(isInvoiceTask || isPackingPrintTask) &&
              packingSource !== "readyForPickup" && (
              <button
                type="button"
                onClick={() => void handleReadyForPickup()}
                disabled={
                  readyForPickupEligible.length === 0 || markingReadyForPickup
                }
                className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Truck size={14} />
                {markingReadyForPickup
                  ? "Updating..."
                  : `Ready for pickup (${readyForPickupEligible.length})`}
              </button>
            )}
            <button
              onClick={() => void handlePrimaryPrint()}
              disabled={primaryPrintDisabled || preparingPrint}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer size={14} />
              {preparingPrint
                ? "Preparing..."
                : isPurchaseTask
                ? "Print selected PO"
                : `Print (${selectedOrders.length})`}
            </button>
          </div>
        </div>

        <div className="zs-toolbox-row mt-3">
          <div className="zs-toolbox-left">
            <Select
              value={warehouseFilter}
              onChange={setWarehouseFilter}
              options={[
                { value: "all", label: "All warehouses" },
                ...warehouses.map((warehouse) => ({
                  value: warehouse.id,
                  label: warehouse.name,
                })),
                ...(isPurchaseTask
                  ? []
                  : [{ value: "unassigned", label: "Unassigned" }]),
              ]}
            />
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-indigo-400"
            />
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-slate-500 hover:bg-slate-100"
              >
                <X size={14} /> Clear
              </button>
            )}
          </div>
          <div className="zs-toolbox-right">
            <div className="zs-search sm:w-[28rem]">
              <Search
                size={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  isPurchaseTask
                    ? "Search PO, supplier, warehouse"
                    : "Search bill, order, customer, phone, tracking"
                }
                className="zs-search-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-72 items-center justify-center text-sm text-slate-400">
            Loading printable records...
          </div>
        ) : isPurchaseTask ? (
          <section className="min-w-[880px]">
            {filteredPurchaseOrders.length === 0 ? (
              <EmptyState
                title="No purchase orders found"
                detail="Change the filters or create a purchase order from Supply Chain."
              />
            ) : (
              <>
                <SelectionBar
                  selected={selectedVisibleCount}
                  total={filteredPurchaseOrders.length}
                  checked={allVisibleSelected}
                  onToggle={toggleSelectAllVisible}
                  helper="Select exactly one PO to print from the top button, or use the row print action."
                />
                <div className="grid grid-cols-[44px_1.1fr_1.1fr_1fr_0.8fr_0.8fr_120px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span />
                  <span>PO</span>
                  <span>Supplier</span>
                  <span>Warehouse</span>
                  <span>Status</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Action</span>
                </div>
                <div className="zs-table-body">
                  {filteredPurchaseOrders.map((po) => (
                    <div
                      key={po.id}
                      className="zs-data-row grid grid-cols-[44px_1.1fr_1.1fr_1fr_0.8fr_0.8fr_120px] items-center px-4 py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(po.id)}
                        onChange={() => toggleSelected(po.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <div>
                        <p className="font-bold text-slate-900">
                          {po.poNumber}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatAbsoluteDateTime(po.createdAt)}
                        </p>
                      </div>
                      <p className="truncate font-medium text-slate-700">
                        {po.supplierName}
                      </p>
                      <p className="truncate text-slate-600">
                        {po.warehouseName}
                      </p>
                      <span
                        className={clsx(
                          "w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                          PO_STATUS_TONE[po.status],
                        )}
                      >
                        {PO_STATUS_LABEL[po.status]}
                      </span>
                      <p className="text-right font-bold tabular-nums text-slate-900">
                        {poMoney(po.total)}
                      </p>
                      <button
                        onClick={() => setPrintingPo(po)}
                        className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Printer size={13} /> Print
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="min-w-[900px]">
            {filteredOrders.length === 0 ? (
              <EmptyState
                title="No matching orders found"
                detail="This print task only shows orders in its matching stage."
              />
            ) : (
              <>
                <SelectionBar
                  selected={selectedVisibleCount}
                  total={filteredOrders.length}
                  checked={allVisibleSelected}
                  onToggle={toggleSelectAllVisible}
                  helper={
                    isCourierLabelTask
                      ? "Ready-for-pickup parcels only."
                      : isPackingPrintTask || isInvoiceTask
                        ? packingSource === "packing"
                          ? "Packing orders only."
                          : packingSource === "readyForPickup"
                            ? "Ready-for-pickup orders only."
                            : "Packing and ready-for-pickup orders."
                        : "Selected rows will print together."
                  }
                />
                <div className="grid grid-cols-[44px_1fr_1.3fr_0.9fr_0.7fr_0.8fr_0.8fr] border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span />
                  <span>Bill / Order</span>
                  <span>Customer</span>
                  <span>{isCourierLabelTask ? "Courier" : "Stage"}</span>
                  <span className="text-right">Items</span>
                  <span className="text-right">Total</span>
                  <span className="text-right">Waiting</span>
                </div>
                <div className="zs-table-body">
                  {filteredOrders.map((order) => (
                    <div
                      key={order.id}
                      className="zs-data-row grid grid-cols-[44px_1fr_1.3fr_0.9fr_0.7fr_0.8fr_0.8fr] items-center px-4 py-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelected(order.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900">
                          {printCode(order)}
                        </p>
                        {order.invoiceNo ? (
                          <p className="truncate text-xs text-slate-400">
                            Order {order.number}
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400">
                            Bill no issued on print
                          </p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-800">
                          {order.customerName ?? "Unknown customer"}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {order.customerPhone ?? "No phone"}
                        </p>
                      </div>
                      {isCourierLabelTask ? (
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700">
                            {order.courierPartner ?? "Courier"}
                          </p>
                          <p className="truncate text-xs text-slate-400">
                            {order.courierTrackingId ??
                              order.courierConsignmentId ??
                              "No tracking yet"}
                          </p>
                        </div>
                      ) : (
                        <span
                          className={clsx(
                            "w-fit rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
                            STAGE_TONE[order.stage],
                          )}
                        >
                          {STAGE_LABEL[order.stage]}
                        </span>
                      )}
                      <p className="text-right tabular-nums text-slate-600">
                        {itemCount(order)}
                      </p>
                      <p className="text-right font-bold tabular-nums text-slate-900">
                        {orderMoney(order)}
                      </p>
                      <p className="text-right text-xs text-slate-400">
                        {ageLabel(order.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        )}
      </div>

      <PrintOrderModal
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        orders={selectedOrders}
        docType={docType}
        binLookup={binLookup}
        template={null}
        invoiceStyle={invoiceFormat}
        paperSize="A4"
      />
      <InvoiceFormatModal
        open={invoiceFormatModalOpen}
        selected={invoiceFormat}
        onSave={(format) => {
          setInvoiceFormat(format);
          localStorage.setItem(INVOICE_FORMAT_STORAGE_KEY, format);
          setInvoiceFormatModalOpen(false);
        }}
        onClose={() => setInvoiceFormatModalOpen(false)}
      />
      <CourierLabelModal
        open={labelModalOpen}
        onClose={() => setLabelModalOpen(false)}
        orders={selectedOrders}
      />
      <PrintPurchaseOrderModal
        open={printingPo !== null}
        onClose={() => setPrintingPo(null)}
        purchaseOrder={printingPo}
      />
    </div>
  );
}

async function listPackingPrintableOrders(
  source: PackingPrintSource,
): Promise<{ orders: OrderDTO[] }> {
  const loadPacking = () =>
    listOrders({
      tab: "processing",
      sortKey: "date",
      sortDir: "asc",
      pageSize: 100,
    });
  const loadReadyForPickup = () =>
    listOrders({
      tab: "courierBooked",
      sortKey: "date",
      sortDir: "asc",
      pageSize: 100,
    });
  const responses =
    source === "packing"
      ? [await loadPacking()]
      : source === "readyForPickup"
        ? [await loadReadyForPickup()]
        : await Promise.all([loadPacking(), loadReadyForPickup()]);
  const byId = new Map<string, OrderDTO>();
  responses
    .flatMap((response) => response.orders)
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .forEach((order) => byId.set(order.id, order));

  return { orders: [...byId.values()] };
}

// Fed straight into the same DocumentPage/InvoiceBody that a real print run uses, so the format
// picker's live preview is byte-for-byte what a business actually gets — not an illustration that
// merely resembles it. Numbers are chosen to foot correctly (subtotal + shipping = total).
const PREVIEW_ORDER: OrderDTO = {
  id: "preview-order",
  storeId: "preview-store",
  platform: "shopify",
  externalId: "preview-external",
  number: "PRV-1048",
  invoiceNo: "INV-1048",
  invoiceIssuedAt: "2026-07-17T00:00:00.000Z",
  stage: "Processing",
  heldFromStage: null,
  paymentStatus: "COD Pending",
  paymentMethod: "Cash on Delivery",
  subtotal: 1290,
  shippingFee: 80,
  discount: 0,
  advanceAmount: 0,
  total: 1370,
  currency: "BDT",
  tags: [],
  customerName: "Farzana Akter",
  customerPhone: "+8801711000101",
  customerAltPhone: null,
  customerEmail: null,
  address: "Mirpur 10, Dhaka",
  lineItems: [
    {
      title: "Premium Cotton Kurti",
      variant: "Sky Blue / M",
      quantity: 1,
      price: 1290,
      sku: "PCK-SKY-M",
      image: null,
    },
  ],
  holdReason: null,
  cancelReason: null,
  flagReason: null,
  wasShortOfStock: false,
  splitFromOrderId: null,
  splitFromOrderNumber: null,
  splitIntoOrderId: null,
  splitIntoOrderNumber: null,
  note: null,
  rescheduledFor: null,
  isPriorityCall: false,
  priorityNote: null,
  isCustomerBlocked: false,
  isReturningCustomer: false,
  riskLabel: null,
  riskSuccessRate: null,
  steadfastFraudCheck: null,
  pathaoFraudCheck: null,
  courierPartner: null,
  courierTrackingId: null,
  courierConsignmentId: null,
  courierStatus: null,
  courierSyncedAt: null,
  courierCharge: null,
  courierReturnCharge: null,
  courierZoneTier: null,
  courierSpeed: null,
  deliveryZone: null,
  callAttempts: 0,
  history: [],
  returnLocation: null,
  fulfillmentWarehouseId: null,
  fulfillmentWarehouseName: null,
  cogsTotal: null,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  claimedBy: null,
  claimedAt: null,
  printedAt: null,
};

function InvoiceFormatModal({
  open,
  selected,
  onSave,
  onClose,
}: {
  open: boolean;
  selected: InvoiceFormat;
  onSave: (format: InvoiceFormat) => void;
  onClose: () => void;
}) {
  const [draftFormat, setDraftFormat] = useState<InvoiceFormat>(selected);
  // TEMPORARY — per-card print button so every format can be printed/saved-as-PDF straight from
  // this picker for a one-off export. Safe to delete this state + the effect below + the portal
  // render + each card's print button once that's done; nothing else in the app depends on it.
  // Rendered through a portal straight to document.body (mirroring PrintOrderModal.tsx) because
  // the global `@media print { #root { display: none; } }` rule hides this modal's entire subtree
  // otherwise — a plain "hide everything except this element" CSS trick can't win against an
  // ancestor that's already display:none.
  const [printQueued, setPrintQueued] = useState<InvoiceFormat | null>(null);
  // The tenant's real Settings/Branding logo, so this preview/export flow shows exactly what a
  // real invoice would carry rather than a logo-less approximation.
  const [brandingLogoUrl, setBrandingLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraftFormat(selected);
  }, [open, selected]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void getBrandingSettings()
      .then(({ branding }) => {
        if (!cancelled) setBrandingLogoUrl(branding.logoUrl);
      })
      .catch(() => {
        if (!cancelled) setBrandingLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!printQueued) return;
    const raf = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(raf);
  }, [printQueued]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative flex h-[85vh] w-full max-w-[1360px] animate-dialog-in flex-col overflow-hidden rounded-2xl bg-white shadow-2xl shadow-slate-900/25">
        {/* TEMPORARY — the actual print output for the per-card print buttons. Portaled to
            document.body (outside #root) so it survives the global `@media print { #root {
            display: none; } }` rule instead of getting hidden along with the rest of this modal.
            Delete alongside the rest of the temporary print wiring. */}
        {printQueued &&
          createPortal(
            <div className="hidden print:block">
              <style>{`@media print { @page { size: A4; } }`}</style>
              <DocumentPage
                order={PREVIEW_ORDER}
                docType="invoice"
                businessName="Brown Bazar"
                template={null}
                invoiceStyle={printQueued}
                logoUrl={brandingLogoUrl}
              />
            </div>,
            document.body,
          )}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-7 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <FileText size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Invoice format
              </h2>
              <p className="mt-0.5 text-sm text-slate-500">
                Choose the invoice design to use for this print run.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)]">
          <div className="h-full min-h-0 overflow-y-auto px-7 py-5 lg:border-r lg:border-slate-100">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
              {INVOICE_FORMATS.length} designs available
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {INVOICE_FORMATS.map((format) => {
                const active = draftFormat === format.value;
                return (
                  <div key={format.value} className="relative">
                    <button
                      type="button"
                      onClick={() => setDraftFormat(format.value)}
                      className={clsx(
                        "group relative w-full rounded-xl border bg-white p-3.5 text-left transition-all duration-150",
                        active
                          ? "border-indigo-500 bg-indigo-50/40 shadow-md shadow-indigo-500/10 ring-1 ring-indigo-500"
                          : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
                      )}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {format.value}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {format.detail}
                          </p>
                        </div>
                        <span
                          className={clsx(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition",
                            active
                              ? "border-indigo-500 bg-indigo-500 text-white"
                              : "border-slate-200 bg-white text-transparent group-hover:border-slate-300 group-hover:text-slate-300",
                          )}
                        >
                          <Check size={13} />
                        </span>
                      </div>
                      <InvoiceFormatPreview format={format.value} />
                    </button>
                    {/* TEMPORARY — see the print portal above; remove together. */}
                    <button
                      type="button"
                      title={`Print ${format.value}`}
                      onClick={() => {
                        setDraftFormat(format.value);
                        setPrintQueued(format.value);
                      }}
                      className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600"
                    >
                      <Printer size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex h-full min-h-0 flex-col bg-slate-50/70">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  Actual invoice preview
                  <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">
                    <FileText size={10} />
                    Saved PDF
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  The actual printed file for this format — not a live render.
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                A4
              </span>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto px-6 py-6"
              style={{
                backgroundImage:
                  "radial-gradient(circle, rgba(15,23,42,0.06) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            >
              <div className="mx-auto h-full w-full max-w-[595px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
                <iframe
                  key={draftFormat}
                  src={`${FORMAT_PDF_URLS[draftFormat]}#toolbar=0&navpanes=0&scrollbar=0`}
                  title={`${draftFormat} invoice preview`}
                  className="h-full min-h-[700px] w-full"
                />
              </div>
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-lg px-4 text-sm font-semibold text-slate-500 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSave(draftFormat)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                <Check size={14} /> Save format
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceFormatPreview({ format }: { format: InvoiceFormat }) {
  // Only A4 is offered now, so the skeleton always uses the full-page proportions.
  const fullPage = true;
  const retailLike = format === "Retail" || format === "Statement";
  const dense = format === "Compact" || retailLike;
  const framed = format === "Classic" || format === "Statement";
  const split = format === "Modern";
  const soft = format === "Minimal";
  const logoSide =
    format === "Modern" || retailLike ? "right" : "left";
  const titleSide =
    format === "Modern" || retailLike ? "left" : "right";
  const barcodeSlot =
    format === "Compact" || retailLike ? "top" : "bottom";
  return (
    <div className="flex min-h-[170px] items-center justify-center rounded-md border border-white/80 bg-white p-3 shadow-sm">
      <div
        className={clsx(
          "flex overflow-hidden rounded-md border bg-slate-50/60 p-2 shadow-sm",
          fullPage
            ? "h-44 w-32 flex-col gap-1.5"
            : barcodeSlot === "bottom"
              ? "h-28 w-36 flex-col gap-0.5"
              : "h-28 w-36 flex-col gap-1",
          "border-slate-400 text-slate-600",
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-2">
          {logoSide === "left" ? (
            <LogoSkeleton />
          ) : (
            <InvoiceLabelSkeleton align="left" />
          )}
          {titleSide === "right" ? (
            <InvoiceLabelSkeleton align="right" />
          ) : (
            <LogoSkeleton />
          )}
        </div>

        {barcodeSlot === "top" && (
          <div className="flex shrink-0 justify-end">
            <BarcodeSkeleton compact />
          </div>
        )}

        {!soft && (
          <div className="h-0.5 shrink-0 rounded bg-current opacity-60" />
        )}

        <InvoiceMetaSkeleton dense={dense} split={split} />

        <div
          className={clsx(
            barcodeSlot === "bottom"
              ? fullPage
                ? "h-16 shrink-0"
                : "h-9 shrink-0"
              : "min-h-0 flex-1",
          )}
        >
          <InvoiceTableSkeleton fullPage={fullPage} framed={framed} />
        </div>

        {barcodeSlot === "bottom" && (
          <div className="flex h-5 shrink-0 items-start justify-center border-t border-current/20 pt-2">
            <BarcodeSkeleton compact className="mx-auto" />
          </div>
        )}
      </div>
    </div>
  );
}

function LogoSkeleton() {
  return (
    <div className="h-4 w-4 shrink-0 rounded-full border border-current opacity-80" />
  );
}

function InvoiceLabelSkeleton({ align }: { align: "left" | "right" }) {
  return (
    <div className={clsx("space-y-1", align === "right" && "text-right")}>
      <p className="text-[7px] font-bold uppercase leading-none tracking-wide">
        Inv
      </p>
      <div
        className={clsx(
          "h-0.5 rounded bg-current opacity-45",
          align === "right" ? "ml-auto w-5" : "w-5",
        )}
      />
      <div
        className={clsx(
          "h-0.5 rounded bg-current opacity-25",
          align === "right" ? "ml-auto w-3" : "w-3",
        )}
      />
    </div>
  );
}

function InvoiceMetaSkeleton({
  dense,
  split,
}: {
  dense: boolean;
  split: boolean;
}) {
  return (
    <div
      className={clsx(
        "grid shrink-0 gap-1",
        split ? "grid-cols-2" : "grid-cols-[1.2fr_0.8fr]",
      )}
    >
      <div className="space-y-1">
        <div className="h-0.5 w-7 rounded bg-current opacity-30" />
        {!dense && <div className="h-0.5 w-5 rounded bg-current opacity-20" />}
      </div>
      <div className="space-y-1 justify-self-end">
        <div className="h-0.5 w-6 rounded bg-current opacity-50" />
        <div className="h-0.5 w-4 rounded bg-current opacity-25" />
      </div>
    </div>
  );
}

function InvoiceTableSkeleton({
  fullPage,
  framed,
}: {
  fullPage: boolean;
  framed: boolean;
}) {
  return (
    <div className="relative h-full min-h-[42px] overflow-hidden rounded border border-current bg-white/70">
      <div
        className={clsx(
          "h-2.5 border-b border-current",
          framed ? "bg-current" : "bg-transparent",
        )}
      />
      {Array.from({ length: fullPage ? 5 : 3 }).map((_, index) => (
        <div
          key={index}
          className="mx-2 mt-1.5 h-0.5 rounded bg-current opacity-25"
        />
      ))}
    </div>
  );
}

function BarcodeSkeleton({
  compact,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const bars = compact
    ? ["w-0.5", "w-px", "w-1", "w-px", "w-0.5", "w-1", "w-px"]
    : [
        "w-px",
        "w-0.5",
        "w-1",
        "w-px",
        "w-0.5",
        "w-1",
        "w-px",
        "w-0.5",
        "w-px",
      ];
  return (
    <div
      className={clsx(
        "flex items-stretch justify-center gap-0.5 rounded-sm bg-white/90 px-1 py-0.5",
        compact ? "h-3 w-12" : "h-4 w-16",
        className,
      )}
    >
      {bars.map((width, index) => (
        <span
          key={index}
          className={clsx("block bg-current opacity-75", width)}
        />
      ))}
    </div>
  );
}

function SelectionBar({
  selected,
  total,
  checked,
  onToggle,
  helper,
}: {
  selected: number;
  total: number;
  checked: boolean;
  onToggle: () => void;
  helper: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300"
      />
      <span>
        {selected} of {total} selected
      </span>
      <span className="font-normal text-slate-400">{helper}</span>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 px-8 text-center">
      <Truck size={28} className="text-slate-300" />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      <p className="max-w-md text-sm text-slate-400">{detail}</p>
    </div>
  );
}
