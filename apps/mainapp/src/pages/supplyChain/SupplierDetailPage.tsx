import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  Landmark,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Send,
  Trash2,
  Truck,
  User,
  X,
} from "lucide-react";
import clsx from "clsx";
import {
  cancelPurchaseOrder,
  deletePurchaseOrder,
  deleteSupplier,
  getSupplier,
  getSupplierSummary,
  listSupplierPurchaseOrders,
  listSupplierShipments,
  listSupplierTransactions,
  sendPurchaseOrder,
  updateSupplier,
  type PurchaseOrderDTO,
  type PurchaseOrderStatus,
  type ShipmentDTO,
  type SupplierDTO,
  type SupplierPaymentType,
  type SupplierSummaryDTO,
  type SupplierTransactionDTO,
} from "../../lib/commerceApi";
import { Modal } from "../../components/ui/Modal";
import { Popover } from "../../components/ui/Popover";
import { useToast } from "../../components/ui/ToastProvider";
import { Select } from "../../components/ui/Select";
import { CreatePurchaseOrderModal } from "../../components/supplyChain/CreatePurchaseOrderModal";
import { PrintPurchaseOrderModal } from "../../components/supplyChain/PrintPurchaseOrderModal";
import { ConfirmPrintPromptModal } from "../../components/supplyChain/ConfirmPrintPromptModal";
import { PageTitle } from "../../components/layout/PageTitle";

function money(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}৳${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
}

// 'sent' displays as "Confirmed" (not "Sent") — matches the "Confirm & add to Incoming Stock"
// button copy, since nothing about this action actually emails the supplier.
const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: "Draft",
  sent: "Confirmed",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};
const PO_STATUS_TONE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  sent: "bg-amber-50 text-amber-700",
  partially_received: "bg-sky-50 text-sky-700",
  received: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
};

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "slate",
}: {
  icon: typeof Package;
  label: string;
  value: string;
  detail?: string;
  tone?: "slate" | "emerald" | "indigo" | "amber";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    amber: "bg-amber-50 text-amber-600",
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
        {detail && (
          <span className="pb-1 text-xs text-slate-400">{detail}</span>
        )}
      </div>
    </div>
  );
}

type RangePreset =
  | "thisMonth"
  | "lastMonth"
  | "thisQuarter"
  | "thisYear"
  | "allTime"
  | "custom";
const RANGE_LABELS: Record<RangePreset, string> = {
  thisMonth: "This month",
  lastMonth: "Last month",
  thisQuarter: "This quarter",
  thisYear: "This year",
  allTime: "All time",
  custom: "Custom range",
};

function computePresetRange(preset: RangePreset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "lastMonth")
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59),
    };
  if (preset === "thisQuarter")
    return {
      from: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
      to: now,
    };
  if (preset === "thisYear")
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  if (preset === "allTime") return { from: new Date(2015, 0, 1), to: now };
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

function DateRangePicker({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomChange,
}: {
  preset: RangePreset;
  onPresetChange: (p: RangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomChange: (from: string, to: string) => void;
}) {
  return (
    <Popover
      align="right"
      widthClass="w-64"
      trigger={() => (
        <div className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Calendar size={14} className="text-slate-400" />
          {RANGE_LABELS[preset]}
          <ChevronDown size={13} className="text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          {(Object.keys(RANGE_LABELS) as RangePreset[])
            .filter((p) => p !== "custom")
            .map((p) => (
              <button
                key={p}
                onClick={() => {
                  onPresetChange(p);
                  close();
                }}
                className={clsx(
                  "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm",
                  preset === p
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-700 hover:bg-slate-50",
                )}
              >
                {RANGE_LABELS[p]}
                {preset === p && <Check size={13} />}
              </button>
            ))}
          <div className="mt-1 border-t border-slate-100 pt-2">
            <p className="mb-1.5 px-1 text-[11px] font-semibold text-slate-400">
              Custom range
            </p>
            <div className="flex items-center gap-1.5 px-1">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => {
                  onCustomChange(e.target.value, customTo);
                  onPresetChange("custom");
                }}
                className="h-8 w-full rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => {
                  onCustomChange(customFrom, e.target.value);
                  onPresetChange("custom");
                }}
                className="h-8 w-full rounded-md border border-slate-200 px-1.5 text-xs outline-none focus:border-indigo-400"
              />
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
}

function TrendChart({ trend }: { trend: SupplierSummaryDTO["trend"] }) {
  const max = Math.max(1, ...trend.map((t) => t.spend));
  return (
    <div>
      <div
        className="flex items-end gap-3 border-b border-slate-100 pb-2"
        style={{ height: 160 }}
      >
        {trend.map((t) => (
          <div
            key={t.month}
            className="flex flex-1 items-end justify-center"
            title={`${monthLabel(t.month)}: ${money(t.spend)}, ${t.units} units`}
          >
            <div
              className="w-3 rounded-t bg-indigo-400"
              style={{ height: `${(t.spend / max) * 100}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-3">
        {trend.map((t) => (
          <div
            key={t.month}
            className="flex-1 text-center text-[10px] text-slate-400"
          >
            {monthLabel(t.month)}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditSupplierModal({
  open,
  supplier,
  onClose,
  onSaved,
}: {
  open: boolean;
  supplier: SupplierDTO | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [designation, setDesignation] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [paymentType, setPaymentType] =
    useState<SupplierPaymentType>("prepaid");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && supplier) {
      setName(supplier.name);
      setPhone(supplier.phone ?? "");
      setEmail(supplier.email ?? "");
      setContactPersonName(supplier.contactPersonName ?? "");
      setDesignation(supplier.designation ?? "");
      setBillingAddress(supplier.billingAddress ?? "");
      setPaymentType(supplier.paymentType);
      setNote(supplier.note ?? "");
    }
  }, [open, supplier]);

  const canSave =
    name.trim().length > 0 &&
    contactPersonName.trim().length > 0 &&
    designation.trim().length > 0 &&
    billingAddress.trim().length > 0 &&
    !saving;

  const save = async () => {
    if (!canSave || !supplier) return;
    setSaving(true);
    try {
      const res = await updateSupplier(supplier.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        contactPersonName: contactPersonName.trim(),
        designation: designation.trim(),
        billingAddress: billingAddress.trim(),
        paymentType,
        note: note.trim(),
      });
      if (!res.success) {
        toast.push(res.message || "Could not save those changes.", "info");
        return;
      }
      toast.push("Supplier updated.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not save those changes.",
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
      title="Edit supplier"
      widthClass="max-w-md"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Email
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Contact person
            </label>
            <input
              value={contactPersonName}
              onChange={(e) => setContactPersonName(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Designation
            </label>
            <input
              value={designation}
              onChange={(e) => setDesignation(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            Billing address
          </label>
          <input
            value={billingAddress}
            onChange={(e) => setBillingAddress(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            How do you pay this supplier?
          </label>
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setPaymentType("prepaid")}
              className={clsx(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                paymentType === "prepaid"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              Prepaid
            </button>
            <button
              type="button"
              onClick={() => setPaymentType("credit")}
              className={clsx(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                paymentType === "credit"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              On credit
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            {paymentType === "prepaid"
              ? "You pay upfront before a shipment ships — it'll show as cash already spent, in transit."
              : "You pay after the shipment arrives — it'll show as money you still owe."}
          </p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            Note
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

const PAGE_SIZE = 20;

export function SupplierDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const [supplier, setSupplier] = useState<SupplierDTO | null>(null);
  const [summary, setSummary] = useState<SupplierSummaryDTO | null>(null);
  const [transactions, setTransactions] = useState<SupplierTransactionDTO[]>(
    [],
  );
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [reasonFilter, setReasonFilter] = useState<
    "" | "Opening balance" | "Incoming Stock"
  >("");
  const [skuFilter, setSkuFilter] = useState("");
  const [shipments, setShipments] = useState<ShipmentDTO[]>([]);
  const [shipmentsTotal, setShipmentsTotal] = useState(0);
  const [shipmentsPage, setShipmentsPage] = useState(1);
  const [shipmentsStatusFilter, setShipmentsStatusFilter] = useState<
    "" | "open" | "closed"
  >("");
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderDTO[]>([]);
  const [purchaseOrdersTotal, setPurchaseOrdersTotal] = useState(0);
  const [purchaseOrdersPage, setPurchaseOrdersPage] = useState(1);
  const [purchaseOrdersStatusFilter, setPurchaseOrdersStatusFilter] = useState<
    "" | PurchaseOrderStatus
  >("");
  const [createPoOpen, setCreatePoOpen] = useState(false);
  const [editingPo, setEditingPo] = useState<PurchaseOrderDTO | null>(null);
  const [printingPo, setPrintingPo] = useState<PurchaseOrderDTO | null>(null);
  // Only set right after the per-row Confirm button succeeds — holds the "print it?" prompt open.
  // The create/edit modal's own Confirm action handles this itself (see CreatePurchaseOrderModal).
  const [confirmedPo, setConfirmedPo] = useState<PurchaseOrderDTO | null>(null);
  const [poActionBusyId, setPoActionBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [preset, setPreset] = useState<RangePreset>("thisYear");
  const [customFrom, setCustomFrom] = useState(() =>
    new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10),
  );
  const [customTo, setCustomTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const range = useMemo(
    () =>
      preset === "custom"
        ? { from: new Date(customFrom), to: new Date(customTo + "T23:59:59") }
        : computePresetRange(preset),
    [preset, customFrom, customTo],
  );

  const loadHeaderAndSummary = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const params = {
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
      };
      const [supplierRes, summaryRes] = await Promise.all([
        getSupplier(id),
        getSupplierSummary(id, params),
      ]);
      if (!supplierRes.success) {
        toast.push("Supplier not found.", "info");
        navigate("/suppliers");
        return;
      }
      setSupplier(supplierRes.supplier);
      setSummary(summaryRes);
    } catch {
      toast.push("Could not load this supplier.", "info");
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    if (!id) return;
    try {
      const res = await listSupplierTransactions(id, {
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
        reason: reasonFilter || undefined,
        sku: skuFilter.trim() || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setTransactions(res.transactions);
      setTotal(res.total);
    } catch {
      toast.push("Could not load transactions.", "info");
    }
  };

  const loadShipments = async () => {
    if (!id) return;
    try {
      const res = await listSupplierShipments(id, {
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
        status: shipmentsStatusFilter || undefined,
        page: shipmentsPage,
        pageSize: PAGE_SIZE,
      });
      setShipments(res.shipments);
      setShipmentsTotal(res.total);
    } catch {
      toast.push("Could not load shipments.", "info");
    }
  };

  const loadPurchaseOrders = async () => {
    if (!id) return;
    try {
      const res = await listSupplierPurchaseOrders(id, {
        status: purchaseOrdersStatusFilter || undefined,
        page: purchaseOrdersPage,
        pageSize: PAGE_SIZE,
      });
      setPurchaseOrders(res.purchaseOrders);
      setPurchaseOrdersTotal(res.total);
    } catch {
      toast.push("Could not load purchase orders.", "info");
    }
  };

  useEffect(() => {
    void loadHeaderAndSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, range.from.getTime(), range.to.getTime()]);

  useEffect(() => {
    void loadTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    id,
    range.from.getTime(),
    range.to.getTime(),
    reasonFilter,
    skuFilter,
    page,
  ]);

  useEffect(() => {
    void loadShipments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    id,
    range.from.getTime(),
    range.to.getTime(),
    shipmentsStatusFilter,
    shipmentsPage,
  ]);

  useEffect(() => {
    void loadPurchaseOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, purchaseOrdersStatusFilter, purchaseOrdersPage]);

  useEffect(() => {
    setPage(1);
  }, [reasonFilter, skuFilter, range.from, range.to]);

  useEffect(() => {
    setShipmentsPage(1);
  }, [shipmentsStatusFilter, range.from, range.to]);

  useEffect(() => {
    setPurchaseOrdersPage(1);
  }, [purchaseOrdersStatusFilter]);

  const refreshPurchaseOrders = () => {
    void loadPurchaseOrders();
    void loadShipments();
  };

  const handleSendPo = async (po: PurchaseOrderDTO) => {
    setPoActionBusyId(po.id);
    try {
      const res = await sendPurchaseOrder(po.id);
      if (!res.success || !res.purchaseOrder) {
        toast.push(
          res.message || "Could not confirm this purchase order.",
          "info",
        );
        return;
      }
      toast.push("Added to Incoming Stock.", "success");
      refreshPurchaseOrders();
      setConfirmedPo(res.purchaseOrder);
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not confirm this purchase order.",
        "info",
      );
    } finally {
      setPoActionBusyId(null);
    }
  };

  const handleCancelPo = async (po: PurchaseOrderDTO) => {
    setPoActionBusyId(po.id);
    try {
      const res = await cancelPurchaseOrder(po.id);
      if (!res.success) {
        toast.push(
          res.message || "Could not cancel this purchase order.",
          "info",
        );
        return;
      }
      toast.push("Purchase order cancelled.", "success");
      refreshPurchaseOrders();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not cancel this purchase order.",
        "info",
      );
    } finally {
      setPoActionBusyId(null);
    }
  };

  const handleDeletePo = async (po: PurchaseOrderDTO) => {
    setPoActionBusyId(po.id);
    try {
      const res = await deletePurchaseOrder(po.id);
      if (!res.success) {
        toast.push(
          res.message || "Could not delete this purchase order.",
          "info",
        );
        return;
      }
      toast.push("Purchase order deleted.", "success");
      refreshPurchaseOrders();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not delete this purchase order.",
        "info",
      );
    } finally {
      setPoActionBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!supplier) return;
    setDeleting(true);
    try {
      const res = await deleteSupplier(supplier.id);
      if (!res.success) {
        toast.push(res.message || "Could not delete this supplier.", "info");
        return;
      }
      toast.push("Supplier deleted.", "success");
      navigate("/suppliers");
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not delete this supplier.",
        "info",
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !supplier) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-400">
        Loading supplier...
      </div>
    );
  }
  if (!supplier) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="zs-page">
      <div className="zs-page-header flex flex-wrap items-center justify-between gap-y-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/suppliers")}
            className="mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <PageTitle hideBack>{supplier.name}</PageTitle>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {supplier.phone && (
                <span className="flex items-center gap-1">
                  <Phone size={12} /> {supplier.phone}
                </span>
              )}
              {supplier.email && (
                <span className="flex items-center gap-1">
                  <Mail size={12} /> {supplier.email}
                </span>
              )}
              {supplier.contactPersonName && (
                <span className="flex items-center gap-1">
                  <User size={12} /> {supplier.contactPersonName}
                  {supplier.designation && ` · ${supplier.designation}`}
                </span>
              )}
              {supplier.billingAddress && (
                <span className="flex items-center gap-1">
                  <MapPin size={12} /> {supplier.billingAddress}
                </span>
              )}
              <span
                className={clsx(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  supplier.paymentType === "credit"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700",
                )}
              >
                {supplier.paymentType === "credit"
                  ? "Paid on credit"
                  : "Prepaid"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void loadHeaderAndSummary()}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={14} />
          </button>
          <DateRangePicker
            preset={preset}
            onPresetChange={setPreset}
            customFrom={customFrom}
            customTo={customTo}
            onCustomChange={(f, t) => {
              setCustomFrom(f);
              setCustomTo(t);
            }}
          />
          <button
            onClick={() => setEditOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      </div>

      <div className="zs-page-body overflow-y-auto">
        {summary && (
          <div className="space-y-6">
            <div className="zs-summary-strip">
              <MetricCard
                icon={Landmark}
                label="Total spend"
                value={money(summary.totalSpend)}
                tone="indigo"
              />
              <MetricCard
                icon={Boxes}
                label="Units received"
                value={String(summary.totalUnits)}
                tone="slate"
              />
              <MetricCard
                icon={Truck}
                label="Shipments"
                value={String(summary.shipmentCount)}
                tone="emerald"
              />
              <MetricCard
                icon={Package}
                label="Avg landed cost"
                value={
                  summary.avgLandedCost != null
                    ? money(summary.avgLandedCost)
                    : "—"
                }
                tone="amber"
              />
              <MetricCard
                icon={Hourglass}
                label="Outstanding"
                value={money(summary.outstandingValue)}
                detail={`${summary.outstandingUnits} units`}
                tone={summary.outstandingUnits > 0 ? "amber" : "slate"}
              />
              <MetricCard
                icon={Clock}
                label="Last transaction"
                value={
                  summary.lastTransactionAt
                    ? new Date(summary.lastTransactionAt).toLocaleDateString()
                    : "Never"
                }
                tone="slate"
              />
            </div>

            <section className="zs-surface p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
                <AlertTriangle size={15} className="text-amber-500" /> Damaged,
                lost &amp; short-shipped
              </h2>
              <div className="grid grid-cols-3 gap-4">
                {[
                  {
                    label: "Short-shipped by supplier",
                    bucket: summary.writtenOff.shortShipped,
                  },
                  {
                    label: "Lost in transit",
                    bucket: summary.writtenOff.lostInTransit,
                  },
                  {
                    label: "Damaged on arrival",
                    bucket: summary.writtenOff.damagedOnArrival,
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-lg border border-slate-100 bg-slate-50 px-3.5 py-3"
                  >
                    <p className="text-xs font-semibold text-slate-500">
                      {row.label}
                    </p>
                    <p className="mt-1.5 text-lg font-bold tabular-nums text-slate-900">
                      {row.bucket.units} units
                    </p>
                    <p className="text-xs tabular-nums text-slate-400">
                      {money(row.bucket.value)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Based on shipments logged in this range, resolved against
                whichever ones are currently open — pick "All time" to see every
                shipment regardless of when it was placed.
              </p>
            </section>

            <div className="grid grid-cols-2 gap-4">
              <section className="zs-surface p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
                  <BarChart3 size={15} className="text-indigo-500" /> Spend —
                  trailing 12 months
                </h2>
                <TrendChart trend={summary.trend} />
              </section>

              <section className="zs-surface p-5">
                <h2 className="mb-4 text-sm font-bold text-slate-900">
                  Top products purchased
                </h2>
                {summary.topProducts.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-400">
                    No purchases in this range yet.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {summary.topProducts.map((p, i) => {
                      const max = summary.topProducts[0]?.spend || 1;
                      return (
                        <div key={`${p.productId}-${p.variantId}-${i}`}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate font-medium text-slate-700">
                              {p.productTitle ?? "Unknown product"}
                              {p.variantLabel ? ` · ${p.variantLabel}` : ""}
                            </span>
                            <span className="shrink-0 pl-2 font-semibold tabular-nums text-slate-600">
                              {money(p.spend)}
                            </span>
                          </div>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                            <div
                              className="h-1.5 rounded-full bg-indigo-400"
                              style={{ width: `${(p.spend / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            <section className="zs-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Transaction ledger
                </h2>
                <div className="flex items-center gap-2">
                  <Select
                    value={reasonFilter}
                    onChange={(v) => setReasonFilter(v as any)}
                    options={[
                      { value: "", label: "All reasons" },
                      { value: "Opening balance", label: "Opening balance" },
                      { value: "Incoming Stock", label: "Incoming Stock" },
                    ]}
                    className="h-8 py-0 text-xs"
                  />
                  <input
                    value={skuFilter}
                    onChange={(e) => setSkuFilter(e.target.value)}
                    placeholder="Filter by SKU"
                    className="h-8 w-32 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <p className="mb-3 text-[11px] text-slate-400">
                Shows shipments logged and opening balances tied to this
                supplier. Receiving and write-off events are tracked in Stock
                History, since a single stock bucket can blend shipments from
                more than one supplier.
              </p>
              {transactions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No transactions match this filter.
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
                            Unit price
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Shipping
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Duties
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Landed cost
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Total value
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Warehouse
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Note
                          </th>
                        </tr>
                      </thead>
                      <tbody className="zs-table-body">
                        {transactions.map((t) => (
                          <tr key={t.id} className="zs-data-row">
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                              {new Date(t.createdAt).toLocaleDateString()}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span
                                className={clsx(
                                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                  t.reason === "Incoming Stock"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-indigo-50 text-indigo-700",
                                )}
                              >
                                {t.reason}
                              </span>
                            </td>
                            <td className="px-2 py-2 text-slate-700">
                              {t.productTitle ?? "—"}
                              {t.variantLabel ? ` · ${t.variantLabel}` : ""}
                              {t.sku ? (
                                <span className="text-slate-400">
                                  {" "}
                                  ({t.sku})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                              {t.quantity}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                              {t.unitPrice != null ? money(t.unitPrice) : "—"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                              {t.shippingCostTotal != null
                                ? money(t.shippingCostTotal)
                                : "—"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-500">
                              {t.dutiesCostTotal != null
                                ? money(t.dutiesCostTotal)
                                : "—"}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                              {t.unitCost != null ? money(t.unitCost) : "—"}
                            </td>
                            <td className="px-2 py-2 text-right font-semibold tabular-nums text-slate-800">
                              {t.valueDelta != null ? money(t.valueDelta) : "—"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                              {t.warehouseName ?? "—"}
                            </td>
                            <td className="max-w-[160px] truncate px-2 py-2 text-slate-400">
                              {t.note ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list — same data as the table above. */}
                  <div className="space-y-2 lg:hidden">
                    {transactions.map((t) => (
                      <div key={t.id} className="zs-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={clsx(
                              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              t.reason === "Incoming Stock"
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-indigo-50 text-indigo-700",
                            )}
                          >
                            {t.reason}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(t.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm text-slate-700">
                          {t.productTitle ?? "—"}
                          {t.variantLabel ? ` · ${t.variantLabel}` : ""}
                          {t.sku ? (
                            <span className="text-slate-400"> ({t.sku})</span>
                          ) : null}
                        </p>
                        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                          <span>Qty {t.quantity}</span>
                          <span className="font-semibold tabular-nums text-slate-800">
                            {t.valueDelta != null ? money(t.valueDelta) : "—"}
                          </span>
                        </div>
                        {(t.warehouseName || t.note) && (
                          <p className="mt-1 truncate text-[11px] text-slate-400">
                            {t.warehouseName ?? ""}
                            {t.warehouseName && t.note ? " · " : ""}
                            {t.note ?? ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {total} transaction{total === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>
                        Page {page} of {totalPages}
                      </span>
                      <button
                        onClick={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={page >= totalPages}
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="zs-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">Shipments</h2>
                <Select
                  value={shipmentsStatusFilter}
                  onChange={(v) => setShipmentsStatusFilter(v as any)}
                  options={[
                    { value: "", label: "All statuses" },
                    { value: "open", label: "Open" },
                    { value: "closed", label: "Closed" },
                  ]}
                  className="h-8 py-0 text-xs"
                />
              </div>
              <p className="mb-3 text-[11px] text-slate-400">
                Every shipment logged from this supplier — ordered vs. received
                vs. still outstanding vs. written off, one row per shipment.
              </p>
              {shipments.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No shipments match this filter.
                </p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="zs-table-head">
                          <th className="px-2 py-2 text-left font-semibold">
                            Date logged
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Product
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Ordered
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Received
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Outstanding
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Written off
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Status
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Expected arrival
                          </th>
                        </tr>
                      </thead>
                      <tbody className="zs-table-body">
                        {shipments.map((s) => {
                          const writtenOffTotal =
                            s.writtenOffByReason.shortShipped +
                            s.writtenOffByReason.lostInTransit +
                            s.writtenOffByReason.damagedOnArrival;
                          const writtenOffBreakdown = [
                            s.writtenOffByReason.shortShipped
                              ? `${s.writtenOffByReason.shortShipped} short-shipped`
                              : null,
                            s.writtenOffByReason.lostInTransit
                              ? `${s.writtenOffByReason.lostInTransit} lost in transit`
                              : null,
                            s.writtenOffByReason.damagedOnArrival
                              ? `${s.writtenOffByReason.damagedOnArrival} damaged`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(", ");
                          return (
                            <tr key={s.id} className="zs-data-row">
                              <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                                {new Date(s.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-2 py-2 text-slate-700">
                                {s.productTitle ?? "—"}
                                {s.variantLabel ? ` · ${s.variantLabel}` : ""}
                                {s.sku ? (
                                  <span className="text-slate-400">
                                    {" "}
                                    ({s.sku})
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                                {s.quantityOrdered}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-emerald-600">
                                {s.quantityReceived}
                              </td>
                              <td
                                className={clsx(
                                  "px-2 py-2 text-right tabular-nums font-semibold",
                                  s.outstanding > 0
                                    ? "text-amber-600"
                                    : "text-slate-400",
                                )}
                              >
                                {s.outstanding}
                              </td>
                              <td
                                className="px-2 py-2 text-right tabular-nums text-rose-600"
                                title={writtenOffBreakdown || undefined}
                              >
                                {writtenOffTotal || "—"}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2">
                                <span
                                  className={clsx(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                    s.status === "open"
                                      ? "bg-amber-50 text-amber-700"
                                      : "bg-slate-100 text-slate-500",
                                  )}
                                >
                                  {s.status === "open" ? "Open" : "Closed"}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                                {s.expectedAt
                                  ? new Date(s.expectedAt).toLocaleDateString()
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list — same data as the table above. */}
                  <div className="space-y-2 lg:hidden">
                    {shipments.map((s) => {
                      const writtenOffTotal =
                        s.writtenOffByReason.shortShipped +
                        s.writtenOffByReason.lostInTransit +
                        s.writtenOffByReason.damagedOnArrival;
                      return (
                        <div key={s.id} className="zs-surface p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 truncate text-sm font-medium text-slate-700">
                              {s.productTitle ?? "—"}
                              {s.variantLabel ? ` · ${s.variantLabel}` : ""}
                            </p>
                            <span
                              className={clsx(
                                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                s.status === "open"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-100 text-slate-500",
                              )}
                            >
                              {s.status === "open" ? "Open" : "Closed"}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                            <span>
                              Ordered {s.quantityOrdered} · Received{" "}
                              <span className="text-emerald-600">
                                {s.quantityReceived}
                              </span>
                            </span>
                            <span
                              className={clsx(
                                "font-semibold tabular-nums",
                                s.outstanding > 0
                                  ? "text-amber-600"
                                  : "text-slate-400",
                              )}
                            >
                              {s.outstanding} outstanding
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                            <span>
                              {writtenOffTotal
                                ? `${writtenOffTotal} written off`
                                : ""}
                            </span>
                            <span>
                              {new Date(s.createdAt).toLocaleDateString()}
                              {s.expectedAt
                                ? ` · exp. ${new Date(s.expectedAt).toLocaleDateString()}`
                                : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {shipmentsTotal} shipment{shipmentsTotal === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setShipmentsPage((p) => Math.max(1, p - 1))
                        }
                        disabled={shipmentsPage <= 1}
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>
                        Page {shipmentsPage} of{" "}
                        {Math.max(1, Math.ceil(shipmentsTotal / PAGE_SIZE))}
                      </span>
                      <button
                        onClick={() =>
                          setShipmentsPage((p) =>
                            Math.min(
                              Math.max(
                                1,
                                Math.ceil(shipmentsTotal / PAGE_SIZE),
                              ),
                              p + 1,
                            ),
                          )
                        }
                        disabled={
                          shipmentsPage >=
                          Math.max(1, Math.ceil(shipmentsTotal / PAGE_SIZE))
                        }
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="zs-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Purchase orders
                </h2>
                <div className="flex items-center gap-2">
                  <Select
                    value={purchaseOrdersStatusFilter}
                    onChange={(v) => setPurchaseOrdersStatusFilter(v as any)}
                    options={[
                      { value: "", label: "All statuses" },
                      { value: "draft", label: "Draft" },
                      { value: "sent", label: "Confirmed" },
                      {
                        value: "partially_received",
                        label: "Partially received",
                      },
                      { value: "received", label: "Received" },
                      { value: "cancelled", label: "Cancelled" },
                    ]}
                    className="h-8 py-0 text-xs"
                  />
                  <button
                    onClick={() => setCreatePoOpen(true)}
                    className="flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700"
                  >
                    <Plus size={13} /> New purchase order
                  </button>
                </div>
              </div>
              <p className="mb-3 text-[11px] text-slate-400">
                Fully optional — a draft is just a document until you confirm
                it. Confirming creates real Incoming Stock entries, same as
                logging one directly from Inventory.
              </p>
              {purchaseOrders.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No purchase orders match this filter.
                </p>
              ) : (
                <>
                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="zs-table-head">
                          <th className="px-2 py-2 text-left font-semibold">
                            PO number
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Date
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Lines
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Total
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Status
                          </th>
                          <th className="px-2 py-2 text-left font-semibold">
                            Expected
                          </th>
                          <th className="px-2 py-2 text-right font-semibold">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="zs-table-body">
                        {purchaseOrders.map((po) => {
                          const busy = poActionBusyId === po.id;
                          return (
                            <tr key={po.id} className="zs-data-row">
                              <td className="whitespace-nowrap px-2 py-2 font-semibold text-slate-800">
                                {po.poNumber}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                                {new Date(po.createdAt).toLocaleDateString()}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums text-slate-600">
                                {po.lines.length}
                              </td>
                              <td className="px-2 py-2 text-right tabular-nums font-medium text-slate-800">
                                {money(po.total)}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2">
                                <span
                                  className={clsx(
                                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                    PO_STATUS_TONE[po.status],
                                  )}
                                >
                                  {PO_STATUS_LABEL[po.status]}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-slate-500">
                                {po.expectedAt
                                  ? new Date(po.expectedAt).toLocaleDateString()
                                  : "—"}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {po.status === "draft" && (
                                    <button
                                      onClick={() => void handleSendPo(po)}
                                      disabled={busy}
                                      className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                                    >
                                      <Send size={12} />{" "}
                                      {busy
                                        ? "Confirming..."
                                        : "Confirm & add to Incoming Stock"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => setPrintingPo(po)}
                                    title="Print"
                                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  >
                                    <Printer size={13} />
                                  </button>
                                  {po.status === "draft" && (
                                    <>
                                      <button
                                        onClick={() => setEditingPo(po)}
                                        title="Edit"
                                        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                      >
                                        <Pencil size={13} />
                                      </button>
                                      <button
                                        onClick={() => void handleCancelPo(po)}
                                        disabled={busy}
                                        title="Cancel"
                                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                      >
                                        <X size={13} />
                                      </button>
                                      <button
                                        onClick={() => void handleDeletePo(po)}
                                        disabled={busy}
                                        title="Delete"
                                        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list — same data/handlers as the table above. */}
                  <div className="space-y-2 lg:hidden">
                    {purchaseOrders.map((po) => {
                      const busy = poActionBusyId === po.id;
                      return (
                        <div key={po.id} className="zs-surface p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-semibold text-slate-800">
                              {po.poNumber}
                            </p>
                            <span
                              className={clsx(
                                "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                                PO_STATUS_TONE[po.status],
                              )}
                            >
                              {PO_STATUS_LABEL[po.status]}
                            </span>
                          </div>
                          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
                            <span>
                              {new Date(po.createdAt).toLocaleDateString()} ·{" "}
                              {po.lines.length} line
                              {po.lines.length === 1 ? "" : "s"}
                            </span>
                            <span className="font-semibold tabular-nums text-slate-800">
                              {money(po.total)}
                            </span>
                          </div>
                          {po.expectedAt && (
                            <p className="mt-1 text-[11px] text-slate-400">
                              Expected{" "}
                              {new Date(po.expectedAt).toLocaleDateString()}
                            </p>
                          )}
                          <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2">
                            {po.status === "draft" && (
                              <button
                                onClick={() => void handleSendPo(po)}
                                disabled={busy}
                                className="flex items-center gap-1 rounded-md bg-indigo-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
                              >
                                <Send size={12} />{" "}
                                {busy
                                  ? "Confirming..."
                                  : "Confirm & add to Incoming Stock"}
                              </button>
                            )}
                            <button
                              onClick={() => setPrintingPo(po)}
                              title="Print"
                              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <Printer size={13} />
                            </button>
                            {po.status === "draft" && (
                              <>
                                <button
                                  onClick={() => setEditingPo(po)}
                                  title="Edit"
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => void handleCancelPo(po)}
                                  disabled={busy}
                                  title="Cancel"
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                >
                                  <X size={13} />
                                </button>
                                <button
                                  onClick={() => void handleDeletePo(po)}
                                  disabled={busy}
                                  title="Delete"
                                  className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>
                      {purchaseOrdersTotal} purchase order
                      {purchaseOrdersTotal === 1 ? "" : "s"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          setPurchaseOrdersPage((p) => Math.max(1, p - 1))
                        }
                        disabled={purchaseOrdersPage <= 1}
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span>
                        Page {purchaseOrdersPage} of{" "}
                        {Math.max(
                          1,
                          Math.ceil(purchaseOrdersTotal / PAGE_SIZE),
                        )}
                      </span>
                      <button
                        onClick={() =>
                          setPurchaseOrdersPage((p) =>
                            Math.min(
                              Math.max(
                                1,
                                Math.ceil(purchaseOrdersTotal / PAGE_SIZE),
                              ),
                              p + 1,
                            ),
                          )
                        }
                        disabled={
                          purchaseOrdersPage >=
                          Math.max(
                            1,
                            Math.ceil(purchaseOrdersTotal / PAGE_SIZE),
                          )
                        }
                        className="rounded-md p-1 hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>

      <EditSupplierModal
        open={editOpen}
        supplier={supplier}
        onClose={() => setEditOpen(false)}
        onSaved={() => void loadHeaderAndSummary()}
      />

      {supplier && (
        <>
          <CreatePurchaseOrderModal
            open={createPoOpen}
            mode="create"
            supplierId={supplier.id}
            supplierName={supplier.name}
            onClose={() => setCreatePoOpen(false)}
            onSaved={refreshPurchaseOrders}
          />
          <CreatePurchaseOrderModal
            open={editingPo !== null}
            mode="edit"
            supplierId={supplier.id}
            supplierName={supplier.name}
            initial={editingPo}
            onClose={() => setEditingPo(null)}
            onSaved={refreshPurchaseOrders}
          />
        </>
      )}
      <PrintPurchaseOrderModal
        open={printingPo !== null}
        purchaseOrder={printingPo}
        onClose={() => setPrintingPo(null)}
      />
      <ConfirmPrintPromptModal
        open={confirmedPo !== null}
        poNumber={confirmedPo?.poNumber ?? ""}
        onSkip={() => setConfirmedPo(null)}
        onPrint={() => {
          setPrintingPo(confirmedPo);
          setConfirmedPo(null);
        }}
      />

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete supplier?"
        widthClass="max-w-sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            <b>{supplier.name}</b> has{" "}
            <b>{summary?.totalSpend ? money(summary.totalSpend) : "৳0"}</b> in
            recorded spend in the selected range. Deleting removes the supplier
            record, but every past transaction keeps its own snapshot of the
            supplier's name — history won't change.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Delete supplier"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
