import { useEffect, useState } from "react";
import { CheckCircle2, Clock, Coffee, LogIn, LogOut, RotateCcw } from "lucide-react";
import clsx from "clsx";
import type { HrmPublicEmployeeDTO, HrmPunchAction, HrmPunchStatusDTO } from "@zetsales/shared";
import { getPunchStatus, listPunchEmployees, submitPunchAction } from "../../lib/hrmPunchApi";

type Step = "select" | "pin" | "status" | "error";

const STATE_LABEL: Record<HrmPunchStatusDTO["state"], string> = {
  notCheckedIn: "Not checked in yet",
  checkedIn: "Checked in",
  onBreak: "On break",
  checkedOut: "Checked out for today",
};

function timeStr(iso: string | null) {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

function ActionButton({
  icon: Icon,
  label,
  tone,
  onClick,
  disabled,
}: {
  icon: typeof LogIn;
  label: string;
  tone: "emerald" | "amber" | "indigo" | "slate";
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneClass = {
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    amber: "bg-amber-500 hover:bg-amber-600",
    indigo: "bg-indigo-600 hover:bg-indigo-700",
    slate: "bg-slate-700 hover:bg-slate-800",
  }[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        "flex h-16 w-full items-center justify-center gap-2 rounded-xl text-base font-bold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        toneClass
      )}
    >
      <Icon size={20} /> {label}
    </button>
  );
}

export function PunchPage() {
  const [step, setStep] = useState<Step>("select");
  const [employees, setEmployees] = useState<HrmPublicEmployeeDTO[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [employeeId, setEmployeeId] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<HrmPunchStatusDTO | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    listPunchEmployees()
      .then(setEmployees)
      .catch(() => setLoadError(true));
  }, []);

  const reset = () => {
    setStep("select");
    setEmployeeId("");
    setPin("");
    setStatus(null);
    setError(null);
    setLastAction(null);
  };

  const submitPin = async () => {
    if (!employeeId || pin.length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const s = await getPunchStatus(employeeId, pin);
      setStatus(s);
      setStep("status");
    } catch (err) {
      setError((err as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const doAction = async (action: HrmPunchAction, label: string) => {
    setBusy(true);
    setError(null);
    try {
      const s = await submitPunchAction(employeeId, pin, action);
      setStatus(s);
      setLastAction(label);
    } catch (err) {
      setError((err as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 font-bold text-white shadow-sm shadow-indigo-500/30">
            Z
          </div>
          <h1 className="text-lg font-bold text-slate-900">Attendance</h1>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-sm text-slate-400">
            <Clock size={14} /> {now.toLocaleTimeString()} · {now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loadError ? (
            <p className="text-center text-sm text-slate-500">Couldn't load employee list. Refresh to try again.</p>
          ) : step === "select" ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600">Who are you?</label>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                >
                  <option value="">Select your name</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => employeeId && setStep("pin")}
                disabled={!employeeId}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          ) : step === "pin" ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{selectedEmployee?.name}</p>
                <label className="mb-1.5 mt-3 block text-xs font-semibold text-slate-600">Enter your PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && void submitPin()}
                  placeholder="••••"
                  className="h-14 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-center text-2xl tracking-[0.5em] text-slate-900 outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
                />
              </div>
              {error && <p className="text-center text-sm text-rose-600">{error}</p>}
              <button
                onClick={() => void submitPin()}
                disabled={busy || pin.length < 4}
                className="flex h-11 w-full items-center justify-center rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Checking..." : "Continue"}
              </button>
              <button onClick={reset} className="flex h-9 w-full items-center justify-center text-xs font-semibold text-slate-400 hover:text-slate-600">
                Not you? Go back
              </button>
            </div>
          ) : (
            status && (
              <div className="space-y-4">
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-800">{status.employeeName}</p>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">{STATE_LABEL[status.state]}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-center text-xs">
                  <div>
                    <p className="text-slate-400">Checked in</p>
                    <p className="font-semibold text-slate-800">{timeStr(status.checkIn)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Checked out</p>
                    <p className="font-semibold text-slate-800">{timeStr(status.checkOut)}</p>
                  </div>
                </div>

                {lastAction && (
                  <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-600">
                    <CheckCircle2 size={16} /> {lastAction}
                  </p>
                )}
                {error && <p className="text-center text-sm text-rose-600">{error}</p>}

                <div className="space-y-2">
                  {status.state === "notCheckedIn" && (
                    <ActionButton icon={LogIn} label="I'm In" tone="emerald" onClick={() => void doAction("checkIn", "Checked in.")} disabled={busy} />
                  )}
                  {status.state === "checkedIn" && (
                    <>
                      <ActionButton icon={Coffee} label="Taking a break" tone="amber" onClick={() => void doAction("breakStart", "Break started.")} disabled={busy} />
                      <ActionButton icon={LogOut} label="I'm Out" tone="slate" onClick={() => void doAction("checkOut", "Checked out. See you tomorrow!")} disabled={busy} />
                    </>
                  )}
                  {status.state === "onBreak" && (
                    <ActionButton icon={RotateCcw} label="I'm Back" tone="indigo" onClick={() => void doAction("breakEnd", "Break ended.")} disabled={busy} />
                  )}
                  {status.state === "checkedOut" && <p className="text-center text-sm text-slate-400">All done for today.</p>}
                </div>

                <button onClick={reset} className="flex h-9 w-full items-center justify-center text-xs font-semibold text-slate-400 hover:text-slate-600">
                  Switch employee
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
