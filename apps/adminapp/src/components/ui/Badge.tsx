import clsx from 'clsx';
import type { ReactNode } from 'react';

const TONES = {
  slate: 'bg-slate-800 text-slate-300',
  emerald: 'bg-emerald-500/10 text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-400',
  red: 'bg-red-500/10 text-red-400',
  indigo: 'bg-indigo-500/10 text-indigo-300',
  sky: 'bg-sky-500/10 text-sky-300',
};

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize', TONES[tone])}>
      {children}
    </span>
  );
}
