import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Clock,
  Gift,
  Info,
  Landmark,
  Megaphone,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import {
  createExpense,
  deleteExpense,
  getCommittedToSuppliers,
  getProfitAndLoss,
  listExpenses,
  type CommittedToSuppliersDTO,
  type ExpenseDTO,
  type ExpensePayload,
  type ProfitAndLossDTO,
} from "../../lib/commerceApi";
import { Modal } from "../../components/ui/Modal";
import { Popover } from "../../components/ui/Popover";
import { useToast } from "../../components/ui/ToastProvider";

function money(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}৳${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(value: number | null) {
  return value == null
    ? "—"
    : `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(1)}%`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
  });
}

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
  tone?: "slate" | "emerald" | "amber" | "indigo" | "rose";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-500",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
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
  | "custom";

const RANGE_LABELS: Record<RangePreset, string> = {
  thisMonth: "This month",
  lastMonth: "Last month",
  thisQuarter: "This quarter",
  thisYear: "This year",
  custom: "Custom range",
};

function computePresetRange(preset: RangePreset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "lastMonth") {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    return { from, to };
  }
  if (preset === "thisQuarter") {
    const q = Math.floor(now.getMonth() / 3);
    return { from: new Date(now.getFullYear(), q * 3, 1), to: now };
  }
  if (preset === "thisYear") {
    return { from: new Date(now.getFullYear(), 0, 1), to: now };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

// A plain Popover with preset buttons, plus two date inputs that only appear once "Custom range"
// is picked — matches the card-popover language used throughout Inventory rather than a native
// <select>, but stays a simple list since there's no icon/description worth attaching per option.
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

// Presets chosen so advertising/payroll/office costs (not tracked yet) drop straight into this
// list the day someone starts logging them — no schema change, just a new category string typed
// into the same picker. "Other" is the deliberate escape hatch for anything that doesn't fit yet.
const EXPENSE_CATEGORY_META: {
  category: string;
  description: string;
  icon: typeof Megaphone;
}[] = [
  {
    category: "Advertising",
    description: "Facebook/Google ads, boosted posts, promotions",
    icon: Megaphone,
  },
  { category: "Payroll", description: "Staff salaries and wages", icon: Users },
  {
    category: "Rent & Utilities",
    description: "Warehouse or office rent, electricity, internet",
    icon: Landmark,
  },
  {
    category: "Software & Tools",
    description: "Subscriptions, courier/API fees, apps",
    icon: Wrench,
  },
  {
    category: "Other",
    description: "Anything that doesn't fit the above",
    icon: Wallet,
  },
];

function ExpenseCategoryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (category: string) => void;
}) {
  const [customText, setCustomText] = useState("");
  const preset = EXPENSE_CATEGORY_META.find((c) => c.category === value);

  return (
    <Popover
      align="left"
      widthClass="w-72"
      trigger={() => (
        <div className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 hover:bg-slate-50">
          {preset ? (
            <preset.icon size={14} className="shrink-0 text-slate-400" />
          ) : (
            <Wallet size={14} className="shrink-0 text-slate-400" />
          )}
          <span className="flex-1 truncate">
            {value || "Select a category"}
          </span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </div>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          {EXPENSE_CATEGORY_META.map((option) => {
            const selected = option.category === value;
            return (
              <button
                key={option.category}
                onClick={() => {
                  onChange(option.category);
                  close();
                }}
                className={clsx(
                  "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                  selected ? "bg-indigo-50" : "hover:bg-slate-50",
                )}
              >
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                    selected
                      ? "bg-indigo-100 text-indigo-600"
                      : "bg-slate-100 text-slate-400",
                  )}
                >
                  <option.icon size={14} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={clsx(
                      "block text-xs font-semibold",
                      selected ? "text-indigo-700" : "text-slate-700",
                    )}
                  >
                    {option.category}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {option.description}
                  </span>
                </span>
                {selected && (
                  <Check
                    size={13}
                    className="mt-0.5 shrink-0 text-indigo-600"
                  />
                )}
              </button>
            );
          })}
          <div className="mt-1 flex items-center gap-1.5 border-t border-slate-100 p-1.5 pt-2">
            <input
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="Or type a new category..."
              className="h-8 flex-1 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => {
                if (!customText.trim()) return;
                onChange(customText.trim());
                setCustomText("");
                close();
              }}
              className="h-8 shrink-0 rounded-md bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              Use
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function AddExpenseModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setCategory("");
      setAmount("");
      setDate(new Date().toISOString().slice(0, 10));
      setNote("");
    }
  }, [open]);

  const canSave =
    category.trim().length > 0 &&
    amount.trim() !== "" &&
    Number(amount) > 0 &&
    date.trim().length > 0 &&
    !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: ExpensePayload = {
        category: category.trim(),
        amount: Number(amount),
        date,
        note: note.trim() || undefined,
      };
      await createExpense(payload);
      toast.push("Expense logged.", "success");
      onSaved();
      onClose();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not save this expense.",
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
      title="Add expense"
      subtitle="Advertising, payroll, office costs — anything outside inventory."
      widthClass="max-w-md"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            Category
          </label>
          <ExpenseCategoryPicker value={category} onChange={setCategory} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Amount (৳)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-slate-600">
            Note (optional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. July Facebook ad campaign"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <button
          onClick={() => void save()}
          disabled={!canSave}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Log expense"}
        </button>
      </div>
    </Modal>
  );
}

// No charting library in this project — a deliberately simple grouped-bar trend, height-scaled by
// percentage of the largest value in the whole series so every month is visually comparable.
function TrendChart({ trend }: { trend: ProfitAndLossDTO["trend"] }) {
  const max = Math.max(1, ...trend.map((t) => Math.max(t.revenue, t.cogs)));
  return (
    <div>
      <div
        className="flex items-end gap-3 border-b border-slate-100 pb-2"
        style={{ height: 180 }}
      >
        {trend.map((t) => (
          <div
            key={t.month}
            className="flex flex-1 items-end justify-center gap-0.5"
            title={`${monthLabel(t.month)}: revenue ${money(t.revenue)}, cost ${money(t.cogs)}, profit ${money(t.profit)}`}
          >
            <div
              className="w-2.5 rounded-t bg-emerald-400"
              style={{ height: `${(t.revenue / max) * 100}%` }}
            />
            <div
              className="w-2.5 rounded-t bg-rose-300"
              style={{ height: `${(t.cogs / max) * 100}%` }}
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
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-400" /> Revenue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-rose-300" /> Cost of goods sold
        </span>
      </div>
    </div>
  );
}

export function AccountingPage() {
  const toast = useToast();
  const [preset, setPreset] = useState<RangePreset>("thisMonth");
  const [customFrom, setCustomFrom] = useState(() =>
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10),
  );
  const [customTo, setCustomTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [pnl, setPnl] = useState<ProfitAndLossDTO | null>(null);
  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [committed, setCommitted] = useState<CommittedToSuppliersDTO | null>(
    null,
  );
  const [committedLoading, setCommittedLoading] = useState(true);

  const range = useMemo(() => {
    if (preset === "custom")
      return {
        from: new Date(customFrom),
        to: new Date(customTo + "T23:59:59"),
      };
    return computePresetRange(preset);
  }, [preset, customFrom, customTo]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
      };
      const [pnlRes, expensesRes] = await Promise.all([
        getProfitAndLoss(params),
        listExpenses(params),
      ]);
      setPnl(pnlRes);
      setExpenses(expensesRes.expenses);
    } catch {
      toast.push("Could not load the Profit & Loss report.", "info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from.getTime(), range.to.getTime()]);

  // A point-in-time snapshot of open shipments, not a date-ranged flow figure like the P&L above —
  // loaded once on its own, independent of the date range picker, since "how much is committed to
  // suppliers right now" doesn't mean anything scoped to "this month."
  const loadCommitted = async () => {
    setCommittedLoading(true);
    try {
      setCommitted(await getCommittedToSuppliers());
    } catch {
      toast.push("Could not load committed-to-suppliers.", "info");
    } finally {
      setCommittedLoading(false);
    }
  };

  useEffect(() => {
    void loadCommitted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeExpense = async (id: string) => {
    try {
      const res = await deleteExpense(id);
      if (!res.success) {
        toast.push(res.message || "Could not remove this expense.", "info");
        return;
      }
      toast.push("Expense removed.", "success");
      void load();
    } catch (err) {
      toast.push(
        (err as Error).message || "Could not remove this expense.",
        "info",
      );
    }
  };

  return (
    <div className="zs-page">
      <div className="zs-page-header flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="zs-page-title">Accounting &amp; Finance</h1>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">
              Profit &amp; Loss
            </span>
          </div>
          <p className="zs-page-description">
            Revenue, cost of goods sold, inventory loss, and operating expenses.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={() => setAddExpenseOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={14} /> Add expense
          </button>
        </div>
      </div>

      <div className="zs-page-body overflow-y-auto">
        {loading && !pnl ? (
          <div className="zs-loading-state">Loading Profit &amp; Loss...</div>
        ) : pnl ? (
          <div className="space-y-6">
            <div className="zs-summary-strip">
              <MetricCard
                icon={TrendingUp}
                label="Revenue"
                value={money(pnl.revenue)}
                tone="emerald"
              />
              <MetricCard
                icon={Package}
                label="Cost of goods"
                value={money(pnl.cogs)}
                tone="rose"
              />
              <MetricCard
                icon={ShieldCheck}
                label="Gross profit"
                value={money(pnl.grossProfit)}
                detail={pct(pnl.grossMarginPct)}
                tone="indigo"
              />
              <MetricCard
                icon={TrendingDown}
                label="Loss"
                value={money(pnl.shrinkage)}
                tone="amber"
              />
              <MetricCard
                icon={Gift}
                label="Gifts & giveaways"
                value={money(pnl.giftsAndGiveaways)}
                tone="amber"
              />
              <MetricCard
                icon={Wallet}
                label="Expenses"
                value={money(pnl.totalExpenses)}
                tone="amber"
              />
              <MetricCard
                icon={BarChart3}
                label="Net profit"
                value={money(pnl.netProfit)}
                detail={pct(pnl.netMarginPct)}
                tone={pnl.netProfit >= 0 ? "emerald" : "rose"}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <section className="zs-surface p-5">
                <h2 className="mb-4 text-sm font-bold text-slate-900">
                  Income statement
                </h2>
                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Revenue</span>
                    <span className="font-semibold tabular-nums text-slate-800">
                      {money(pnl.revenue)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Reflects delivered order value; does not yet net out refunds
                    from later returns.
                  </p>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className="text-slate-600">Cost of goods sold</span>
                    <span className="font-semibold tabular-nums text-rose-600">
                      -{money(pnl.cogs)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2.5">
                    <span className="font-bold text-slate-900">
                      Gross profit
                    </span>
                    <span className="font-bold tabular-nums text-slate-900">
                      {money(pnl.grossProfit)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className="text-slate-600">Inventory loss</span>
                    <span className="font-semibold tabular-nums text-rose-600">
                      -{money(pnl.shrinkage)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                    <span className="text-slate-600">
                      Gifts &amp; giveaways
                    </span>
                    <span className="font-semibold tabular-nums text-rose-600">
                      -{money(pnl.giftsAndGiveaways)}
                    </span>
                  </div>
                  {pnl.expensesByCategory.length === 0 ? (
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-slate-400">Operating expenses</span>
                      <span className="text-slate-400">৳0</span>
                    </div>
                  ) : (
                    pnl.expensesByCategory.map((e) => (
                      <div
                        key={e.category}
                        className="flex items-center justify-between border-t border-slate-100 pt-2.5 pl-3"
                      >
                        <span className="text-slate-500">{e.category}</span>
                        <span className="font-medium tabular-nums text-rose-500">
                          -{money(e.amount)}
                        </span>
                      </div>
                    ))
                  )}
                  <div className="flex items-center justify-between border-t-2 border-slate-800 pt-2.5">
                    <span className="font-bold text-slate-900">Net profit</span>
                    <span
                      className={clsx(
                        "font-bold tabular-nums",
                        pnl.netProfit >= 0
                          ? "text-emerald-600"
                          : "text-rose-600",
                      )}
                    >
                      {money(pnl.netProfit)}
                    </span>
                  </div>
                </div>
              </section>

              <section className="zs-surface p-5">
                <h2 className="mb-4 text-sm font-bold text-slate-900">
                  Revenue vs. cost — trailing 12 months
                </h2>
                <TrendChart trend={pnl.trend} />
              </section>
            </div>

            <section className="zs-dashed-surface p-5">
              <div className="mb-1 flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Committed to suppliers
                </h2>
                <span className="flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  <Info size={10} /> Not included in Net Profit
                </span>
              </div>
              <p className="mb-4 text-xs text-slate-500">
                A live snapshot of open shipments right now — not a range like
                the numbers above. Split by how you pay each supplier: cash
                already spent and sitting in transit, versus money you genuinely
                still owe.
              </p>
              {committedLoading || !committed ? (
                <div className="flex h-24 items-center justify-center text-sm text-slate-400">
                  Loading...
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="zs-surface p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <Truck size={13} /> Prepaid, in transit
                    </div>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">
                      {money(committed.prepaidInTransit.total)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {committed.prepaidInTransit.shipmentCount} open shipment
                      {committed.prepaidInTransit.shipmentCount === 1
                        ? ""
                        : "s"}
                      {committed.prepaidInTransit.overdueShipmentCount > 0 && (
                        <span className="text-rose-600">
                          {" "}
                          · {money(
                            committed.prepaidInTransit.overdueTotal,
                          )}{" "}
                          overdue (
                          {committed.prepaidInTransit.overdueShipmentCount})
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="zs-surface p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      <Landmark size={13} /> Owed to suppliers
                    </div>
                    <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">
                      {money(committed.owedToSuppliers.total)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {committed.owedToSuppliers.shipmentCount} open shipment
                      {committed.owedToSuppliers.shipmentCount === 1 ? "" : "s"}
                      {committed.owedToSuppliers.overdueShipmentCount > 0 && (
                        <span className="text-rose-600">
                          {" "}
                          · {money(committed.owedToSuppliers.overdueTotal)}{" "}
                          overdue (
                          {committed.owedToSuppliers.overdueShipmentCount})
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
              {committed && committed.bySupplier.length > 0 && (
                <div className="mt-4 zs-table-body border-t border-slate-100 pt-1">
                  {committed.bySupplier.map((s) => (
                    <div
                      key={s.supplierId ?? s.supplierName}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-slate-700">
                          {s.supplierName}
                        </span>
                        <span
                          className={clsx(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                            s.paymentType === "credit"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {s.paymentType === "credit" ? "Credit" : "Prepaid"}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                        <span>
                          {s.shipmentCount} shipment
                          {s.shipmentCount === 1 ? "" : "s"}
                        </span>
                        <span className="font-bold tabular-nums text-slate-800">
                          {money(s.total)}
                        </span>
                        {s.overdueTotal > 0 && (
                          <Clock size={12} className="text-rose-500" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {committed &&
                committed.bySupplier.length === 0 &&
                !committedLoading && (
                  <p className="py-4 text-center text-xs text-slate-400">
                    No open shipments right now.
                  </p>
                )}
            </section>

            <section className="zs-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Expenses in this range
                </h2>
                <span className="text-xs text-slate-400">
                  {expenses.length} entr{expenses.length === 1 ? "y" : "ies"}
                </span>
              </div>
              {expenses.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">
                  No expenses logged for this range yet — advertising, payroll,
                  and office costs will show up here once added.
                </p>
              ) : (
                <div className="zs-table-body">
                  {expenses.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-700">
                          {e.category}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {new Date(e.date).toLocaleDateString()}
                          {e.note ? ` · ${e.note}` : ""}
                          {e.createdBy ? ` · by ${e.createdBy}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="font-bold tabular-nums text-slate-800">
                          {money(e.amount)}
                        </span>
                        <button
                          onClick={() => void removeExpense(e.id)}
                          className="rounded-md p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </div>

      <AddExpenseModal
        open={addExpenseOpen}
        onClose={() => setAddExpenseOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
