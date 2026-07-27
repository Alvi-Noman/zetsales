import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Package,
  Printer,
  RefreshCw,
  Search,
  Truck,
} from "lucide-react";
import clsx from "clsx";
import type {
  CourierAccountDTO,
  CourierHandoverDTO,
  CourierHandoverDetailDTO,
  EligibleHandoverOrderDTO,
} from "@zetsales/shared";
import {
  confirmCourierHandover,
  createCourierHandover,
  getCourierHandover,
  listCourierHandovers,
  listCouriers,
  listEligibleHandoverOrders,
} from "../../lib/commerceApi";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../components/ui/ToastProvider";
import { Barcode } from "../../components/orders/Barcode";
import { PageTitle } from "../../components/layout/PageTitle";

function money(value: number) {
  return `৳${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function providerLabel(courier: CourierAccountDTO) {
  return courier.provider === "steadfast" ? "Steadfast" : "Pathao";
}

function ManifestModal({
  handoverId,
  onClose,
  onConfirmed,
}: {
  handoverId: string | null;
  onClose: () => void;
  onConfirmed: (handover: CourierHandoverDTO) => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<CourierHandoverDetailDTO | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!handoverId) return;
    setDetail(null);
    setNote("");
    void getCourierHandover(handoverId)
      .then(({ handover }) => setDetail(handover))
      .catch(() => toast.push("Could not load this pickup manifest.", "info"));
  }, [handoverId, toast]);

  if (!handoverId) return null;

  const markReceived = async () => {
    setBusy(true);
    try {
      const { handover } = await confirmCourierHandover(
        handoverId,
        note.trim() || undefined,
      );
      setDetail((prev) => (prev ? { ...prev, ...handover } : prev));
      onConfirmed(handover);
      toast.push("Pickup manifest marked as accepted by courier.");
    } catch {
      toast.push("Could not mark this manifest as accepted.", "info");
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
      widthClass="max-w-4xl"
    >
      {!detail ? (
        <p className="py-10 text-center text-sm text-slate-400">
          Loading manifest...
        </p>
      ) : (
        <div className="space-y-5">
          <div className="print-area space-y-5">
            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 p-4">
              <div className="min-w-[12rem]">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                  Manifest
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {detail.manifestNo}
                </p>
                <div className="mt-2 w-44">
                  <Barcode value={detail.manifestNo} height={30} />
                </div>
              </div>
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
                  {detail.status === "Confirmed" && <CheckCircle2 size={11} />}
                  {detail.status === "Confirmed"
                    ? "Accepted by courier"
                    : "Waiting for courier"}
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
                  COD total
                </p>
                <p className="text-sm font-bold text-slate-800">
                  {money(detail.totalCodAmount)}
                </p>
              </div>
              {detail.note && (
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">
                    Note
                  </p>
                  <p className="truncate text-sm text-slate-600">
                    {detail.note}
                  </p>
                </div>
              )}
            </div>

            <div className="hidden overflow-hidden rounded-lg border border-slate-200 lg:block">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[10.5px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2">Bill / Order</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Consignment</th>
                    <th className="px-3 py-2 text-right">Items</th>
                    <th className="px-3 py-2 text-right">COD</th>
                  </tr>
                </thead>
                <tbody className="zs-table-body">
                  {detail.orders.map((order) => (
                    <tr key={order.orderId}>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-800">
                          {order.invoiceNo ?? order.orderNumber}
                        </p>
                        {order.invoiceNo && (
                          <p className="text-[10px] text-slate-400">
                            {order.orderNumber}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {order.customerName ?? "-"}
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-500">
                        {order.consignmentId ?? "-"}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {order.itemCount}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-800">
                        {money(order.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list — same data as the table above. */}
            <div className="space-y-2 lg:hidden">
              {detail.orders.map((order) => (
                <div
                  key={order.orderId}
                  className="rounded-lg border border-slate-200 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-800">
                        {order.invoiceNo ?? order.orderNumber}
                      </p>
                      {order.invoiceNo && (
                        <p className="text-[10px] text-slate-400">
                          {order.orderNumber}
                        </p>
                      )}
                    </div>
                    <p className="shrink-0 font-semibold text-slate-800">
                      {money(order.total)}
                    </p>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-slate-500">
                    <span className="truncate">
                      {order.customerName ?? "-"}
                    </span>
                    <span className="shrink-0 font-mono text-slate-400">
                      {order.consignmentId ?? "-"} · {order.itemCount} items
                    </span>
                  </div>
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
            {detail.status !== "Confirmed" && (
              <>
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Courier receipt note (optional)"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400"
                />
                <button
                  onClick={markReceived}
                  disabled={busy}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <CheckCircle2 size={13} /> Mark accepted by courier
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function CourierHandoverPanel({
  onChanged,
}: { onChanged?: () => void } = {}) {
  const toast = useToast();
  const [couriers, setCouriers] = useState<CourierAccountDTO[]>([]);
  const [courierId, setCourierId] = useState("");
  const [eligible, setEligible] = useState<EligibleHandoverOrderDTO[]>([]);
  const [handovers, setHandovers] = useState<CourierHandoverDTO[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanInput, setScanInput] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeHandoverId, setActiveHandoverId] = useState<string | null>(null);

  const activeCourier =
    couriers.find((courier) => courier.id === courierId) ?? null;
  const selectedOrders = eligible.filter((order) =>
    selected.has(order.orderId),
  );
  const selectedItems = selectedOrders.reduce(
    (sum, order) => sum + order.itemCount,
    0,
  );
  const selectedCod = selectedOrders.reduce(
    (sum, order) => sum + order.total,
    0,
  );

  const lookup = useMemo(() => {
    const map = new Map<string, EligibleHandoverOrderDTO>();
    for (const order of eligible) {
      map.set(order.orderNumber.toLowerCase(), order);
      if (order.invoiceNo) map.set(order.invoiceNo.toLowerCase(), order);
      if (order.consignmentId)
        map.set(order.consignmentId.toLowerCase(), order);
    }
    return map;
  }, [eligible]);

  const loadCouriers = async () => {
    setLoading(true);
    try {
      const { couriers: list } = await listCouriers();
      setCouriers(list);
      setCourierId((current) => current || list[0]?.id || "");
    } catch {
      toast.push("Could not load couriers.", "info");
    } finally {
      setLoading(false);
    }
  };

  const loadCourierWork = async (id: string) => {
    if (!id) {
      setEligible([]);
      setHandovers([]);
      return;
    }
    setLoading(true);
    try {
      const [eligibleRes, handoversRes] = await Promise.all([
        listEligibleHandoverOrders(id),
        listCourierHandovers(id),
      ]);
      setEligible(eligibleRes.orders);
      setHandovers(handoversRes.handovers);
      setSelected(new Set());
    } catch {
      toast.push("Could not load pickup work.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCouriers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadCourierWork(courierId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courierId]);

  const toggle = (orderId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const scan = () => {
    const value = scanInput.trim().toLowerCase().replace(/^#/, "");
    if (!value) return;
    const found = lookup.get(value) ?? lookup.get(`#${value}`);
    if (!found) {
      toast.push(
        "No waiting parcel matches that order or consignment code.",
        "info",
      );
      return;
    }
    setSelected((previous) => new Set(previous).add(found.orderId));
    setScanInput("");
  };

  const createManifest = async () => {
    if (!activeCourier || selected.size === 0) return;
    setCreating(true);
    try {
      const { handover } = await createCourierHandover(activeCourier.id, {
        handoverDate: new Date().toISOString(),
        orderIds: [...selected],
        note: note.trim() || undefined,
      });
      toast.push(
        `Pickup manifest created for ${handover.parcelCount} parcel${handover.parcelCount === 1 ? "" : "s"}.`,
      );
      setNote("");
      setHandovers((previous) => [handover, ...previous]);
      setActiveHandoverId(handover.id);
      await loadCourierWork(activeCourier.id);
      onChanged?.();
    } catch (error) {
      toast.push(
        error instanceof Error
          ? error.message
          : "Could not create pickup manifest.",
        "info",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Scan or select ready parcels, then print the manifest when the rider
          picks them up.
        </p>
        <button
          onClick={() => courierId && loadCourierWork(courierId)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <main className="space-y-4">
          <section className="zs-surface p-4">
            <div className="flex flex-wrap items-center gap-2">
              {couriers.map((courier) => (
                <button
                  key={courier.id}
                  onClick={() => setCourierId(courier.id)}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold",
                    courierId === courier.id
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <Truck size={14} />{" "}
                  {courier.displayName || providerLabel(courier)}
                </button>
              ))}
              {!loading && couriers.length === 0 && (
                <p className="text-sm text-slate-400">
                  Connect a courier account first.
                </p>
              )}
            </div>
          </section>

          <section className="zs-surface overflow-hidden">
            <div className="zs-section-toolbar">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Waiting for pickup
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  These parcels are ready for pickup but not yet added to a
                  manifest.
                </p>
              </div>
              <div className="zs-toolbox-right">
                <div className="zs-search">
                  <Search
                    size={15}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={scanInput}
                    onChange={(event) => setScanInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") scan();
                    }}
                    placeholder="Scan order or consignment"
                    className="zs-search-input"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="zs-loading-state">Loading parcels...</div>
            ) : eligible.length === 0 ? (
              <div className="zs-empty-state">
                <Package size={28} className="text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">
                  No parcels waiting for pickup
                </p>
                <p className="max-w-md text-sm text-slate-400">
                  Mark packed orders ready for pickup first. They will appear
                  here before physical handover.
                </p>
              </div>
            ) : (
              <div className="zs-table-body">
                <label className="flex cursor-pointer items-center gap-3 px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.size === eligible.length}
                    onChange={() =>
                      setSelected(
                        selected.size === eligible.length
                          ? new Set()
                          : new Set(eligible.map((order) => order.orderId)),
                      )
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {selected.size} of {eligible.length} selected
                </label>
                {eligible.map((order) => (
                  <label
                    key={order.orderId}
                    className="zs-data-row flex cursor-pointer items-center gap-3 px-4 py-3"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(order.orderId)}
                      onChange={() => toggle(order.orderId)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {order.invoiceNo ?? order.orderNumber}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {order.customerName ?? "No customer"}{" "}
                        {order.consignmentId ? `· ${order.consignmentId}` : ""}
                      </p>
                      {order.invoiceNo && (
                        <p className="truncate text-[10px] text-slate-400">
                          {order.orderNumber}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {order.itemCount} items
                    </span>
                    <span className="w-20 text-right text-sm font-bold text-slate-800">
                      {money(order.total)}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-4">
          <section className="zs-surface p-4">
            <h2 className="text-sm font-bold text-slate-900">
              Create manifest
            </h2>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Parcels
                </p>
                <p className="mt-1 text-lg font-black text-slate-900">
                  {selected.size}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Items
                </p>
                <p className="mt-1 text-lg font-black text-slate-900">
                  {selectedItems}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  COD
                </p>
                <p className="mt-1 text-lg font-black text-slate-900">
                  {money(selectedCod)}
                </p>
              </div>
            </div>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Batch note, rider name, route, or receipt code"
              className="mt-3 h-20 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            />
            <button
              onClick={createManifest}
              disabled={creating || selected.size === 0}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ClipboardList size={14} /> Create pickup manifest
            </button>
          </section>

          <section className="zs-surface p-4">
            <h2 className="text-sm font-bold text-slate-900">
              Recent manifests
            </h2>
            <div className="mt-3 space-y-1.5">
              {handovers.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No manifests yet for this courier.
                </p>
              ) : (
                handovers.slice(0, 8).map((handover) => (
                  <button
                    key={handover.id}
                    onClick={() => setActiveHandoverId(handover.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-xs hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-700">
                        {handover.manifestNo}
                      </span>
                      <span className="block text-slate-400">
                        {new Date(handover.handoverDate).toLocaleDateString()}
                      </span>
                      <span className="text-slate-400">
                        {handover.parcelCount} parcels ·{" "}
                        {money(handover.totalCodAmount)}
                      </span>
                    </span>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset",
                        handover.status === "Confirmed"
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
                          : "bg-amber-50 text-amber-700 ring-amber-600/20",
                      )}
                    >
                      {handover.status === "Confirmed" ? "Received" : "Pending"}
                    </span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>

      <ManifestModal
        handoverId={activeHandoverId}
        onClose={() => setActiveHandoverId(null)}
        onConfirmed={(updated) => {
          setHandovers((previous) =>
            previous.map((handover) =>
              handover.id === updated.id ? updated : handover,
            ),
          );
          if (courierId) void loadCourierWork(courierId);
          onChanged?.();
        }}
      />
    </div>
  );
}

export function CourierHandoverPage() {
  return (
    <div className="zs-page">
      <div className="zs-page-header">
        <PageTitle>Pickup Manifests</PageTitle>
        <p className="zs-page-description">
          Build courier handover sheets from pickup-ready orders.
        </p>
      </div>
      <div className="zs-page-body">
        <CourierHandoverPanel />
      </div>
    </div>
  );
}
