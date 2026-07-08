import { useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_DEFINITIONS, type ModuleKey } from '@zetsales/shared';
import { NAV_ITEMS, NAV_FOOTER_ITEMS, type NavItem } from '../../nav/navigation';
import { useAuth } from '../../context/AuthContext';

// Settings/Home are account-level, not business-data modules, so every team member sees them
// regardless of role — everything else follows the signed-in member's role permissions.
const ALWAYS_VISIBLE_MODULES: ModuleKey[] = ['home', 'settings'];

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const location = useLocation();
  const isParentActive = item.children
    ? item.children.some((c) => location.pathname === c.path)
    : location.pathname === item.path;
  const [open, setOpen] = useState(isParentActive);
  const Icon = item.icon;
  const badge = item.badge;

  if (item.children && !collapsed) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={clsx(
            'group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
            isParentActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          )}
        >
          <Icon size={17} className={clsx('shrink-0', isParentActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600')} />
          <span className="flex-1 text-left truncate">{item.label}</span>
          {badge && <span className="text-[11px] text-slate-400 tabular-nums">{badge}</span>}
          <ChevronDown size={14} className={clsx('shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="mt-0.5 ml-[1.6rem] space-y-0.5 border-l border-slate-200 pl-3">
            {item.children.map((child) => (
              <NavLink
                key={child.path}
                to={child.path}
                end
                className={({ isActive }) =>
                  clsx(
                    'block rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                    isActive ? 'text-indigo-600 bg-indigo-50/70' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  )
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center',
          isActive || isParentActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        )
      }
    >
      <Icon size={17} className={clsx('shrink-0', isParentActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600')} />
      {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
      {!collapsed && badge && <span className="text-[11px] text-slate-400 tabular-nums">{badge}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user } = useAuth();

  // A missing role only happens for accounts created before team roles existed — fail open as
  // owner rather than locking a pre-existing user out of their own workspace.
  const allowedModules = useMemo(() => (user?.role ? ROLE_DEFINITIONS[user.role].modules : ROLE_DEFINITIONS.owner.modules), [user?.role]);
  const isVisible = (item: NavItem) => ALWAYS_VISIBLE_MODULES.includes(item.module) || allowedModules.includes(item.module);
  const visibleNavItems = NAV_ITEMS.filter(isVisible);
  const visibleFooterItems = NAV_FOOTER_ITEMS.filter(isVisible);

  return (
    <aside
      className={clsx(
        'flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      <div className={clsx('flex items-center gap-2.5 px-4 h-16 border-b border-slate-200', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 font-bold text-white text-sm shadow-sm shadow-indigo-500/30">
          Z
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-bold text-slate-900 tracking-tight">ZetSales</span>
            <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{user?.businessName ?? 'Workspace'}</span>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {visibleNavItems.map((item) => (
          <NavRow key={item.path} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3 space-y-0.5">
        {visibleFooterItems.map((item) => (
          <NavRow key={item.path} item={item} collapsed={collapsed} />
        ))}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={clsx(
            'mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors',
            collapsed && 'justify-center'
          )}
        >
          {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
