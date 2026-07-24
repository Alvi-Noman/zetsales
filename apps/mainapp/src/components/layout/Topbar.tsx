import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, HelpCircle, LogOut } from 'lucide-react';
import type { NotificationDTO } from '@zetsales/shared';
import { useAuth } from '../../context/AuthContext';
import { Popover } from '../ui/Popover';
import { AppBlock } from '../apps/AppBlock';
import { listNotifications, markAllNotificationsRead } from '../../lib/notificationsApi';
import { relativeTime } from '../orders/time';

function initialsOf(text: string) {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

const NOTIFICATIONS_POLL_MS = 45_000;

export function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const load = () => {
      listNotifications()
        .then((res) => {
          setNotifications(res.notifications);
          setUnreadCount(res.unreadCount);
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, NOTIFICATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const handleBellOpen = (open: boolean) => {
    if (open && unreadCount > 0) {
      setUnreadCount(0);
      void markAllNotificationsRead();
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const label = user?.businessName || user?.email || '?';

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 lg:gap-4 lg:px-6">
      {/* Mobile-only: ZetSales logo + workspace name (Sidebar's own branding, otherwise invisible
          once the sidebar hides below lg). Back navigation lives next to each page's own heading
          instead (see MobileBackBar in AppShell) — not here, disconnected from the actual title. */}
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-500 to-violet-500 text-sm font-bold text-white shadow-sm shadow-indigo-500/30">
          Z
        </div>
        <span className="truncate text-[15px] font-bold leading-none tracking-tight text-slate-900">
          {user?.businessName || 'ZetSales'}
        </span>
      </div>

      <div className="relative hidden w-full max-w-md lg:block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search orders, products, customers..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-14 text-sm text-slate-700 placeholder-slate-400 outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/15"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
          Ctrl K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <AppBlock target="admin.topbar.block" />
        <button className="hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors sm:inline-flex">
          <HelpCircle size={18} />
        </button>
        <Popover
          align="right"
          widthClass="w-80"
          trigger={(open) => (
            <button
              onClick={() => {
                if (!open) handleBellOpen(true);
              }}
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </button>
          )}
        >
          <div className="py-1.5">
            <div className="border-b border-slate-100 px-3.5 py-2.5">
              <p className="text-sm font-semibold text-slate-800">Notifications</p>
            </div>
            {notifications.length === 0 ? (
              <p className="px-3.5 py-6 text-center text-xs text-slate-400">No notifications yet.</p>
            ) : (
              <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
                {notifications.map((n) => (
                  <li key={n.id} className="px-3.5 py-2.5">
                    <p className="text-sm font-medium text-slate-800">{n.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{n.body}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{relativeTime(n.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Popover>
        <Popover
          align="right"
          widthClass="w-56"
          trigger={() => (
            <div className="ml-1.5 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">
              {initialsOf(label)}
            </div>
          )}
        >
          {(close) => (
            <div className="py-1.5">
              <div className="border-b border-slate-100 px-3.5 py-2.5">
                <p className="truncate text-sm font-semibold text-slate-800">{user?.businessName ?? 'Your workspace'}</p>
                <p className="truncate text-xs text-slate-400">{user?.email}</p>
              </div>
              <button
                onClick={() => {
                  close();
                  void handleLogout();
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50"
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </Popover>
      </div>
    </header>
  );
}
