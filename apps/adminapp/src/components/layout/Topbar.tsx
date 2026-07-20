import { useLocation } from 'react-router-dom';
import { Bell, Search } from 'lucide-react';
import { NAV_ITEMS, NAV_FOOTER_ITEMS } from '../../nav/navigation';

export function Topbar() {
  const location = useLocation();
  const current = [...NAV_ITEMS, ...NAV_FOOTER_ITEMS].find((item) => location.pathname.startsWith(item.path));

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950 px-6">
      <div>
        <h1 className="text-[15px] font-semibold text-white">{current?.label ?? 'Control Center'}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            placeholder="Search tenants, tickets…"
            className="h-8 w-64 rounded-lg border border-slate-800 bg-slate-900 pl-8 pr-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/15"
          />
        </div>
        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-900 hover:text-slate-200">
          <Bell size={16} />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-xs font-bold text-white">
          A
        </div>
      </div>
    </header>
  );
}
