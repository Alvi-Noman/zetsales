import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { ShieldCheck, LogOut } from 'lucide-react';
import { NAV_ITEMS, NAV_FOOTER_ITEMS } from '../../nav/navigation';
import { useAdminAuth } from '../../context/AuthContext';

export function Sidebar() {
  const { logout } = useAdminAuth();

  return (
    <aside className="flex h-screen w-[248px] shrink-0 flex-col border-r border-slate-800 bg-slate-950">
      <div className="flex h-16 items-center gap-2.5 border-b border-slate-800 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/30">
          <ShieldCheck size={16} />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-tight text-white">ZetSales</span>
          <span className="text-[11px] text-slate-500">Control Center</span>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/10 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={17} className={clsx('shrink-0', isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300')} />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="space-y-0.5 border-t border-slate-800 px-3 py-3">
        {NAV_FOOTER_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-500/10 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-100'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={17} className={clsx('shrink-0', isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300')} />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={logout}
          className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-red-300"
        >
          <LogOut size={17} className="shrink-0 text-slate-500 group-hover:text-red-400" />
          <span className="truncate">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
