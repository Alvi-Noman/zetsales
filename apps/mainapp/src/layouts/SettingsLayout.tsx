import { Outlet } from "react-router-dom";
import { SettingsSidebar } from "../components/settings/SettingsSidebar";

// A dedicated full-screen shell for Settings — replaces the main app Sidebar/Topbar entirely
// (rather than nesting Settings pages under the normal AppShell) so a genuinely large settings
// surface gets its own focused navigation instead of fighting for space in the main sidebar.
export function SettingsLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <SettingsSidebar />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
