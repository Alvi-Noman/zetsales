import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock, RotateCcw, Search, Truck, X } from "lucide-react";
import clsx from "clsx";
import type { OrderDTO, StoreDTO } from "@zetsales/shared";
import { listOrders, listStores, updateOrder } from "../../lib/commerceApi";
import { useToast } from "../../components/ui/ToastProvider";
import { formatAbsoluteDateTime } from "../../components/orders/time";

function money(order: OrderDTO) {
  return `${order.currency} ${order.total.toLocaleString()}`;
}

function orderCode(order: OrderDTO) {
  return order.invoiceNo ?? order.number;
}

function codeTokens(value: string | null | undefined) {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return [];
  const withoutHash = raw.replace(/^#/, "");
  return Array.from(new Set([raw, withoutHash, `#${withoutHash}`]));
}

function orderMatchesCode(order: OrderDTO, code: string) {
  const wanted = new Set(codeTokens(code));
  return [
    order.invoiceNo,
    order.number,
    order.courierTrackingId,
    order.courierConsignmentId,
  ].some((value) => codeTokens(value).some((token) => wanted.has(token)));
}

export function DispatchPage() {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState("");
  const [readyOrders, setReadyOrders] = useState<OrderDTO[]>([]);
  const [stores, setStores] = useState<StoreDTO[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recent, setRecent] = useState<OrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const readyCount = readyOrders.length;
  const readyCod = useMemo(
    () => readyOrders.reduce((sum, order) => sum + order.total, 0),
    [readyOrders],
  );
  const storeById = useMemo(
    () => new Map(stores.map((store) => [store.id, store])),
    [stores],
  );
  const query = scanInput.trim().toLowerCase();
  const filteredReadyOrders = useMemo(() => {
    if (!query) return readyOrders;
    return readyOrders.filter((order) => {
      const store = storeById.get(order.storeId);
      const haystack = [
        order.invoiceNo,
        order.number,
        order.customerName,
        order.customerPhone,
        order.customerAltPhone,
        order.courierTrackingId,
        order.courierConsignmentId,
        store?.displayName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [query, readyOrders, storeById]);
  const selectedOrders = useMemo(
    () => readyOrders.filter((order) => selected.has(order.id)),
    [readyOrders, selected],
  );
  const filteredIds = useMemo(
    () => filteredReadyOrders.map((order) => order.id),
    [filteredReadyOrders],
  );
  const allVisibleSelected =
    filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));

  const loadReady = async () => {
    setLoading(true);
    try {
      const { orders } = await listOrders({
        tab: "courierBooked",
        sortKey: "date",
        sortDir: "asc",
        pageSize: 100,
      });
      setReadyOrders(orders);
    } catch {
      toast.push("Could not load ready parcels.", "info");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    void loadReady();
    void listStores()
      .then(setStores)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelected = (orderId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handOverOrders = async (ordersToHandOver: OrderDTO[]) => {
    if (ordersToHandOver.length === 0 || scanning) return;
    setScanning(true);
    const handed: OrderDTO[] = [];
    const failures: string[] = [];
    try {
      for (const order of ordersToHandOver) {
        try {
          const res = await updateOrder(order.id, {
            stage: "Shipped",
            note: "Handed over to courier",
          });
          handed.push(res.order);
        } catch (error) {
          failures.push(
            error instanceof Error
              ? error.message
              : `${orderCode(order)} could not be handed over.`,
          );
        }
      }
      const handedIds = new Set(handed.map((order) => order.id));
      setReadyOrders((current) =>
        current.filter((order) => !handedIds.has(order.id)),
      );
      setSelected(new Set());
      setRecent((current) =>
        [
          ...handed,
          ...current.filter((order) => !handedIds.has(order.id)),
        ].slice(0, 25),
      );
      if (handed.length > 0) {
        setLastResult({
          type: failures.length > 0 ? "error" : "success",
          message:
            failures.length > 0
              ? `Handed over ${handed.length} parcel${handed.length === 1 ? "" : "s"}; ${failures.length} failed: ${failures[0]}`
              : `Handed over ${handed.length} parcel${handed.length === 1 ? "" : "s"}.`,
        });
      } else {
        setLastResult({
          type: "error",
          message: failures[0] ?? "Could not hand over selected parcels.",
        });
      }
    } finally {
      setScanning(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleScan = async () => {
    const code = scanInput.trim();
    if (!code || scanning) return;

    const localMatch = readyOrders.find((order) =>
      orderMatchesCode(order, code),
    );
    if (localMatch) {
      await handOverOrders([localMatch]);
      setScanInput("");
      return;
    }

    setScanning(true);
    try {
      const searchTerm = code.replace(/^#/, "");
      const { orders } = await listOrders({
        tab: "courierBooked",
        search: searchTerm,
        sortKey: "date",
        sortDir: "asc",
        pageSize: 10,
      });
      const exactMatch = orders.find((order) => orderMatchesCode(order, code));
      const match = exactMatch ?? (orders.length === 1 ? orders[0] : null);
      if (!match) {
        setLastResult({
          type: "error",
          message: `No ready parcel matches ${code}.`,
        });
        setScanInput("");
        return;
      }

      const { order } = await updateOrder(match.id, {
        stage: "Shipped",
        note: "Handed over to courier",
      });
      setReadyOrders((current) =>
        current.filter((item) => item.id !== order.id),
      );
      setSelected((current) => {
        const next = new Set(current);
        next.delete(order.id);
        return next;
      });
      setRecent((current) =>
        [order, ...current.filter((item) => item.id !== order.id)].slice(0, 25),
      );
      setLastResult({
        type: "success",
        message: `${orderCode(order)} handed over to courier.`,
      });
      setScanInput("");
    } catch (error) {
      setLastResult({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not hand over this parcel.",
      });
      setScanInput("");
    } finally {
      setScanning(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handOverSelected = async () => {
    await handOverOrders(selectedOrders);
  };

  const undoLast = async () => {
    const [last] = recent;
    if (!last) return;
    setScanning(true);
    try {
      const { order } = await updateOrder(last.id, {
        stage: "Ready for Pickup",
        note: "Dispatch scan undone",
      });
      setRecent((current) => current.slice(1));
      setReadyOrders((current) => [order, ...current]);
      setLastResult({
        type: "success",
        message: `${orderCode(order)} returned to Ready for pickup.`,
      });
    } catch {
      toast.push("Could not undo the last scan.", "info");
    } finally {
      setScanning(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="zs-page-title">Dispatch</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 tabular-nums">
              {readyCount.toLocaleString()}
            </span>
          </div>
          <p className="zs-page-description">
            Scan or select ready parcels when handing them to the courier.
          </p>
        </div>
        <button
          onClick={() => void loadReady()}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw size={14} /> Refresh
        </button>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              Waiting {readyCount.toLocaleString()}
            </span>
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              COD {readyCod.toLocaleString()}
            </span>
            <span className="inline-flex h-8 items-center rounded-lg border border-emerald-100 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
              Handed over {recent.length.toLocaleString()}
            </span>
          </div>
          <div className="zs-toolbox-right">
            <div className="zs-search sm:w-[28rem]">
              <Search
                size={15}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                ref={inputRef}
                value={scanInput}
                onChange={(event) => setScanInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleScan();
                }}
                placeholder="Scan or search bill, order, customer, phone, tracking"
                className="zs-search-input"
              />
            </div>
            <button
              onClick={() => void handleScan()}
              disabled={scanning || !scanInput.trim()}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Truck size={13} /> Hand over
            </button>
          </div>
        </div>
        {lastResult && (
          <div
            className={clsx(
              "mt-3 rounded-lg px-3 py-2 text-sm font-semibold",
              lastResult.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-rose-50 text-rose-700",
            )}
          >
            {lastResult.message}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-x-auto">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">
            Loading parcels...
          </div>
        ) : readyOrders.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-2 px-8 text-center">
            <Truck size={28} className="text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              No parcels are ready for pickup
            </p>
            <p className="max-w-sm text-sm text-slate-400">
              Orders marked Ready for pickup will appear here for barcode scan
              or manual handover.
            </p>
          </div>
        ) : filteredReadyOrders.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            No ready parcel matches this search.
          </div>
        ) : (
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="zs-table-head">
                <th className="w-10 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </th>
                <th className="px-3 py-2.5">Bill</th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Channel</th>
                <th className="px-3 py-2.5">Courier</th>
                <th className="px-3 py-2.5 text-right">COD</th>
                <th className="px-3 py-2.5">Ready since</th>
                <th className="w-28 px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredReadyOrders.map((order) => {
                const store = storeById.get(order.storeId);
                return (
                  <tr
                    key={order.id}
                    className={clsx(
                      "zs-data-row border-b border-slate-100",
                      selected.has(order.id)
                        ? "bg-indigo-50/60 hover:bg-indigo-50/70"
                        : undefined,
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(order.id)}
                        onChange={() => toggleSelected(order.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        aria-label={`Select ${orderCode(order)}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-900">
                        {orderCode(order)}
                      </p>
                      {order.invoiceNo && (
                        <p className="text-xs text-slate-400">
                          Order {order.number}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-800">
                        {order.customerName ?? "No customer"}
                      </p>
                      <p className="text-xs text-slate-400">
                        {order.customerPhone ?? "No phone"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {store?.displayName ?? "Store"}
                    </td>
                    <td className="px-3 py-3">
                      <p className="capitalize text-slate-700">
                        {order.courierPartner ?? "Courier"}
                      </p>
                      {order.courierConsignmentId && (
                        <p className="text-xs text-slate-400">
                          {order.courierConsignmentId}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-900">
                      {money(order)}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-500">
                      {formatAbsoluteDateTime(order.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => void handOverOrders([order])}
                        disabled={scanning}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Hand over
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {recent.length > 0 && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 lg:px-8">
          <div className="flex items-center gap-4 overflow-x-auto">
            <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Recent
            </span>
            {recent.slice(0, 8).map((order) => (
              <div
                key={order.id}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-1.5"
              >
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span className="text-xs font-semibold text-slate-700">
                  {orderCode(order)}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                  <Clock size={10} /> {formatAbsoluteDateTime(order.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedOrders.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
          <div className="pointer-events-auto flex animate-pop-in items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/95 px-3 py-2 text-white shadow-2xl shadow-slate-900/30 backdrop-blur">
            <button
              onClick={() => setSelected(new Set())}
              className="rounded-full p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <X size={14} />
            </button>
            <span className="pr-1 text-sm font-semibold tabular-nums">
              {selectedOrders.length} selected
            </span>
            <div className="h-5 w-px bg-white/10" />
            <button
              onClick={() => void handOverSelected()}
              disabled={scanning}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
            >
              <Truck size={13} /> Hand over to courier
            </button>
            <button
              onClick={() => void undoLast()}
              disabled={scanning || recent.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20 disabled:opacity-60"
            >
              <RotateCcw size={13} /> Undo last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
