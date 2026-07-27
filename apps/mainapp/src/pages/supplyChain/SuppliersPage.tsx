import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  Landmark,
  Package,
  Plus,
  RefreshCw,
  Search,
  Truck,
  Users,
} from "lucide-react";
import clsx from "clsx";
import {
  createSupplierRecord,
  listSupplierOverviews,
  type SupplierOverviewDTO,
  type SupplierPaymentType,
} from "../../lib/commerceApi";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/ToastProvider";
import { CreatePurchaseOrderModal } from "../../components/supplyChain/CreatePurchaseOrderModal";
import { PageTitle } from "../../components/layout/PageTitle";

function money(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}৳${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof Package;
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "indigo";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
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
      <div className="mt-2 text-xl font-bold tabular-nums text-slate-900">
        {value}
      </div>
    </div>
  );
}

type SortKey =
  | "name"
  | "totalSpend"
  | "shipmentCount"
  | "totalUnits"
  | "lastTransactionAt";

function AddSupplierModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
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
    if (!open) {
      setName("");
      setPhone("");
      setEmail("");
      setContactPersonName("");
      setDesignation("");
      setBillingAddress("");
      setPaymentType("prepaid");
      setNote("");
    }
  }, [open]);

  const canSave =
    name.trim().length > 0 &&
    contactPersonName.trim().length > 0 &&
    designation.trim().length > 0 &&
    billingAddress.trim().length > 0 &&
    !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await createSupplierRecord({
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        contactPersonName: contactPersonName.trim(),
        designation: designation.trim(),
        billingAddress: billingAddress.trim(),
        paymentType,
        note: note.trim() || undefined,
      });
      toast.push("Supplier added.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not save this supplier.",
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
      title="Add supplier"
      subtitle="Every shipment and opening balance you tie to them rolls up here."
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
            placeholder="e.g. ABC Garments"
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
              placeholder="e.g. Rahim Uddin"
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
              placeholder="e.g. Sales Manager"
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
            placeholder="e.g. 12 Motijheel C/A, Dhaka 1000"
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
            placeholder="Optional"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Add supplier"}
        </button>
      </div>
    </Modal>
  );
}

export function SuppliersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<SupplierOverviewDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [addOpen, setAddOpen] = useState(false);
  const [createPoOpen, setCreatePoOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listSupplierOverviews();
      setSuppliers(res.suppliers);
    } catch {
      toast.push("Could not load suppliers.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const rows = useMemo(() => {
    const filtered = search.trim()
      ? suppliers.filter((s) =>
          s.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
      : suppliers;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "lastTransactionAt")
        cmp = (a.lastTransactionAt ?? "").localeCompare(
          b.lastTransactionAt ?? "",
        );
      else cmp = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [suppliers, search, sortKey, sortDir]);

  const totals = useMemo(
    () => ({
      count: suppliers.length,
      totalSpend: suppliers.reduce((sum, s) => sum + s.totalSpend, 0),
      totalShipments: suppliers.reduce((sum, s) => sum + s.shipmentCount, 0),
    }),
    [suppliers],
  );

  const SortHeader = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: SortKey;
  }) => (
    // inline-flex (not flex) so this stays an inline-level box that the <th>'s text-left/text-right
    // actually positions — a block-level `flex` button ignores the parent's text-align entirely,
    // which is why sort headers used to sit flush left even under a right-aligned column.
    <button
      onClick={() => toggleSort(sortKeyName)}
      className="inline-flex items-center gap-1 hover:text-slate-700"
    >
      {label}
      {sortKey === sortKeyName ? (
        sortDir === "asc" ? (
          <ArrowUp size={12} />
        ) : (
          <ArrowDown size={12} />
        )
      ) : (
        <ArrowUpDown size={11} className="text-slate-300" />
      )}
    </button>
  );

  return (
    <div className="zs-page">
      <div className="zs-page-header flex flex-wrap items-center justify-between gap-y-3">
        <div>
          <PageTitle>Suppliers</PageTitle>
          <p className="zs-page-description">
            Every transaction with every supplier, in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={loading ? "animate-spin" : undefined}
            />{" "}
            Refresh
          </button>
          <button
            onClick={() => setCreatePoOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Plus size={14} /> New purchase order
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> Add supplier
          </button>
        </div>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              Suppliers {totals.count.toLocaleString()}
            </span>
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500">
              Shipments {totals.totalShipments.toLocaleString()}
            </span>
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
                placeholder="Search suppliers"
                className="zs-search-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="zs-page-body overflow-y-auto">
        {loading && suppliers.length === 0 ? (
          <div className="zs-loading-state">Loading suppliers...</div>
        ) : (
          <div className="space-y-5">
            <div className="zs-summary-strip">
              <MetricCard
                icon={Users}
                label="Suppliers"
                value={String(totals.count)}
                tone="slate"
              />
              <MetricCard
                icon={Landmark}
                label="Total spend"
                value={money(totals.totalSpend)}
                tone="indigo"
              />
              <MetricCard
                icon={Truck}
                label="Shipments logged"
                value={String(totals.totalShipments)}
                tone="emerald"
              />
            </div>

            <div className="zs-table-wrap">
              {suppliers.length === 0 ? (
                <div className="zs-empty-state">
                  <Boxes size={28} className="text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    No suppliers yet
                  </p>
                  <p className="max-w-sm text-xs text-slate-400">
                    Suppliers picked during an Opening balance or Incoming Stock
                    entry show up here automatically, or add one directly.
                  </p>
                </div>
              ) : (
                <>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full text-sm">
                    <thead className="zs-table-head">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          <SortHeader label="Name" sortKeyName="name" />
                        </th>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Contact person
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader
                            label="Total spend"
                            sortKeyName="totalSpend"
                          />
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader
                            label="Shipments"
                            sortKeyName="shipmentCount"
                          />
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader
                            label="Units received"
                            sortKeyName="totalUnits"
                          />
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader
                            label="Last transaction"
                            sortKeyName="lastTransactionAt"
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="zs-table-body">
                      {rows.map((s) => (
                        <tr
                          key={s.id}
                          onClick={() => navigate(`/suppliers/${s.id}`)}
                          className="zs-data-row cursor-pointer"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">
                              {s.name}
                            </p>
                            <p className="text-xs text-slate-400">
                              {s.phone || s.email || "—"}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-700">
                              {s.contactPersonName || "—"}
                            </p>
                            <p className="text-xs text-slate-400">
                              {s.designation || " "}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                            {money(s.totalSpend)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {s.shipmentCount}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {s.totalUnits}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500">
                            {s.lastTransactionAt
                              ? new Date(
                                  s.lastTransactionAt,
                                ).toLocaleDateString()
                              : "Never"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list — same data/handlers as the table above. */}
                <div className="space-y-2.5 p-3 lg:hidden">
                  {rows.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => navigate(`/suppliers/${s.id}`)}
                      className="zs-surface cursor-pointer p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">
                            {s.name}
                          </p>
                          <p className="text-xs text-slate-400">
                            {s.phone || s.email || "—"}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums text-slate-800">
                          {money(s.totalSpend)}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
                        <span className="truncate">
                          {s.contactPersonName || "—"}
                          {s.designation ? ` · ${s.designation}` : ""}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {s.shipmentCount} shipments
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                        <span>{s.totalUnits} units received</span>
                        <span>
                          {s.lastTransactionAt
                            ? new Date(
                                s.lastTransactionAt,
                              ).toLocaleDateString()
                            : "Never"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <AddSupplierModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => void load()}
      />
      <CreatePurchaseOrderModal
        open={createPoOpen}
        mode="create"
        onClose={() => setCreatePoOpen(false)}
        onSaved={(supplierId) => navigate(`/suppliers/${supplierId}`)}
      />
    </div>
  );
}
