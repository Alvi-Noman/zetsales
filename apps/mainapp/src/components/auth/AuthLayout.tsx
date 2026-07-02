import type { ReactNode } from 'react';
import { ShieldCheck, Truck, BarChart3 } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: Truck, text: 'Built for Bangladesh\'s Cash-on-Delivery e-commerce' },
  { icon: ShieldCheck, text: 'Delivery risk scoring keeps failed COD orders down' },
  { icon: BarChart3, text: 'One dashboard for orders, couriers, and every sales channel' },
];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-white">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-slate-950 px-12 py-12 text-white lg:flex">
        <div className="absolute top-[-15%] left-[-10%] h-[420px] w-[420px] rounded-full bg-indigo-600/30 blur-[110px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[420px] w-[420px] rounded-full bg-violet-600/30 blur-[110px]" />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 font-bold text-white text-sm shadow-lg shadow-indigo-500/30">
            Z
          </div>
          <span className="text-lg font-bold tracking-tight">ZetSales</span>
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="font-outfit text-4xl font-extrabold leading-tight tracking-tight">
            Run your entire business from one screen.
          </h1>
          <p className="mt-4 text-slate-400 leading-relaxed">
            Orders, couriers, accounting, and customer service — the unified suite built for Bangladeshi COD commerce.
          </p>

          <div className="mt-10 space-y-4">
            {HIGHLIGHTS.map((h) => (
              <div key={h.text} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <h.icon size={15} className="text-indigo-300" />
                </div>
                <p className="text-sm text-slate-300 leading-snug">{h.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-slate-500">&copy; {new Date().getFullYear()} ZetSales Inc.</p>
      </div>

      <div className="flex w-full flex-1 items-center justify-center px-6 py-12 lg:w-[54%]">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
