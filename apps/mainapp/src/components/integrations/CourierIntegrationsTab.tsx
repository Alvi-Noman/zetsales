import { useEffect, useState } from "react";
import {
  Ban,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  Truck,
  X as XIcon,
} from "lucide-react";
import clsx from "clsx";
import type {
  CourierAccountDTO,
  CourierProvider,
  CourierSettlementDTO,
  CourierHandoverDTO,
  CourierHandoverDetailDTO,
  EligibleHandoverOrderDTO,
  CourierSpeed,
  CourierZoneTier,
} from "@zetsales/shared";
import {
  listCouriers,
  regenerateCourierWebhookSecret,
  removeCourier,
  updateCourierChargeRate,
  listCourierSettlements,
  createCourierSettlement,
  deleteCourierSettlement,
  listEligibleHandoverOrders,
  listCourierHandovers,
  createCourierHandover,
  getCourierHandover,
  confirmCourierHandover,
  deleteCourierHandover,
} from "../../lib/commerceApi";
import { ConnectSteadfastModal } from "./ConnectSteadfastModal";
import { ConnectPathaoModal } from "./ConnectPathaoModal";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useToast } from "../ui/ToastProvider";

function formatMoney(v: number) {
  return `৳${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const ZONE_TIERS: CourierZoneTier[] = ["inside", "outside", "suburb"];
const ZONE_TIER_LABEL: Record<CourierZoneTier, string> = {
  inside: "Inside",
  outside: "Outside",
  suburb: "Suburb",
};
const SPEEDS: CourierSpeed[] = ["regular", "express"];
const SPEED_LABEL: Record<CourierSpeed, string> = {
  regular: "Regular",
  express: "Express",
};

// Cell state as strings (not numbers) so an in-progress edit like "1" while typing "150" doesn't
// get clobbered by Number("1") = 1 on every keystroke — parsed back to number | null only on save.
type RateCells = Record<string, string>;

function cellsFromRates(
  deliveryRates: CourierAccountDTO["deliveryRates"],
  returnRates: CourierAccountDTO["returnRates"],
): RateCells {
  const cells: RateCells = {};
  for (const speed of SPEEDS) {
    for (const zone of ZONE_TIERS) {
      const v = deliveryRates[speed][zone];
      cells[`d:${speed}:${zone}`] = v != null ? String(v) : "";
    }
  }
  for (const zone of ZONE_TIERS) {
    const v = returnRates[zone];
    cells[`r:${zone}`] = v != null ? String(v) : "";
  }
  return cells;
}

function ChargeRateEditor({
  courier,
  onUpdated,
}: {
  courier: CourierAccountDTO;
  onUpdated: (c: CourierAccountDTO) => void;
}) {
  const toast = useToast();
  const [cells, setCells] = useState<RateCells>(() =>
    cellsFromRates(courier.deliveryRates, courier.returnRates),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    for (const value of Object.values(cells)) {
      if (
        value.trim() !== "" &&
        (Number.isNaN(Number(value)) || Number(value) < 0)
      ) {
        toast.push(
          "Enter a non-negative amount, or leave a cell blank.",
          "info",
        );
        return;
      }
    }
    const cell = (key: string) =>
      cells[key]?.trim() ? Number(cells[key]) : null;
    setSaving(true);
    try {
      const { courier: updated } = await updateCourierChargeRate(courier.id, {
        deliveryRates: {
          regular: {
            inside: cell("d:regular:inside"),
            outside: cell("d:regular:outside"),
            suburb: cell("d:regular:suburb"),
          },
          express: {
            inside: cell("d:express:inside"),
            outside: cell("d:express:outside"),
            suburb: cell("d:express:suburb"),
          },
        },
        returnRates: {
          inside: cell("r:inside"),
          outside: cell("r:outside"),
          suburb: cell("r:suburb"),
        },
      });
      onUpdated(updated);
      setCells(cellsFromRates(updated.deliveryRates, updated.returnRates));
      toast.push("Delivery charges saved.");
    } catch {
      toast.push("Could not save delivery charges.", "info");
    } finally {
      setSaving(false);
    }
  };

  const rateInput = (key: string) => (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1">
      <span className="text-[10px] text-slate-400">৳</span>
      <input
        type="number"
        min="0"
        value={cells[key] ?? ""}
        onChange={(e) =>
          setCells((prev) => ({ ...prev, [key]: e.target.value }))
        }
        onBlur={() =>
          JSON.stringify(cells) !==
            JSON.stringify(
              cellsFromRates(courier.deliveryRates, courier.returnRates),
            ) && save()
        }
        placeholder="Not set"
        className="w-14 text-xs text-slate-700 outline-none"
      />
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 items-center gap-1.5 text-[11px]">
        <span className="text-slate-400">Delivery</span>
        {ZONE_TIERS.map((zone) => (
          <span key={zone} className="text-center font-medium text-slate-500">
            {ZONE_TIER_LABEL[zone]}
          </span>
        ))}
        {SPEEDS.map((speed) => (
          <div key={speed} className="contents">
            <span className="text-slate-500">{SPEED_LABEL[speed]}</span>
            {ZONE_TIERS.map((zone) => (
              <div key={zone}>{rateInput(`d:${speed}:${zone}`)}</div>
            ))}
          </div>
        ))}
        <span className="text-slate-400">Return</span>
        {ZONE_TIERS.map((zone) => (
          <div key={zone}>{rateInput(`r:${zone}`)}</div>
        ))}
      </div>
      {saving && <span className="text-[10px] text-slate-400">Saving...</span>}
    </div>
  );
}

function SettlementsSection({ courier }: { courier: CourierAccountDTO }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [settlements, setSettlements] = useState<CourierSettlementDTO[] | null>(
    null,
  );
  const [amount, setAmount] = useState("");
  const [settledAt, setSettledAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [settlementPendingDelete, setSettlementPendingDelete] = useState<string | null>(null);

  const load = async () => {
    try {
      const { settlements: list } = await listCourierSettlements(courier.id);
      setSettlements(list);
    } catch {
      toast.push("Could not load settlement history.", "info");
    }
  };

  useEffect(() => {
    if (open && settlements === null) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleRecord = async () => {
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      toast.push("Enter a positive amount received.", "info");
      return;
    }
    setSaving(true);
    try {
      await createCourierSettlement(courier.id, {
        amount: parsed,
        settledAt,
        note: note.trim() || undefined,
      });
      setAmount("");
      setNote("");
      toast.push("Payout recorded.");
      void load();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Could not record this payout.",
        "info",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setSettlements((prev) => prev?.filter((s) => s.id !== id) ?? null);
    try {
      await deleteCourierSettlement(id);
    } catch {
      toast.push("Could not delete this entry.", "info");
      void load();
    }
  };

  const totalPaid = settlements?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div className="border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-xs font-semibold text-slate-600">
          Payouts received {settlements && `(${formatMoney(totalPaid)} total)`}
        </span>
        <ChevronDown
          size={14}
          className={clsx(
            "text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5">
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">
                Amount
              </label>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-24 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-medium text-slate-500">
                Date
              </label>
              <input
                type="date"
                value={settledAt}
                onChange={(e) => setSettledAt(e.target.value)}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-medium text-slate-500">
                Note (optional)
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. batch #45"
                className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
              />
            </div>
            <button
              onClick={handleRecord}
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Record
            </button>
          </div>
          <div className="space-y-1.5">
            {settlements === null ? (
              <p className="text-xs text-slate-400">Loading...</p>
            ) : settlements.length === 0 ? (
              <p className="text-xs text-slate-400">No payouts recorded yet.</p>
            ) : (
              settlements.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md px-1.5 py-1 text-xs hover:bg-slate-50"
                >
                  <span className="text-slate-600">
                    {new Date(s.settledAt).toLocaleDateString()}{" "}
                    {s.note && (
                      <span className="text-slate-400">· {s.note}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {formatMoney(s.amount)}
                    </span>
                    <button
                      onClick={() => setSettlementPendingDelete(s.id)}
                      className="text-slate-300 hover:text-rose-500"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={settlementPendingDelete != null}
        onClose={() => setSettlementPendingDelete(null)}
        onConfirm={async () => {
          if (settlementPendingDelete) await handleDelete(settlementPendingDelete);
        }}
        title="Delete this payout record?"
        description="This permanently deletes this payout entry. It doesn't affect the underlying orders or courier balance calculations elsewhere — only this record of having recorded it. This can't be undone."
      />
    </div>
  );
}

function CreateHandoverModal({
  open,
  onClose,
  courier,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  courier: CourierAccountDTO;
  onCreated: (handover: CourierHandoverDTO) => void;
}) {
  const toast = useToast();
  const [orders, setOrders] = useState<EligibleHandoverOrderDTO[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [handoverDate, setHandoverDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrders(null);
    setSelected(new Set());
    setNote("");
    void listEligibleHandoverOrders(courier.id).then(({ orders: list }) => {
      setOrders(list);
      setSelected(new Set(list.map((o) => o.orderId)));
    });
  }, [open, courier.id]);

  const toggle = (orderId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const selectedOrders = (orders ?? []).filter((o) => selected.has(o.orderId));
  const totalCod = selectedOrders.reduce((s, o) => s + o.total, 0);
  const totalItems = selectedOrders.reduce((s, o) => s + o.itemCount, 0);

  const handleCreate = async () => {
    if (selected.size === 0) {
      toast.push("Select at least one order.", "info");
      return;
    }
    setSubmitting(true);
    try {
      const { handover } = await createCourierHandover(courier.id, {
        handoverDate,
        orderIds: [...selected],
        note: note.trim() || undefined,
      });
      toast.push(
        `Pickup manifest created — ${handover.parcelCount} parcel${handover.parcelCount === 1 ? "" : "s"}.`,
      );
      onCreated(handover);
      onClose();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Could not create this manifest.",
        "info",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New pickup manifest"
      subtitle={`Parcels being physically handed to ${courier.displayName} today.`}
      widthClass="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Pickup date
            </label>
            <input
              type="date"
              value={handoverDate}
              onChange={(e) => setHandoverDate(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              Note (optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. morning batch"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
          </div>
        </div>

        {orders === null ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Loading eligible orders...
          </p>
        ) : orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No ready-for-pickup orders are waiting for this courier right now.
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              <button
                onClick={() =>
                  setSelected(new Set(orders.map((o) => o.orderId)))
                }
                className="font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Select all
              </button>
              <span>
                {selected.size} of {orders.length} selected · {totalItems} items
                · {formatMoney(totalCod)} COD
              </span>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              {orders.map((o) => (
                <label
                  key={o.orderId}
                  className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.orderId)}
                    onChange={() => toggle(o.orderId)}
                    className="rounded border-slate-300"
                  />
                  <span className="flex-1 truncate">
                    #{o.orderNumber}{" "}
                    <span className="text-slate-400">
                      {o.customerName ?? "No name"}
                    </span>
                  </span>
                  <span className="shrink-0 text-slate-400">
                    {o.itemCount} items
                  </span>
                  <span className="w-20 shrink-0 text-right font-semibold text-slate-700">
                    {formatMoney(o.total)}
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        <button
          onClick={handleCreate}
          disabled={submitting || !orders || selected.size === 0}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Create manifest ({selected.size} parcel
          {selected.size === 1 ? "" : "s"})
        </button>
      </div>
    </Modal>
  );
}

function HandoverDetailModal({
  handoverId,
  onClose,
  onChanged,
}: {
  handoverId: string | null;
  onClose: () => void;
  onChanged: (handover: CourierHandoverDTO) => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<CourierHandoverDetailDTO | null>(null);
  const [confirmNote, setConfirmNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!handoverId) return;
    setDetail(null);
    void getCourierHandover(handoverId).then(({ handover }) =>
      setDetail(handover),
    );
  }, [handoverId]);

  if (!handoverId) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      const { handover } = await confirmCourierHandover(
        handoverId,
        confirmNote.trim() || undefined,
      );
      setDetail((prev) => (prev ? { ...prev, ...handover } : prev));
      onChanged(handover);
      toast.push("Pickup manifest marked as accepted.");
    } catch {
      toast.push("Could not confirm this manifest.", "info");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await deleteCourierHandover(handoverId);
      toast.push("Pickup manifest deleted — its orders are eligible again.");
      onClose();
    } catch {
      toast.push("Could not delete this manifest.", "info");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Pickup manifest"
      subtitle={
        detail ? new Date(detail.handoverDate).toLocaleDateString() : undefined
      }
      widthClass="max-w-3xl"
    >
      {!detail ? (
        <p className="py-8 text-center text-sm text-slate-400">Loading...</p>
      ) : (
        <div id="handover-manifest-print" className="space-y-5">
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 p-4">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Status
              </p>
              <span
                className={clsx(
                  "mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                  detail.status === "Confirmed"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                    : "bg-amber-50 text-amber-700 ring-amber-600/20",
                )}
              >
                {detail.status === "Confirmed" ? (
                  <CheckCircle2 size={11} />
                ) : null}
                {detail.status}
              </span>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Parcels
              </p>
              <p className="text-sm font-bold text-slate-800">
                {detail.parcelCount}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Items
              </p>
              <p className="text-sm font-bold text-slate-800">
                {detail.itemCount}
              </p>
            </div>
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                Total COD
              </p>
              <p className="text-sm font-bold text-slate-800">
                {formatMoney(detail.totalCodAmount)}
              </p>
            </div>
            {detail.note && (
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                  Note
                </p>
                <p className="truncate text-sm text-slate-600">{detail.note}</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Orders in this batch
            </h3>
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Consignment ID</th>
                    <th className="px-3 py-2 text-right">Items</th>
                    <th className="px-3 py-2 text-right">COD</th>
                  </tr>
                </thead>
                <tbody className="zs-table-body">
                  {detail.orders.map((o) => (
                    <tr key={o.orderId}>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        #{o.orderNumber}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {o.customerName ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {o.consignmentId ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{o.itemCount}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">
                        {formatMoney(o.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1.5 rounded-lg border border-slate-200 p-2 sm:hidden">
              {detail.orders.map((o) => (
                <div
                  key={o.orderId}
                  className="rounded-md border border-slate-100 px-2.5 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">
                      #{o.orderNumber}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatMoney(o.total)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-slate-500">
                    <span>{o.customerName ?? "—"}</span>
                    <span>{o.itemCount} items</span>
                  </div>
                  <p className="mt-0.5 text-slate-400">
                    Consignment: {o.consignmentId ?? "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Item-wise breakdown
            </h3>
            <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="zs-table-body">
                  {detail.items.map((it) => (
                    <tr key={`${it.sku}-${it.title}`}>
                      <td className="px-3 py-2 font-medium text-slate-700">
                        {it.title}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {it.sku ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">
                        {it.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1.5 rounded-lg border border-slate-200 p-2 sm:hidden">
              {detail.items.map((it) => (
                <div
                  key={`${it.sku}-${it.title}`}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-100 px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-700">
                      {it.title}
                    </p>
                    <p className="text-slate-400">SKU: {it.sku ?? "—"}</p>
                  </div>
                  <span className="shrink-0 font-semibold text-slate-800">
                    x{it.quantity}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <Printer size={13} /> Print manifest
            </button>
            {detail.status === "Pending" && (
              <>
                <input
                  value={confirmNote}
                  onChange={(e) => setConfirmNote(e.target.value)}
                  placeholder="Discrepancy note (optional)"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400"
                />
                <button
                  onClick={handleConfirm}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle2 size={13} /> Mark accepted
                </button>
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                >
                  <XIcon size={13} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleDelete}
        title="Delete this pickup manifest?"
        confirmLabel="Delete manifest"
        description="This deletes the manifest itself and unlinks its orders from it — those orders aren't deleted and become eligible for a new manifest again. This can't be undone."
      />
    </Modal>
  );
}

function HandoversSection({ courier }: { courier: CourierAccountDTO }) {
  const [open, setOpen] = useState(false);
  const [handovers, setHandovers] = useState<CourierHandoverDTO[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = async () => {
    const { handovers: list } = await listCourierHandovers(courier.id);
    setHandovers(list);
  };

  useEffect(() => {
    if (open && handovers === null) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <ClipboardList size={13} /> Pickup manifests{" "}
          {handovers && `(${handovers.length})`}
        </span>
        <ChevronDown
          size={14}
          className={clsx(
            "text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <button
            onClick={() => setCreateOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-semibold text-slate-500 hover:border-indigo-300 hover:text-indigo-600"
          >
            <Plus size={13} /> New manifest
          </button>
          <div className="space-y-1.5">
            {handovers === null ? (
              <p className="text-xs text-slate-400">Loading...</p>
            ) : handovers.length === 0 ? (
              <p className="text-xs text-slate-400">
                No pickup manifests recorded yet.
              </p>
            ) : (
              handovers.map((h) => (
                <button
                  key={h.id}
                  onClick={() => setDetailId(h.id)}
                  className="flex w-full items-center justify-between rounded-md px-1.5 py-1.5 text-left text-xs hover:bg-slate-50"
                >
                  <span className="flex items-center gap-2 text-slate-600">
                    {new Date(h.handoverDate).toLocaleDateString()}
                    <span
                      className={clsx(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                        h.status === "Confirmed"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-amber-50 text-amber-700 ring-amber-600/20",
                      )}
                    >
                      {h.status}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-slate-400">
                      {h.parcelCount} parcels
                    </span>
                    <span className="font-semibold text-slate-800">
                      {formatMoney(h.totalCodAmount)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <CreateHandoverModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        courier={courier}
        onCreated={(h) => setHandovers((prev) => [h, ...(prev ?? [])])}
      />
      <HandoverDetailModal
        handoverId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={(updated) =>
          setHandovers(
            (prev) =>
              prev?.map((h) => (h.id === updated.id ? updated : h)) ?? null,
          )
        }
      />
    </div>
  );
}

const PROVIDER_META: Record<CourierProvider, { label: string; color: string }> =
  {
    steadfast: { label: "Steadfast", color: "bg-[#e63946]" },
    pathao: { label: "Pathao", color: "bg-[#f4364c]" },
  };

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
        <code className="flex-1 truncate text-xs text-slate-600">{value}</code>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          {copied ? (
            <Check size={13} className="text-emerald-600" />
          ) : (
            <Copy size={13} />
          )}
        </button>
      </div>
    </div>
  );
}

function CourierCard({
  courier,
  onRegenerate,
  onRemove,
  onChargeRateUpdated,
}: {
  courier: CourierAccountDTO;
  onRegenerate: (courier: CourierAccountDTO) => void;
  onRemove: (courier: CourierAccountDTO) => void;
  onChargeRateUpdated: (courier: CourierAccountDTO) => void;
}) {
  const meta = PROVIDER_META[courier.provider];
  return (
    <div className="zs-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white",
              meta.color,
            )}
          >
            <Truck size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {courier.displayName}
            </p>
            <p className="text-[11px] text-slate-300">
              {courier.lastUsedAt
                ? `Last used ${new Date(courier.lastUsedAt).toLocaleDateString()}`
                : "Not used yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={clsx(
              "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              courier.status === "connected"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                : "bg-rose-50 text-rose-700 ring-rose-600/20",
            )}
          >
            {courier.status === "connected" ? "Connected" : "Error"}
          </span>
          <button
            onClick={() => onRemove(courier)}
            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
          >
            <Ban size={14} />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-3">
        <CopyField label="Webhook URL" value={courier.webhookUrl} />
        <CopyField label="Webhook secret" value={courier.webhookSecret} />
        <p className="text-xs text-slate-400">
          Paste both into {meta.label}'s webhook settings so delivery status
          updates flow back into ZetSales automatically.
        </p>
        <button
          onClick={() => onRegenerate(courier)}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <RefreshCw size={11} /> Regenerate secret
        </button>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <ChargeRateEditor courier={courier} onUpdated={onChargeRateUpdated} />
        <p className="mt-1 text-[11px] text-slate-400">
          Estimates per parcel by speed and zone — {meta.label} doesn't expose
          real per-shipment cost via API, so this feeds the Courier
          Reconciliation report as "expected receivable," not an exact bill.
        </p>
      </div>

      <div className="mt-3">
        <SettlementsSection courier={courier} />
      </div>
      <div className="mt-3">
        <HandoversSection courier={courier} />
      </div>
    </div>
  );
}

export function CourierIntegrationsTab() {
  const toast = useToast();
  const [couriers, setCouriers] = useState<CourierAccountDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [steadfastModalOpen, setSteadfastModalOpen] = useState(false);
  const [pathaoModalOpen, setPathaoModalOpen] = useState(false);
  const [courierPendingRemoval, setCourierPendingRemoval] = useState<CourierAccountDTO | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { couriers: list } = await listCouriers();
      setCouriers(list);
    } catch {
      toast.push("Could not load courier accounts.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConnected = (courier: CourierAccountDTO) => {
    setCouriers((prev) => [
      courier,
      ...prev.filter((c) => c.id !== courier.id),
    ]);
  };

  const handleRemove = async (courier: CourierAccountDTO) => {
    setCouriers((prev) => prev.filter((c) => c.id !== courier.id));
    try {
      await removeCourier(courier.id);
      toast.push(`Disconnected ${courier.displayName}.`);
    } catch {
      toast.push("Could not disconnect this courier.", "info");
      void load();
    }
  };

  const handleRegenerate = async (courier: CourierAccountDTO) => {
    try {
      const { courier: updated } = await regenerateCourierWebhookSecret(
        courier.id,
      );
      setCouriers((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
      toast.push(
        "New webhook secret generated — update it in your courier panel too.",
      );
    } catch {
      toast.push("Could not regenerate the webhook secret.", "info");
    }
  };

  const steadfastCourier = couriers.find((c) => c.provider === "steadfast");
  const pathaoCourier = couriers.find((c) => c.provider === "pathao");

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between zs-surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#e63946] text-white">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Steadfast</p>
              <p className="text-xs text-slate-400">
                {steadfastCourier ? "Account connected" : "Not connected"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setSteadfastModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={14} /> {steadfastCourier ? "Reconnect" : "Connect"}
          </button>
        </div>

        <div className="flex items-center justify-between zs-surface p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#f4364c] text-white">
              <Truck size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">Pathao</p>
              <p className="text-xs text-slate-400">
                {pathaoCourier ? "Account connected" : "Not connected"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPathaoModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus size={14} /> {pathaoCourier ? "Reconnect" : "Connect"}
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          Connected couriers
        </h2>
        {loading ? (
          <div className="zs-loading-state zs-dashed-surface h-40">
            Loading...
          </div>
        ) : couriers.length === 0 ? (
          <div className="zs-dashed-surface flex flex-col items-center justify-center gap-2 py-14 text-center">
            <Package size={24} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              No couriers connected yet
            </p>
            <p className="text-xs text-slate-400">
              Connect Steadfast or Pathao above to start handing off shipped
              orders automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {couriers.map((courier) => (
              <CourierCard
                key={courier.id}
                courier={courier}
                onRegenerate={handleRegenerate}
                onRemove={setCourierPendingRemoval}
                onChargeRateUpdated={(updated) =>
                  setCouriers((prev) =>
                    prev.map((c) => (c.id === updated.id ? updated : c)),
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      <ConnectSteadfastModal
        open={steadfastModalOpen}
        onClose={() => setSteadfastModalOpen(false)}
        onConnected={handleConnected}
      />
      <ConnectPathaoModal
        open={pathaoModalOpen}
        onClose={() => setPathaoModalOpen(false)}
        onConnected={handleConnected}
      />
      <ConfirmDialog
        open={courierPendingRemoval != null}
        onClose={() => setCourierPendingRemoval(null)}
        onConfirm={async () => {
          if (courierPendingRemoval) await handleRemove(courierPendingRemoval);
        }}
        title={`Disconnect ${courierPendingRemoval?.displayName ?? "this courier"}?`}
        confirmLabel="Disconnect"
        description="This permanently removes this courier connection. Existing settlements and pickup manifests won't be deleted, but you'll need to reconnect before booking new shipments with this courier. This can't be undone."
      />
    </div>
  );
}
