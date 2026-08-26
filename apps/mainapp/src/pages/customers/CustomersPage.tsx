import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  RefreshCw,
  Repeat,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import clsx from "clsx";
import { listCustomers } from "../../lib/commerceApi";
import type { CustomerRowDTO } from "@zetsales/shared";
import { useToast } from "../../components/ui/ToastProvider";
import { AppBlock } from "../../components/apps/AppBlock";
import { PageTitle } from "../../components/layout/PageTitle";

function money(value: number) {
  return `৳${Math.round(value).toLocaleString()}`;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: "slate" | "emerald" | "indigo" | "rose";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
    rose: "bg-rose-50 text-rose-600",
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

type SortKey =
  | "name"
  | "orderCount"
  | "totalSpend"
  | "deliveredRate"
  | "lastOrderAt";

export function CustomersPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<CustomerRowDTO[]>([]);
  const [summary, setSummary] = useState<{
    totalCustomers: number;
    repeatCount: number;
    repeatRevenueShare: number | null;
    totalLifetimeValue: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalSpend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async (searchValue: string) => {
    setLoading(true);
    try {
      const res = await listCustomers({
        search: searchValue.trim() || undefined,
      });
      setRows(res.customers.rows);
      setSummary(res.customers.summary);
    } catch {
      toast.push("Could not load customers.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const handle = setTimeout(() => void load(search), 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = (a.name ?? "").localeCompare(b.name ?? "");
      else if (sortKey === "lastOrderAt")
        cmp = a.lastOrderAt.localeCompare(b.lastOrderAt);
      else if (sortKey === "deliveredRate")
        cmp = (a.deliveredRate ?? -1) - (b.deliveredRate ?? -1);
      else cmp = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  const SortHeader = ({
    label,
    sortKeyName,
  }: {
    label: string;
    sortKeyName: SortKey;
  }) => (
    // inline-flex (not flex) so this stays an inline-level box the <th>'s text-left/text-right
    // actually positions — a block-level `flex` button ignores the parent's text-align, which left
    // every right-aligned sort header sitting flush left instead of over its column's data.
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
      <div className="zs-page-header flex items-center justify-between">
        <div>
          <PageTitle>Customers</PageTitle>
          <p className="zs-page-description">
            Every customer who's ever placed an order, ranked by lifetime value.
          </p>
        </div>
        <button
          onClick={() => void load(search)}
          disabled={loading}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            className={loading ? "animate-spin" : undefined}
          />{" "}
          Refresh
        </button>
      </div>

      <div className="zs-toolbox">
        <div className="zs-toolbox-row">
          <div className="zs-toolbox-left">
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600">
              Customers{" "}
              {(summary?.totalCustomers ?? rows.length).toLocaleString()}
            </span>
            <span className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500">
              Repeat {(summary?.repeatCount ?? 0).toLocaleString()}
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
                placeholder="Search name or phone"
                className="zs-search-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="zs-page-body overflow-y-auto">
        {loading && rows.length === 0 ? (
          <div className="zs-loading-state">Loading customers...</div>
        ) : (
          <div className="space-y-5">
            <div className="zs-summary-strip">
              <MetricCard
                icon={Users}
                label="Customers"
                value={String(summary?.totalCustomers ?? 0)}
                tone="slate"
              />
              <MetricCard
                icon={Repeat}
                label="Repeat customers"
                value={String(summary?.repeatCount ?? 0)}
                tone="indigo"
              />
              <MetricCard
                icon={Wallet}
                label="Repeat revenue share"
                value={
                  summary?.repeatRevenueShare != null
                    ? `${summary.repeatRevenueShare}%`
                    : "—"
                }
                tone="emerald"
              />
              <MetricCard
                icon={Wallet}
                label="Total lifetime value"
                value={money(summary?.totalLifetimeValue ?? 0)}
                tone="slate"
              />
            </div>

            <div className="zs-table-wrap">
              {rows.length === 0 ? (
                <div className="zs-empty-state">
                  <Users size={28} className="text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    No customers yet
                  </p>
                  <p className="max-w-sm text-xs text-slate-400">
                    Anyone who places an order with a phone number shows up here
                    automatically.
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
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader label="Orders" sortKeyName="orderCount" />
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader
                            label="Lifetime spend"
                            sortKeyName="totalSpend"
                          />
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader
                            label="Delivered rate"
                            sortKeyName="deliveredRate"
                          />
                        </th>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Segment
                        </th>
                        <th className="px-4 py-2.5 text-left font-semibold">
                          Risk
                        </th>
                        <th className="px-4 py-2.5 text-right font-semibold">
                          <SortHeader
                            label="Last order"
                            sortKeyName="lastOrderAt"
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody className="zs-table-body">
                      {sortedRows.map((c) => (
                        <tr
                          key={c.phone}
                          onClick={() =>
                            navigate(
                              `/customers/${encodeURIComponent(c.phone)}`,
                            )
                          }
                          className="zs-data-row cursor-pointer"
                        >
                          <td className="px-4 py-3">
                            <p className="flex items-center gap-1.5 font-medium text-slate-800">
                              {c.name ?? "No name"}
                              {c.isBlocked && (
                                <Ban size={12} className="text-rose-500" />
                              )}
                            </p>
                            <p className="text-xs text-slate-400">{c.phone}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {c.orderCount}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                            {money(c.totalSpend)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {c.deliveredRate != null
                              ? `${c.deliveredRate}%`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {c.segment}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5">
                              <span
                                className={clsx(
                                  "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                                  RISK_TONE[c.riskLabel],
                                )}
                              >
                                {c.riskLabel}
                              </span>
                              <AppBlock
                                target="admin.customers.index.row-badge"
                                context={{ phone: c.phone }}
                              />
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-500">
                            {new Date(c.lastOrderAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile card list — same data/handlers as the table above. */}
                <div className="space-y-2.5 p-3 lg:hidden">
                  {sortedRows.map((c) => (
                    <div
                      key={c.phone}
                      onClick={() =>
                        navigate(`/customers/${encodeURIComponent(c.phone)}`)
                      }
                      className="zs-surface cursor-pointer p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-semibold text-slate-800">
                            {c.name ?? "No name"}
                            {c.isBlocked && (
                              <Ban size={12} className="shrink-0 text-rose-500" />
                            )}
                          </p>
                          <p className="text-xs text-slate-400">{c.phone}</p>
                        </div>
                        <span
                          className={clsx(
                            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                            RISK_TONE[c.riskLabel],
                          )}
                        >
                          {c.riskLabel}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-sm">
                        <div className="text-xs text-slate-500">
                          {c.orderCount} order{c.orderCount === 1 ? "" : "s"}
                          {" · "}
                          {c.segment}
                        </div>
                        <p className="shrink-0 font-semibold tabular-nums text-slate-800">
                          {money(c.totalSpend)}
                        </p>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-400">
                        <span>
                          Delivered rate{" "}
                          {c.deliveredRate != null ? `${c.deliveredRate}%` : "—"}
                        </span>
                        <span>
                          {new Date(c.lastOrderAt).toLocaleDateString()}
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
    </div>
  );
}
