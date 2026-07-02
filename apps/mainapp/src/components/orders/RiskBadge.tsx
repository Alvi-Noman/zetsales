import { ShieldAlert, ShieldCheck, ShieldQuestion, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import type { OrderRiskDTO } from '@zetsales/shared';

const RISK_STYLE = {
  Trusted: { tone: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', icon: ShieldCheck },
  Normal: { tone: 'bg-sky-50 text-sky-700 ring-sky-600/20', icon: ShieldQuestion },
  Risky: { tone: 'bg-rose-50 text-rose-700 ring-rose-600/20', icon: ShieldAlert },
  'New Customer': { tone: 'bg-slate-100 text-slate-600 ring-slate-500/20', icon: UserPlus },
} as const;

export function RiskBadge({ risk }: { risk: OrderRiskDTO }) {
  const { tone, icon: Icon } = RISK_STYLE[risk.label];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset whitespace-nowrap', tone)}>
      <Icon size={11} />
      {risk.successRate !== null ? `${risk.successRate}% · ${risk.label}` : risk.label}
    </span>
  );
}
