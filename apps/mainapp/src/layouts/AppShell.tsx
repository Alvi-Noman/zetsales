import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { MobileBottomNav } from '../components/layout/MobileBottomNav';

export function AppShell() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* pb-16 reserves space for the fixed MobileBottomNav below lg — otherwise it overlaps
            the last bit of scrollable content on every page. */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-16 lg:pb-0">
          <Outlet />
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
