import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
  Calendar,
  Mail,
  MapPin,
  Package,
  Phone,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import {
  blockCustomer,
  getCustomer,
  listCustomerOrders,
  unblockCustomer,
} from "../../lib/commerceApi";
import type {
  CustomerDetailDTO,
  CustomerOrderRowDTO,
  OrderStage,
} from "@zetsales/shared";
import { STAGE_LABEL } from "../../components/orders/orderTone";
import { useToast } from "../../components/ui/ToastProvider";
import { AppBlock } from "../../components/apps/AppBlock";

function money(value: number) {
  return `৳${Math.round(value).toLocaleString()}`;
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

const RISK_TONE: Record<string, string> = {
  Trusted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Normal: "bg-slate-100 text-slate-600 ring-slate-500/20",
  Risky: "bg-rose-50 text-rose-700 ring-rose-600/20",
  "New Customer": "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
};

const STAGE_TONE: Record<string, string> = {
  Delivered: "bg-emerald-50 text-emerald-700",
  "Partial Delivered": "bg-emerald-50 text-emerald-700",
  Cancelled: "bg-rose-50 text-rose-700",
  Returned: "bg-rose-50 text-rose-700",
  "RTO Initiated": "bg-amber-50 text-amber-700",
  "QC Pending": "bg-amber-50 text-amber-700",
  "On Hold": "bg-amber-50 text-amber-700",
};

export function CustomerDetailPage() {
  const { phone } = useParams<{ phone: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [customer, setCustomer] = useState<CustomerDetailDTO | null>(null);
  const [orders, setOrders] = useState<CustomerOrderRowDTO[] | null>(null);
  const [blocking, setBlocking] = useState(false);

  const load = async () => {
    if (!phone) return;
    try {
      const [customerRes, ordersRes] = await Promise.all([
        getCustomer(phone),
        listCustomerOrders(phone),
      ]);
      setCustomer(customerRes.customer);
      setOrders(ordersRes.orders);
    } catch {
      toast.push("Could not load this customer.", "info");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  const handleToggleBlock = async () => {
    if (!customer) return;
    setBlocking(true);
    try {
      if (customer.isBlocked) {
        await unblockCustomer(customer.recentOrderId);
        toast.push("Customer unblocked.");
      } else {
        await blockCustomer(customer.recentOrderId, null);
        toast.push(
          "Customer blocked — future orders from this number auto-cancel.",
        );
      }
      setCustomer((prev) =>
        prev ? { ...prev, isBlocked: !prev.isBlocked } : prev,
      );
    } catch {
      toast.push("Could not update block status.", "info");
    } finally {
      setBlocking(false);
    }
  };

  if (!customer) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        Loading...
      </div>
    );
  }

  const avgOrderValue =
    customer.orderCount > 0 ? customer.totalSpend / customer.orderCount : 0;

  return (
    <div className="zs-page-scroll">
      <div className="zs-page-header">
        <button
          onClick={() => navigate("/customers")}
          className="mb-3 flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-700"
        >
          <ArrowLeft size={13} /> All customers
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="zs-page-title">{customer.name ?? "No name"}</h1>
              <span
                className={clsx(
                  "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                  RISK_TONE[customer.riskLabel],
                )}
              >
                {customer.riskLabel}
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                {customer.segment}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <Phone size={13} /> {customer.phone}
              </span>
              {customer.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={13} /> {customer.email}
                </span>
              )}
              {customer.address && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} /> {customer.address}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <Calendar size={13} /> Customer since{" "}
                {new Date(customer.firstOrderAt).toLocaleDateString()}
              </span>
            </div>
          </div>
          <button
            onClick={() => void handleToggleBlock()}
            disabled={blocking}
            className={clsx(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold disabled:opacity-60",
              customer.isBlocked
                ? "border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                : "border border-rose-200 text-rose-600 hover:bg-rose-50",
            )}
          >
            {customer.isBlocked ? <ShieldCheck size={14} /> : <Ban size={14} />}
            {customer.isBlocked ? "Unblock customer" : "Block customer"}
          </button>
        </div>
      </div>

      <div className="zs-page-body space-y-5">
        <div className="zs-summary-strip">
          <MetricCard
            icon={Package}
            label="Orders"
            value={String(customer.orderCount)}
            tone="slate"
          />
          <MetricCard
            icon={Wallet}
            label="Lifetime spend"
            value={money(customer.totalSpend)}
            tone="indigo"
          />
          <MetricCard
            icon={Wallet}
            label="Avg order value"
            value={money(avgOrderValue)}
            tone="slate"
          />
          <MetricCard
            icon={ShieldCheck}
            label="Delivered rate"
            value={
              customer.deliveredRate != null
                ? `${customer.deliveredRate}%`
                : "—"
            }
            tone="emerald"
          />
        </div>

        <AppBlock
          target="admin.customer-details.block"
          context={{ phone: customer.phone }}
        />

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Order history
          </h2>
          {orders === null ? (
            <div className="flex h-32 items-center justify-center text-sm text-slate-400">
              Loading orders...
            </div>
          ) : (
            <>
            <div className="zs-table-wrap hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead className="zs-table-head">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-semibold">
                      Order
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold">
                      Date
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold">
                      Stage
                    </th>
                    <th className="px-4 py-2.5 text-left font-semibold">
                      Payment
                    </th>
                    <th className="px-4 py-2.5 text-right font-semibold">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="zs-table-body">
                  {orders.map((o) => (
                    <tr key={o.orderId} className="zs-data-row">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        #{o.number}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(o.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={clsx(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            STAGE_TONE[o.stage] ??
                              "bg-slate-100 text-slate-600",
                          )}
                        >
                          {STAGE_LABEL[o.stage as OrderStage] ?? o.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {o.paymentStatus}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                        {money(o.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list — same data as the table above. */}
            <div className="zs-table-wrap space-y-2.5 p-3 lg:hidden">
              {orders.map((o) => (
                <div key={o.orderId} className="zs-surface p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-slate-800">#{o.number}</p>
                    <span
                      className={clsx(
                        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                        STAGE_TONE[o.stage] ?? "bg-slate-100 text-slate-600",
                      )}
                    >
                      {STAGE_LABEL[o.stage as OrderStage] ?? o.stage}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                    <div className="text-xs text-slate-500">
                      {new Date(o.createdAt).toLocaleDateString()}
                      {" · "}
                      {o.paymentStatus}
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-slate-800">
                      {money(o.total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
