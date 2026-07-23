import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, ShoppingCart, Package, BarChart3, Menu } from "lucide-react";
import clsx from "clsx";
import { MoreMenuSheet } from "./MoreMenuSheet";

const TABS = [
  { label: "Home", path: "/home", icon: LayoutDashboard },
  { label: "Orders", path: "/orders", icon: ShoppingCart },
  { label: "Products", path: "/products", icon: Package },
  { label: "Analytics", path: "/analytics", icon: BarChart3 },
] as const;

// Mobile-only (lg:hidden) replacement for the Sidebar — the 4 highest-traffic sections get a
// direct tab, everything else lives behind "More" (see MoreMenuSheet). z-40, one below Modal's
// z-50, so any dialog/drawer still renders on top of this fixed bar.
export function MobileBottomNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const isMoreActive = !TABS.some((t) => location.pathname.startsWith(t.path));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-slate-200 bg-white/95 backdrop-blur-sm lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            className={({ isActive }) =>
              clsx(
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors",
                isActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-600",
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                {tab.label}
              </>
            )}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className={clsx(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors",
            isMoreActive ? "text-indigo-600" : "text-slate-400 hover:text-slate-600",
          )}
        >
          <Menu size={20} strokeWidth={isMoreActive ? 2.4 : 2} />
          More
        </button>
      </nav>
      <MoreMenuSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </>
  );
}
