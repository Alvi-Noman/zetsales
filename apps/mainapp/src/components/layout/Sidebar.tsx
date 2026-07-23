import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';
import clsx from 'clsx';
import type { NavItem } from '../../nav/navigation';
import { useAuth } from '../../context/AuthContext';
import { useVisibleNavItems } from '../../nav/useVisibleNavItems';

function NavRow({
  item,
  collapsed,
  openPath,
  onToggle,
}: {
  item: NavItem;
  collapsed: boolean;
  openPath: string | null;
  onToggle: (path: string | null) => void;
}) {
  const location = useLocation();
  const isParentActive = item.children
    ? location.pathname === item.path || item.children.some((c) => location.pathname === c.path)
    : location.pathname === item.path;
  const open = openPath === item.path;
  // Clicking the label now navigates via client-side routing rather than a full page load, so this
  // component never remounts to re-derive its initial expanded state — without this, arriving at a
  // section by clicking its own label (not a child link) would navigate there but leave it
  // collapsed. Only one section is ever open at a time (accordion), so this also closes whichever
  // other section was previously expanded.
  useEffect(() => {
    if (isParentActive) onToggle(item.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isParentActive]);
  const Icon = item.icon;
  const badge = item.badge;

  if (item.children && !collapsed) {
    return (
      <div>
        <div
          className={clsx(
            'group flex w-full items-center gap-1 rounded-lg pr-1.5 text-sm font-medium transition-colors',
            isParentActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          )}
        >
          <NavLink to={item.path} end className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2">
            <Icon size={17} className={clsx('shrink-0', isParentActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600')} />
            <span className="flex-1 truncate text-left">{item.label}</span>
            {badge && <span className="text-[11px] text-slate-400 tabular-nums">{badge}</span>}
          </NavLink>
          <button
            onClick={() => onToggle(open ? null : item.path)}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600"
          >
            <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
          </button>
        </div>
        {open && (
          <div className="mt-0.5 space-y-0.5">
            {item.children.map((child) => (
              <NavLink
                key={child.path}
                to={child.path}
                end
                className={({ isActive }) =>
                  clsx(
                    'block rounded-md py-1.5 pl-9 pr-2.5 text-[13px] font-medium transition-colors',
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
  // Shared across both the main nav and footer rows so only one expandable section is ever open at
  // once, sidebar-wide — not one independently-tracked "open" per row.
  const [openPath, setOpenPath] = useState<string | null>(null);
  const { user } = useAuth();
  const { visibleNavItems, visibleFooterItems } = useVisibleNavItems();

  return (
    <aside
      className={clsx(
        'hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex',
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
          <NavRow key={item.path} item={item} collapsed={collapsed} openPath={openPath} onToggle={setOpenPath} />
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3 space-y-0.5">
        {visibleFooterItems.map((item) => (
          <NavRow key={item.path} item={item} collapsed={collapsed} openPath={openPath} onToggle={setOpenPath} />
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
