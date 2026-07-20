import { NavLink } from "react-router-dom";
import { ArrowLeft, Globe, Palette, ShieldCheck, SlidersHorizontal } from "lucide-react";
import clsx from "clsx";

const SETTINGS_NAV = [
  { label: "General", path: "/settings/general", icon: SlidersHorizontal },
  { label: "Branding", path: "/settings/branding", icon: Palette },
  { label: "Store & Domain", path: "/settings/domain", icon: Globe },
  { label: "Security", path: "/settings/security", icon: ShieldCheck },
];

export function SettingsSidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4">
      <NavLink
        to="/home"
        className="mb-4 flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900"
      >
        <ArrowLeft size={16} />
        Back to workspace
      </NavLink>

      <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Settings</div>

      <nav className="flex-1 space-y-0.5">
        {SETTINGS_NAV.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              clsx(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                isActive ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon size={17} className={clsx("shrink-0", isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
