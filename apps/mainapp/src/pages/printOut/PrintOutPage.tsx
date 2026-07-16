import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
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
import type { InvoiceTemplateDTO, OrderDTO } from "@zetsales/shared";
import {
  getOrderInventorySnapshot,
  listOrders,
  listPrintTemplates,
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
  PrintOrderModal,
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

type PrintTask =
  | "invoice"
  | "packingSlip"
  | "combined"
  | "courierLabel"
  | "purchaseOrder";

const PRINT_TASKS: {
  key: PrintTask;
  title: string;
  detail: string;
  icon: typeof FileText;
}[] = [
  {
    key: "invoice",
    title: "Only Print Invoice",
    detail: "Confirmed and packing orders that need invoices.",
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

export function PrintOutPage() {
  const toast = useToast();
  const [task, setTask] = useState<PrintTask>("packingSlip");
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<InvoiceTemplateDTO[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [binLookup, setBinLookup] = useState<BinLookup | undefined>(undefined);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printingPo, setPrintingPo] = useState<PurchaseOrderDTO | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [poStatus, setPoStatus] = useState<PurchaseOrderStatus | "all">("all");
  const [warehouses, setWarehouses] = useState<WarehouseDTO[]>([]);

  const loadSupportData = async () => {
    try {
      const [templatesRes, warehouseRes] = await Promise.all([
        listPrintTemplates(),
        listWarehouses(),
      ]);
      setTemplates(templatesRes.templates);
      const defaultTemplate = templatesRes.templates.find(
        (template) => template.isDefault,
      );
      if (defaultTemplate) setSelectedTemplateId(defaultTemplate.id);
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
          ? await listReadyToPrintOrders()
          : nextTask === "courierLabel"
            ? await listOrders({
                tab: "courierBooked",
                sortKey: "date",
                sortDir: "asc",
                pageSize: 100,
              })
            : await listPackingPrintableOrders();

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
  }, [task, poStatus]);

  const activeTask = PRINT_TASKS.find((item) => item.key === task)!;
  const selectedTemplate =
    templates.find((template) => template.id === selectedTemplateId) ?? null;
  const isPurchaseTask = task === "purchaseOrder";
  const isCourierLabelTask = task === "courierLabel";

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
            {!isCourierLabelTask && !isPurchaseTask && (
              <Select
                value={selectedTemplateId}
                onChange={setSelectedTemplateId}
                options={
                  templates.length === 0
                    ? [{ value: "", label: "Default layout" }]
                    : templates.map((template) => ({
                        value: template.id,
                        label: `${template.name}${template.isDefault ? " (default)" : ""}`,
                      }))
                }
              />
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
        template={selectedTemplate}
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

async function listPackingPrintableOrders(): Promise<{ orders: OrderDTO[] }> {
  const [packing, readyForPickup] = await Promise.all([
    listOrders({
      tab: "processing",
      sortKey: "date",
      sortDir: "asc",
      pageSize: 100,
    }),
    listOrders({
      tab: "courierBooked",
      sortKey: "date",
      sortDir: "asc",
      pageSize: 100,
    }),
  ]);
  const byId = new Map<string, OrderDTO>();
  [...packing.orders, ...readyForPickup.orders]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .forEach((order) => byId.set(order.id, order));

  return { orders: [...byId.values()] };
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
