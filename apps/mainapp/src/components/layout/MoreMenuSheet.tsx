import { NavLink } from "react-router-dom";
import { X } from "lucide-react";
import clsx from "clsx";
import { useVisibleNavItems } from "../../nav/useVisibleNavItems";

const BOTTOM_NAV_PATHS = ["/home", "/orders", "/products", "/analytics"];

interface MoreMenuSheetProps {
  open: boolean;
  onClose: () => void;
}

// Mobile-only "everything else" menu — the sections that don't fit in the bottom nav's 4 tabs.
// Reuses the exact same slide-in drawer pattern as OrderDetailDrawer (fade-in backdrop +
// animate-slide-in-right panel, both already-defined Tailwind animations) and the same
// role/plugin-filtered nav data Sidebar uses, via the shared useVisibleNavItems hook, so a section
// hidden from a given role on desktop is hidden here too rather than drifting out of sync.
export function MoreMenuSheet({ open, onClose }: MoreMenuSheetProps) {
  const { visibleNavItems, visibleFooterItems } = useVisibleNavItems();
  if (!open) return null;

  const mainItems = visibleNavItems.filter((item) => !BOTTOM_NAV_PATHS.includes(item.path));

  return (
    <div className="fixed inset-0 z-50 flex justify-end lg:hidden">
      <div className="absolute inset-0 animate-fade-in bg-slate-900/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xs animate-slide-in-right flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-900">More</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {mainItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )
              }
            >
              <item.icon size={18} className="shrink-0 text-slate-400" />
              {item.label}
              {item.badge && <span className="ml-auto text-[11px] text-slate-400">{item.badge}</span>}
            </NavLink>
          ))}
          {visibleFooterItems.length > 0 && (
            <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2">
              {visibleFooterItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    clsx(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                    )
                  }
                >
                  <item.icon size={18} className="shrink-0 text-slate-400" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
